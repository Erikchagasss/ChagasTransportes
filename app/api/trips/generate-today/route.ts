import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

  const supabase=createServiceClient();
  const {data,error}=await supabase.rpc("ensure_daily_trips");
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  return handleGenerate(request);
}

// Vercel Cron faz GET por padrão
export async function GET(request: Request) {
  return handleGenerate(request);
}
