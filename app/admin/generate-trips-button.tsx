"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RouteResult {
  route_id: string;
  route_name: string;
  trips_created: string[];
  trips_already_existed: string[];
  scheduled_employees_today: number;
  reason_if_skipped?: string;
}

export default function GenerateTripsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteResult[] | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setRoutes(null);
    try {
      const res = await fetch("/api/trips/generate-today", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao gerar corridas.");
      } else {
        setRoutes(data.routes ?? []);
        router.refresh();
      }
    } catch {
      setError("Falha ao gerar corridas.");
    }
    setLoading(false);
  }

  return (
    <div className="mb-6">
      <button
        onClick={generate}
        disabled={loading}
        className="rounded-card border border-graphite-200 bg-white px-4 py-2 text-sm font-medium text-graphite-700 hover:border-amber-500 disabled:opacity-50"
      >
        {loading ? "Gerando..." : "Gerar corridas de hoje"}
      </button>

      {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}

      {routes && routes.length === 0 && (
        <p className="mt-2 text-xs text-graphite-600">
          Nenhuma rota ativa cadastrada com hoje marcado como dia de operação.
        </p>
      )}

      {routes && routes.length > 0 && (
        <div className="mt-3 space-y-2">
          {routes.map((r) => (
            <div
              key={r.route_id}
              className={`rounded-card border px-3 py-2 text-xs ${
                r.reason_if_skipped
                  ? "border-danger-500 bg-danger-500/5"
                  : "border-teal-500 bg-teal-500/5"
              }`}
            >
              <p className="font-medium text-graphite-900">{r.route_name}</p>
              {r.reason_if_skipped ? (
                <p className="text-danger-500">⚠ {r.reason_if_skipped}</p>
              ) : (
                <p className="text-graphite-700">
                  {r.trips_created.length > 0 &&
                    `Criadas: ${r.trips_created.join(" e ")} · `}
                  {r.trips_already_existed.length > 0 &&
                    `Já existiam: ${r.trips_already_existed.join(" e ")} · `}
                  {r.scheduled_employees_today} funcionária(s) escalada(s) hoje
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
