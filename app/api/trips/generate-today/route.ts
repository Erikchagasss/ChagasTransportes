import { operationalDate } from "@/lib/local-date";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { employeeWorksOnDate } from "@/lib/schedule";

/**
 * Gera as corridas (trips) do dia a partir das rotas ativas cujo
 * `weekdays` inclui o dia da semana de hoje. Cada rota gera DUAS
 * corridas por dia — "ida" (leva pro trabalho) e "volta" (busca no
 * trabalho e leva pra casa) — com a mesma lista de passageiras.
 * Idempotente: a constraint unique(route_id, trip_date, period)
 * garante que rodar duas vezes no mesmo dia não duplica nada.
 *
 * Cada funcionária só entra na corrida do dia se sua escala
 * (shift_type/work_weekdays ou 12x36) indicar que ela trabalha nessa
 * data específica — não basta estar na rota, tem que estar escalada
 * pra hoje. Se nenhuma funcionária da rota estiver escalada, a corrida
 * nem é criada (evita gerar corrida vazia pro motorista).
 *
 * Dois jeitos de chamar:
 * 1. Admin logado clicando em "Gerar corridas de hoje" no painel.
 * 2. Cron (Vercel Cron / n8n) mandando o header
 *    Authorization: Bearer <CRON_SECRET> — ver vercel.json.
 */
async function handleGenerate(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCron =
    !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // Service role: o cron não tem sessão de usuário, e mesmo o admin
  // precisa criar trips para motoristas (dono do registro), não para si.
  const supabase = createServiceClient();

  const todayStr = operationalDate();
  const today = new Date(`${todayStr}T12:00:00`);
  const weekday = today.getDay(); // 0=domingo...6=sábado, igual ao Postgres

  const { data: routes, error: routesError } = await supabase
    .from("routes")
    .select("id, name, contract_id, driver_id, weekdays, active")
    .eq("active", true)
    .contains("weekdays", [weekday]);

  if (routesError) {
    return NextResponse.json({ error: routesError.message }, { status: 500 });
  }

  // Log detalhado por rota — pra dar pra entender exatamente o que
  // aconteceu (ou não) com cada uma, em vez de só um número total.
  const routeResults: Array<{
    route_id: string;
    route_name: string;
    trips_created: string[];
    trips_already_existed: string[];
    scheduled_employees_today: number;
    reason_if_skipped?: string;
  }> = [];

  for (const route of routes ?? []) {
    const result = {
      route_id: route.id,
      route_name: route.name,
      trips_created: [] as string[],
      trips_already_existed: [] as string[],
      scheduled_employees_today: 0,
    } as (typeof routeResults)[number];

    if (!route.driver_id) {
      result.reason_if_skipped = "Rota sem motorista vinculado";
      routeResults.push(result);
      continue;
    }

    const { data: routeEmployees } = await supabase
      .from("route_employees")
      .select(
        "employee_id, pickup_order, employees!inner(active, shift_type, work_weekdays, shift_anchor_date)"
      )
      .eq("route_id", route.id)
      .eq("employees.active", true)
      .order("pickup_order");

    const scheduledToday = (routeEmployees ?? []).filter((re: any) =>
      employeeWorksOnDate(re.employees, today)
    );
    result.scheduled_employees_today = scheduledToday.length;

    if (scheduledToday.length === 0) {
      result.reason_if_skipped =
        (routeEmployees?.length ?? 0) === 0
          ? "Rota sem nenhuma funcionária vinculada"
          : "Nenhuma funcionária escalada pra hoje (todas de folga na escala configurada)";
      routeResults.push(result);
      continue;
    }

    for (const period of ["ida", "volta"] as const) {
      const { data: trip, error: tripError } = await supabase
        .from("trips")
        .insert({
          route_id: route.id,
          driver_id: route.driver_id,
          contract_id: route.contract_id,
          trip_date: todayStr,
          period,
          status: "planned",
        })
        .select()
        .single();

      if (tripError) {
        // 23505 = violação de unique — a corrida já existe pra esse período, ok pular
        if ((tripError as any).code === "23505") {
          result.trips_already_existed.push(period);
        }
        continue;
      }

      await supabase.from("trip_stops").insert(
        scheduledToday.map((re: any) => ({
          trip_id: trip.id,
          employee_id: re.employee_id,
          pickup_order: re.pickup_order,
          status: "pending",
        }))
      );

      result.trips_created.push(period);
    }

    routeResults.push(result);
  }

  return NextResponse.json({
    date: todayStr,
    routes_evaluated: routes?.length ?? 0,
    routes: routeResults,
  });
}

export async function POST(request: Request) {
  return handleGenerate(request);
}

// Vercel Cron faz GET por padrão
export async function GET(request: Request) {
  return handleGenerate(request);
}
