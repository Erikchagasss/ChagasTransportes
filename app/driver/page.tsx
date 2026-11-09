import { operationalDate } from "@/lib/local-date";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DriverHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = operationalDate();

  // RLS já garante que só voltam corridas deste motorista.
  const { data: trips } = await supabase
    .from("trips")
    .select(
      "id, trip_date, period, status, route_id, routes(name), contracts(company_name, company_logo_url, work_site_name)"
    )
    .eq("driver_id", user!.id)
    .eq("trip_date", today)
    .order("period", { ascending: true }); // ida antes de volta

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-xl text-graphite-900">Corridas de hoje</h1>

      {!trips || trips.length === 0 ? (
        <p className="rounded-card border border-dashed border-graphite-200 p-6 text-center text-sm text-graphite-600">
          Nenhuma corrida programada para hoje.
        </p>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip: any) => (
            <li key={trip.id}>
              <Link
                href={`/driver/trip/${trip.id}`}
                className="flex items-center justify-between rounded-card border border-graphite-200 bg-white p-4 shadow-sm active:scale-[0.99]"
              >
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
                    {trip.contracts?.work_site_name && (
                      <p className="text-xs text-amber-600">
                        Destino: {trip.contracts.work_site_name}
                      </p>
                    )}
                  </div>
                </div>
                <StatusBadge status={trip.status} />
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
