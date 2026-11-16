import { operationalDate } from "@/lib/local-date";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { orderedDailyTrips, tripScheduleTime } from "@/lib/guided-trip";

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
  const nextTrip=orderedTrips.find(t=>t.status === "in_progress" || t.status === "planned");

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold text-graphite-900">Suas viagens de hoje</h1>
      <p className="mb-3 mt-2 text-sm text-graphite-600">Siga a próxima corrida em destaque. As viagens estão organizadas pelo horário de entrada ou saída na empresa.</p>
      <p className="mb-6 text-xs text-graphite-600">Na ida, o horário é o de chegada à empresa: inicie as buscas antes, considerando o percurso.</p>
      <p className="mb-4 text-sm text-graphite-600">{today.split("-").reverse().join("/")} · Viagens atribuídas a você, conforme os dias da rota e a escala das passageiras.</p>
      {!tripsError && <p className="mb-4 text-sm font-medium">{orderedTrips.filter(t=>t.status === "planned").length} a iniciar · {orderedTrips.filter(t=>t.status === "in_progress").length} em andamento · {orderedTrips.filter(t=>t.status === "completed").length} concluída(s)</p>}
      {(generationError || tripsError) && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">Não foi possível atualizar todas as corridas de hoje. Recarregue a página para tentar novamente.{tripsError ? " A lista não está disponível no momento." : " As corridas já carregadas aparecem abaixo."}</p>}

      {tripsError ? null : !trips || trips.length === 0 ? (
        <p className="rounded-card border border-dashed border-graphite-200 p-6 text-center text-sm text-graphite-600">
          {generationError ? "Aguardando atualização das corridas." : "Você não tem viagens programadas para hoje. Confira Minhas rotas ou peça ao administrador para conferir os vínculos e a escala."}
        </p>
      ) : (
        <ul className="space-y-3">
          {orderedTrips.map((trip: any) => (
            <li key={trip.id}>
              <Link
                href={`/driver/trip/${trip.id}`}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 active:bg-mist-50 ${trip.id === nextTrip?.id ? "border-teal-500 ring-1 ring-teal-500" : "border-graphite-200"}`}
              >
                <div className="flex w-full items-center justify-between gap-3"><p className="text-2xl font-semibold text-graphite-950">{tripScheduleTime(trip)?.slice(0,5) || "Sem horário"}</p>{trip.id === nextTrip?.id && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{trip.status === "in_progress" ? "Continuar agora" : "Próxima corrida"}</span>}</div>
                <div className="flex items-center gap-3">
                  {trip.contracts?.company_logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={trip.contracts.company_logo_url}
                      alt={trip.contracts.company_name}
                      className="h-10 w-10 shrink-0 rounded-card border border-graphite-200 bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-mist-200 text-xs text-graphite-600">
                      {trip.contracts?.company_name?.slice(0, 2).toUpperCase() ?? "—"}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <PeriodBadge period={trip.period} />
                      <p className="font-medium text-graphite-900">{trip.routes?.name}</p>
                    </div>
                    <p className="text-sm text-graphite-600">{trip.contracts?.company_name}</p>
                    <p className="mt-1 text-sm text-graphite-700">{trip.period === "ida" ? "Entrada na empresa" : "Saída da empresa"}: {tripScheduleTime(trip)?.slice(0,5) || "Peça ao administrador para cadastrar o horário"}</p>
                    <p className="mt-1 text-sm text-graphite-600">{(trip.trip_stops || []).map((s:{employee_name:string|null})=>s.employee_name || "Passageira").join(", ")}</p>
                    {trip.contracts?.work_site_name && (
                      <p className="text-xs text-amber-600">
                        Destino: {trip.contracts.work_site_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2"><StatusBadge status={trip.status} /><p className="text-xs text-graphite-600">{trip.trip_stops?.length ?? 0} passageira(s)</p></div>
                <div className="flex w-full items-center justify-between border-t border-graphite-200 pt-3 text-sm"><span className="text-graphite-600">{(trip.trip_stops ?? []).filter((s: {status:string;dropped_off_at:string|null})=>s.status === "boarded" && !!s.dropped_off_at).length} entrega(s) confirmada(s)</span><span className="font-semibold text-teal-700">{trip.status === "in_progress" ? "Continuar viagem" : trip.status === "planned" ? "Ver paradas" : "Ver registros"} →</span></div>
              </Link>
            </li>
          ))}
        </ul>
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
