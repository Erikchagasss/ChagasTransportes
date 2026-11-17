import { operationalDate } from "@/lib/local-date";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { nextActionableTrip, orderedDailyTrips, tripScheduleTime } from "@/lib/guided-trip";

export const dynamic = "force-dynamic";

export default async function DriverHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = operationalDate();
  if(!user) redirect("/login");
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(profile?.role !== "driver") redirect(profile?.role === "admin" ? "/admin" : "/login");
  const {error:generationError}=await supabase.rpc("ensure_daily_trips",{p_driver_id:user.id});

  // RLS já garante que só voltam corridas deste motorista.
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select(
      "id, trip_date, period, status, scheduled_time, route_id, routes(name), contracts(company_name, company_logo_url, work_site_name), trip_stops(id, employee_name, status, dropped_off_at, scheduled_start, scheduled_end)"
    )
    .eq("driver_id", user.id)
    .eq("trip_date", today)
    .neq("status", "cancelled")
    .order("period", { ascending: true }); // ida antes de volta

  const orderedTrips=orderedDailyTrips(trips || []);
  // A relação do Supabase pode vir tipada como array apesar de cada corrida ter um único contrato/rota.
  const nextTrip:any=nextActionableTrip(orderedTrips);
  const actionableTrips=orderedTrips.filter(trip=>trip.status === "in_progress" || trip.status === "planned");
  const laterTrips=Math.max(0,actionableTrips.length-(nextTrip ? 1 : 0));
  const sameTimeTrips=nextTrip
    ? actionableTrips.filter(trip=>trip.id !== nextTrip.id && tripScheduleTime(trip) === tripScheduleTime(nextTrip)).length
    : 0;

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold text-graphite-900">{nextTrip?.status === "in_progress" ? "Corrida em andamento" : "Sua próxima corrida"}</h1>
      <p className="mb-3 mt-2 text-sm text-graphite-600">Aqui aparece somente a corrida que você deve fazer agora. Ao concluí-la, a próxima do horário será exibida automaticamente.</p>
      <p className="mb-6 text-xs text-graphite-600">Na ida, o horário informado é o de chegada à empresa. Comece as buscas antes, considerando o percurso.</p>
      <p className="mb-4 text-sm text-graphite-600">{today.split("-").reverse().join("/")} · Corridas atribuídas a você conforme a escala.</p>
      {(generationError || tripsError) && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">Não foi possível atualizar todas as corridas de hoje. Recarregue a página para tentar novamente.{tripsError ? " A lista não está disponível no momento." : " As corridas já carregadas aparecem abaixo."}</p>}

      {tripsError ? null : !trips || trips.length === 0 ? (
        <p className="rounded-card border border-dashed border-graphite-200 p-6 text-center text-sm text-graphite-600">
          {generationError ? "Aguardando atualização das corridas." : "Você não tem viagens programadas para hoje. Confira Minhas rotas ou peça ao administrador para conferir os vínculos e a escala."}
        </p>
      ) : !nextTrip ? (
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
          <p className="text-lg font-semibold text-teal-900">Todas as corridas de hoje foram concluídas.</p>
          <p className="mt-2 text-sm text-teal-800">Você registrou {orderedTrips.filter(trip=>trip.status === "completed").length} corrida(s) concluída(s).</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-teal-500 bg-white p-5 shadow-sm ring-1 ring-teal-500">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{nextTrip.status === "in_progress" ? "Faça esta corrida agora" : "Próxima da sua agenda"}</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-graphite-950">{tripScheduleTime(nextTrip)?.slice(0,5) || "Sem horário"}</p>
            </div>
            <div className="flex flex-col items-end gap-2"><PeriodBadge period={nextTrip.period} /><StatusBadge status={nextTrip.status} /></div>
          </div>
          <div className="mt-5 flex items-center gap-3">
            {nextTrip.contracts?.company_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={nextTrip.contracts.company_logo_url} alt={nextTrip.contracts.company_name} className="h-11 w-11 shrink-0 rounded-card border border-graphite-200 bg-white object-contain" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-mist-200 text-xs text-graphite-600">{nextTrip.contracts?.company_name?.slice(0,2).toUpperCase() ?? "—"}</div>
            )}
            <div>
              <p className="font-semibold text-graphite-950">{nextTrip.routes?.name}</p>
              <p className="text-sm text-graphite-600">{nextTrip.contracts?.company_name}</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-mist-50 p-4 text-sm text-graphite-700">
            <p><span className="font-semibold">{nextTrip.period === "ida" ? "Entrada na empresa" : "Saída da empresa"}:</span> {tripScheduleTime(nextTrip)?.slice(0,5) || "Horário ainda não cadastrado"}</p>
            <p className="mt-1">{nextTrip.trip_stops?.length ?? 0} passageira(s) nesta corrida</p>
            {nextTrip.contracts?.work_site_name && <p className="mt-1 text-amber-700">Destino: {nextTrip.contracts.work_site_name}</p>}
          </div>
          {sameTimeTrips > 0 && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Há mais {sameTimeTrips} corrida(s) atribuída(s) neste mesmo horário. Esta é a primeira da sequência.</p>}
          <Link href={`/driver/trip/${nextTrip.id}`} className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-center font-semibold text-white active:bg-teal-800">
            {nextTrip.status === "in_progress" ? "Continuar corrida" : "Abrir e iniciar corrida"} →
          </Link>
          {laterTrips > 0 && <p className="mt-4 text-center text-xs text-graphite-600">Ao concluir esta corrida, a próxima aparecerá aqui automaticamente.</p>}
        </section>
      )}
    </div>
  );
}

function PeriodBadge({ period }: { period: string }) {
  const isIda = period === "ida";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        isIda ? "bg-graphite-950 text-white" : "bg-graphite-700 text-white"
      }`}
    >
      {isIda ? "Ida" : "Volta"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    planned: { label: "A iniciar", className: "bg-mist-200 text-graphite-700" },
    in_progress: { label: "Em andamento", className: "bg-amber-500/15 text-amber-600" },
    completed: { label: "Concluída", className: "bg-teal-500/15 text-teal-600" },
    cancelled: { label: "Cancelada", className: "bg-danger-500/15 text-danger-500" },
  };
  const s = map[status] ?? map.planned;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
