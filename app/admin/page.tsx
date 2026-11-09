import { createClient } from "@/lib/supabase/server";
import GenerateTripsButton from "./generate-trips-button";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: activeContracts },
    { count: totalEmployees },
    { data: tripsToday },
    { count: needsReview },
  ] = await Promise.all([
    supabase.from("contracts").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("trips").select("status, distance_km").eq("trip_date", today),
    supabase
      .from("contracts")
      .select("*", { count: "exact", head: true })
      .eq("needs_price_review", true),
  ]);

  const completed = tripsToday?.filter((t) => t.status === "completed").length ?? 0;
  const total = tripsToday?.length ?? 0;
  const kmToday = (tripsToday ?? [])
    .filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + (t.distance_km ?? 0), 0);

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="mb-6 text-2xl text-graphite-900">Visão geral</h1>

      <GenerateTripsButton />

      {!!needsReview && needsReview > 0 && (
        <a
          href="/admin/contracts"
          className="mb-6 block rounded-card border border-amber-500 bg-amber-500/10 p-4 text-sm font-medium text-amber-600"
        >
          {needsReview} contrato{needsReview > 1 ? "s" : ""} com valor desatualizado —
          mudança de endereço ou de funcionárias alterou a distância rodada. Ver em
          Contratos.
        </a>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Contratos ativos" value={activeContracts ?? 0} />
        <StatCard label="Funcionárias cadastradas" value={totalEmployees ?? 0} />
        <StatCard label="Corridas hoje" value={`${completed}/${total}`} />
        <StatCard label="Km rodados hoje" value={`${kmToday.toFixed(1)} km`} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-graphite-200 bg-white p-5">
      <p className="text-sm text-graphite-600">{label}</p>
      <p className="mt-1 text-3xl font-display font-semibold text-graphite-900">{value}</p>
    </div>
  );
}
