"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Contract, Profile, Route, Vehicle } from "@/types/database";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface RouteFormState {
  name: string;
  contract_id: string;
  driver_id: string;
  vehicle_id: string;
  weekdays: number[];
}

const EMPTY_FORM: RouteFormState = {
  name: "",
  contract_id: "",
  driver_id: "",
  vehicle_id: "",
  weekdays: [1, 2, 3, 4, 5],
};

export default function RoutesPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<(Route & { employee_count?: number })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RouteFormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RouteFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: contractsData } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "active");
    const { data: driversData } = await supabase
      .from("profiles")
      .select("*")
      .order("role", { ascending: false }) // 'driver' antes de 'admin' na lista
      .order("full_name");
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("active", true)
      .order("plate");
    const { data: routesData } = await supabase
      .from("routes")
      .select("*, route_employees(count)")
      .order("name");

    setContracts(contractsData ?? []);
    setDrivers(driversData ?? []);
    setVehicles(vehiclesData ?? []);
    setRoutes(
      (routesData ?? []).map((r: any) => ({
        ...r,
        employee_count: r.route_employees?.[0]?.count ?? 0,
      }))
    );
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleWeekday(day: number, target: "create" | "edit") {
    const setter = target === "create" ? setForm : setEditForm;
    setter((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort(),
    }));
  }

  async function createRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contract_id || !form.driver_id) return;

    await supabase.from("routes").insert({
      name: form.name,
      contract_id: form.contract_id,
      driver_id: form.driver_id,
      vehicle_id: form.vehicle_id || null,
      weekdays: form.weekdays,
      active: true,
    });

    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  function startEdit(r: Route) {
    setEditingId(r.id);
    setEditForm({
      name: r.name,
      contract_id: r.contract_id,
      driver_id: r.driver_id,
      vehicle_id: r.vehicle_id ?? "",
      weekdays: r.weekdays,
    });
  }

  async function saveEdit(routeId: string) {
    if (!editForm.driver_id) return;
    setSaving(true);
    await supabase
      .from("routes")
      .update({
        name: editForm.name,
        driver_id: editForm.driver_id,
        vehicle_id: editForm.vehicle_id || null,
        weekdays: editForm.weekdays,
      })
      .eq("id", routeId);
    setSaving(false);
    setEditingId(null);
    load();
  }

  async function toggleActive(r: Route) {
    await supabase.from("routes").update({ active: !r.active }).eq("id", r.id);
    load();
  }

  function contractName(id: string) {
    return contracts.find((c) => c.id === id)?.company_name ?? "—";
  }

  function driverName(id: string) {
    return drivers.find((d) => d.id === id)?.full_name ?? "—";
  }

  function vehicleName(id: string | null) {
    if (!id) return "Sem veículo vinculado";
    const v = vehicles.find((v) => v.id === id);
    return v ? `${v.plate}${v.model ? ` — ${v.model}` : ""}` : "—";
  }

  return (
    <div className="px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl text-graphite-900">Rotas</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950"
        >
          {showForm ? "Cancelar" : "Nova rota"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createRoute}
          className="mb-8 grid max-w-xl gap-4 rounded-card border border-graphite-200 bg-white p-5"
        >
          <input
            required
            placeholder="Nome da rota (ex: Rota Manhã - Zona Leste)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <select
            required
            value={form.contract_id}
            onChange={(e) => setForm({ ...form, contract_id: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          >
            <option value="">Selecionar contrato</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          <select
            required
            value={form.driver_id}
            onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          >
            <option value="">Selecionar motorista</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
                {d.role === "admin" ? " (admin)" : ""}
              </option>
            ))}
          </select>
          <select
            value={form.vehicle_id}
            onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          >
            <option value="">Selecionar veículo (opcional)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} {v.model ? `— ${v.model}` : ""}
              </option>
            ))}
          </select>
          <p className="-mt-2 text-xs text-graphite-600">
            Sem veículo, o cálculo de combustível e o repreço automático ficam
            inativos pra essa rota. Cadastre em &quot;Veículos&quot;.
          </p>

          <div>
            <p className="mb-2 text-sm text-graphite-600">Dias de operação</p>
            <div className="flex gap-2">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWeekday(i, "create")}
                  className={`h-9 w-11 rounded-card text-xs font-medium ${
                    form.weekdays.includes(i)
                      ? "bg-teal-500 text-white"
                      : "border border-graphite-200 text-graphite-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button className="rounded-card bg-graphite-950 py-2 text-white">Salvar rota</button>
        </form>
      )}

      <ul className="space-y-3">
        {routes.map((r) => (
          <li key={r.id} className="rounded-card border border-graphite-200 bg-white p-4">
            {editingId === r.id ? (
              <div className="space-y-3">
                <p className="text-xs text-graphite-600">
                  Contrato: {contractName(r.contract_id)} (não muda na edição — crie uma
                  rota nova se precisar trocar de contrato)
                </p>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                  placeholder="Nome da rota"
                />
                <select
                  value={editForm.driver_id}
                  onChange={(e) => setEditForm({ ...editForm, driver_id: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                >
                  <option value="">Selecionar motorista</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                      {d.role === "admin" ? " (admin)" : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={editForm.vehicle_id}
                  onChange={(e) => setEditForm({ ...editForm, vehicle_id: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                >
                  <option value="">Sem veículo vinculado</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} {v.model ? `— ${v.model}` : ""}
                    </option>
                  ))}
                </select>
                <div>
                  <p className="mb-2 text-xs text-graphite-600">Dias de operação</p>
                  <div className="flex gap-2">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleWeekday(i, "edit")}
                        className={`h-9 w-11 rounded-card text-xs font-medium ${
                          editForm.weekdays.includes(i)
                            ? "bg-teal-500 text-white"
                            : "border border-graphite-200 text-graphite-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(r.id)}
                    disabled={saving}
                    className="rounded-card bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-card border border-graphite-200 px-4 py-2 text-sm text-graphite-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Link href={`/admin/routes/${r.id}`} className="min-w-0 flex-1">
                  <p className="font-medium text-graphite-900 hover:underline">
                    {r.name}
                    {!r.active && (
                      <span className="ml-2 rounded-full bg-mist-200 px-2 py-0.5 text-xs text-graphite-700">
                        Inativa
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-graphite-600">
                    {contractName(r.contract_id)} · {driverName(r.driver_id)}
                  </p>
                  <p className="text-xs text-graphite-600">{vehicleName(r.vehicle_id)}</p>
                  <p className="mt-1 text-xs text-graphite-600">
                    {r.weekdays.map((d) => WEEKDAY_LABELS[d]).join(", ")}
                  </p>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded-full bg-mist-200 px-3 py-1 text-xs text-graphite-700">
                    {r.employee_count} funcionária{r.employee_count === 1 ? "" : "s"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded-card border border-graphite-200 px-3 py-1.5 text-xs font-medium text-graphite-700 hover:border-amber-500"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      className="rounded-card border border-graphite-200 px-3 py-1.5 text-xs font-medium text-graphite-700"
                    >
                      {r.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
        {routes.length === 0 && (
          <p className="text-sm text-graphite-600">Nenhuma rota criada ainda.</p>
        )}
      </ul>
    </div>
  );
}
