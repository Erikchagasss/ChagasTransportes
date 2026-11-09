"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Route } from "@/types/database";

interface RouteEmployeeRow {
  id: string;
  employee_id: string;
  pickup_order: number;
  employees: Employee;
}

export default function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [route, setRoute] = useState<Route | null>(null);
  const [assigned, setAssigned] = useState<RouteEmployeeRow[]>([]);
  const [available, setAvailable] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data: routeData } = await supabase.from("routes").select("*").eq("id", routeId).single();
    if (!routeData) {
      setLoading(false);
      return;
    }
    setRoute(routeData);

    const { data: assignedData } = await supabase
      .from("route_employees")
      .select("id, employee_id, pickup_order, employees(*)")
      .eq("route_id", routeId)
      .order("pickup_order");

    const { data: allEmployees } = await supabase
      .from("employees")
      .select("*")
      .eq("contract_id", routeData.contract_id)
      .eq("active", true)
      .order("full_name");

    const assignedRows = (assignedData as unknown as RouteEmployeeRow[]) ?? [];
    const assignedIds = new Set(assignedRows.map((r) => r.employee_id));

    setAssigned(assignedRows);
    setAvailable((allEmployees ?? []).filter((e) => !assignedIds.has(e.id)));
    setLoading(false);
  }, [supabase, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addEmployee(employeeId: string) {
    const nextOrder = assigned.length > 0 ? Math.max(...assigned.map((a) => a.pickup_order)) + 1 : 0;
    await supabase.from("route_employees").insert({
      route_id: routeId,
      employee_id: employeeId,
      pickup_order: nextOrder,
    });
    load();
  }

  async function removeEmployee(routeEmployeeId: string) {
    await supabase.from("route_employees").delete().eq("id", routeEmployeeId);
    load();
  }

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= assigned.length) return;

    const a = assigned[index];
    const b = assigned[targetIndex];

    await Promise.all([
      supabase.from("route_employees").update({ pickup_order: b.pickup_order }).eq("id", a.id),
      supabase.from("route_employees").update({ pickup_order: a.pickup_order }).eq("id", b.id),
    ]);
    load();
  }

  async function deleteRoute() {
    if (!confirm("Excluir esta rota? As corridas já geradas não são apagadas.")) return;
    setDeleting(true);
    await supabase.from("routes").delete().eq("id", routeId);
    router.push("/admin/routes");
  }

  if (loading) return <p className="p-8 text-graphite-600">Carregando...</p>;
  if (!route) return <p className="p-8 text-graphite-600">Rota não encontrada.</p>;

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl text-graphite-900">{route.name}</h1>
      <p className="mb-6 text-sm text-graphite-600">
        Ordem de embarque — a rota do dia será gerada nessa sequência.
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-graphite-600">
            Passageiras na rota ({assigned.length})
          </h2>
          <ul className="space-y-2">
            {assigned.map((a, i) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-card border border-graphite-200 bg-white p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite-950 text-xs text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-graphite-900">{a.employees.full_name}</p>
                  <p className="text-xs text-graphite-600">{a.employees.address}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded-card border border-graphite-200 px-2 py-1 text-xs disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === assigned.length - 1}
                    className="rounded-card border border-graphite-200 px-2 py-1 text-xs disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeEmployee(a.id)}
                    className="rounded-card border border-graphite-200 px-2 py-1 text-xs text-danger-500"
                    aria-label="Remover da rota"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
            {assigned.length === 0 && (
              <p className="text-sm text-graphite-600">Nenhuma passageira na rota ainda.</p>
            )}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-graphite-600">
            Disponíveis no contrato ({available.length})
          </h2>
          <ul className="space-y-2">
            {available.map((emp) => (
              <li
                key={emp.id}
                className="flex items-center justify-between rounded-card border border-graphite-200 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium text-graphite-900">{emp.full_name}</p>
                  <p className="text-xs text-graphite-600">{emp.address}</p>
                </div>
                <button
                  onClick={() => addEmployee(emp.id)}
                  className="rounded-card bg-amber-500 px-3 py-1.5 text-xs font-medium text-graphite-950"
                >
                  Adicionar
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-graphite-600">
                Todas as funcionárias ativas do contrato já estão na rota.
              </p>
            )}
          </ul>
        </section>
      </div>

      <button
        onClick={deleteRoute}
        disabled={deleting}
        className="mt-10 text-sm text-danger-500 underline disabled:opacity-50"
      >
        Excluir rota
      </button>
    </div>
  );
}
