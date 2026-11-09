import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateRouteDistance } from "@/lib/distance";
import { daysPerMonthForEmployee } from "@/lib/work-days";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama calculateRouteDistance com uma segunda tentativa se a primeira
 * falhar — a falha mais comum é rate limit (429) mesmo já respeitando o
 * intervalo entre chamadas, então vale tentar de novo com uma espera
 * maior antes de desistir e cair no fallback de linha reta.
 */
async function calculateRouteDistanceWithRetry(
  stops: Parameters<typeof calculateRouteDistance>[0]
) {
  const first = await calculateRouteDistance(stops);
  if (first) return first;

  await sleep(1200);
  return calculateRouteDistance(stops);
}

function calculateHaversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const r1 = (a.lat * Math.PI) / 180;
  const r2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Recalcula a distância mensal do contrato com o mesmo método de uma
 * planilha de custo feita à mão: pra cada funcionária ativa (agora via
 * a ROTA dela, não solta), calcula a distância real de ida (casa →
 * destino) e de volta (destino → casa) separadamente, multiplica pelos
 * dias que ELA trabalha no mês (escala fixa ou 12x36), e soma.
 *
 * O custo de combustível/depreciação usa o veículo DA ROTA de cada
 * funcionária — um contrato pode ter várias vans diferentes, cada
 * rota com a sua.
 *
 * Diferente do gatilho automático no banco (que usa linha reta e reage
 * instantaneamente a qualquer mudança), esta rota faz chamadas reais à
 * API de rotas — por isso é sob demanda (botão), não automática.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const { contractId } = await params;
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

  const { data: contract } = await supabase
    .from("contracts")
    .select(
      "id, monthly_value, work_site_lat, work_site_lng, company_lat, company_lng, driver_pct, tax_pct, margin_pct, other_fixed_costs, work_days_per_month"
    )
    .eq("id", contractId)
    .single();

  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const destLat = contract.work_site_lat ?? contract.company_lat;
  const destLng = contract.work_site_lng ?? contract.company_lng;

  if (destLat == null || destLng == null) {
    return NextResponse.json(
      { error: "Contratante (ou destino) ainda sem geocode — geocodifique o endereço primeiro." },
      { status: 422 }
    );
  }

  const { data: routes } = await supabase
    .from("routes")
    .select("id, name, vehicle_id")
    .eq("contract_id", contractId)
    .eq("active", true);

  if (!routes || routes.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma rota ativa cadastrada pra esse contrato ainda." },
      { status: 422 }
    );
  }

  let totalMonthlyKm = 0;
  let totalFuelCost = 0;
  let totalDepreciation = 0;
  let anyFlagged = false;
  const breakdown: Array<{
    name: string;
    route: string;
    idaKm: number | null;
    voltaKm: number | null;
    flagged: boolean;
    daysPerMonth: number;
    monthlyKm: number;
  }> = [];

  for (const route of routes) {
    let vehicle: { km_per_liter: number; fuel_price: number; monthly_depreciation: number } | null =
      null;
    if (route.vehicle_id) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("km_per_liter, fuel_price, monthly_depreciation")
        .eq("id", route.vehicle_id)
        .single();
      vehicle = v;
      if (vehicle) totalDepreciation += vehicle.monthly_depreciation ?? 0;
    }

    const { data: routeEmployees } = await supabase
      .from("route_employees")
      .select(
        "employees!inner(id, full_name, active, address_lat, address_lng, shift_type, work_weekdays)"
      )
      .eq("route_id", route.id)
      .eq("employees.active", true);

    const geocoded = (routeEmployees ?? [])
      .map((re: any) => re.employees)
      .filter((e: any) => e.address_lat != null && e.address_lng != null);

    for (const emp of geocoded) {
      const empPoint = { lat: emp.address_lat!, lng: emp.address_lng! };
      const destPoint = { lat: destLat, lng: destLng };

      const straightLineOneWay = calculateHaversine(empPoint, destPoint);
      const straightLineFallback = straightLineOneWay * 1.4;

      // A LocationIQ no plano grátis limita a 2 requisições/segundo — chama
      // uma de cada vez, com um respiro entre elas.
      const idaRoute = await calculateRouteDistanceWithRetry([empPoint, destPoint]);
      await sleep(600);
      const voltaRoute = await calculateRouteDistanceWithRetry([destPoint, empPoint]);
      await sleep(600);

      // Trava de sanidade: se a rota real vier muito maior que a linha reta
      // esperada, provavelmente o roteador "grudou" num ponto mal
      // conectado no mapa (marco de rodovia, zona rural) — não confia,
      // cai pro fallback em vez de aceitar um número absurdo.
      const MAX_PLAUSIBLE_RATIO = 3;
      const idaPlausible =
        idaRoute && idaRoute.distanceKm <= straightLineOneWay * MAX_PLAUSIBLE_RATIO;
      const voltaPlausible =
        voltaRoute && voltaRoute.distanceKm <= straightLineOneWay * MAX_PLAUSIBLE_RATIO;

      const idaKm = idaPlausible ? idaRoute!.distanceKm : straightLineFallback;
      const voltaKm = voltaPlausible ? voltaRoute!.distanceKm : straightLineFallback;
      const days = daysPerMonthForEmployee(emp);
      const monthlyKm = (idaKm + voltaKm) * days;

      totalMonthlyKm += monthlyKm;
      if (vehicle && vehicle.km_per_liter > 0) {
        totalFuelCost += (monthlyKm / vehicle.km_per_liter) * vehicle.fuel_price;
      }

      const flagged = !idaPlausible || !voltaPlausible;
      if (flagged) anyFlagged = true;
      breakdown.push({
        name: emp.full_name,
        route: route.name,
        idaKm: idaPlausible ? idaRoute!.distanceKm : null,
        voltaKm: voltaPlausible ? voltaRoute!.distanceKm : null,
        flagged,
        daysPerMonth: Number(days.toFixed(1)),
        monthlyKm: Number(monthlyKm.toFixed(1)),
      });
    }
  }

  const directCost = totalFuelCost + totalDepreciation + (contract.other_fixed_costs ?? 0);
  const denominator =
    1 - (contract.driver_pct ?? 0) - (contract.tax_pct ?? 0) - (contract.margin_pct ?? 0.15);

  let suggestedMonthlyValue: number | null = null;
  let variancePct: number | null = null;
  let needsReview = false;

  if (denominator > 0) {
    suggestedMonthlyValue = directCost / denominator;
    variancePct =
      contract.monthly_value > 0
        ? (suggestedMonthlyValue - contract.monthly_value) / contract.monthly_value
        : null;
    needsReview = variancePct != null && Math.abs(variancePct) > 0.05;
  } else {
    needsReview = true;
  }

  // work_days_per_month do contrato aqui vira só um "equivalente diário"
  // pra manter os outros lugares do app que exibem km/dia funcionando —
  // o número que manda de verdade agora é o total mensal calculado acima.
  const workDays = contract.work_days_per_month || 22;

  await supabase
    .from("contracts")
    .update({
      current_estimated_distance_km: Number((totalMonthlyKm / workDays).toFixed(2)),
      suggested_monthly_value: suggestedMonthlyValue,
      value_variance_pct: variancePct,
      needs_price_review: needsReview,
    })
    .eq("id", contractId);

  return NextResponse.json({
    totalMonthlyKm: Number(totalMonthlyKm.toFixed(1)),
    suggestedMonthlyValue,
    variancePct,
    breakdown,
    anyFlagged,
  });
}
