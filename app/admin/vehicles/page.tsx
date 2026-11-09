"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Vehicle } from "@/types/database";

const EMPTY_FORM = {
  plate: "",
  model: "",
  km_per_liter: "10",
  fuel_price: "6.00",
  monthly_depreciation: "400",
  driver_id: "",
};

export default function VehiclesPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: vehiclesData } = await supabase.from("vehicles").select("*").order("plate");
    const { data: driversData } = await supabase
      .from("profiles")
      .select("*")
      .order("role", { ascending: false })
      .order("full_name");
    setVehicles(vehiclesData ?? []);
    setDrivers(driversData ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function driverName(id: string | null) {
    if (!id) return "Sem motorista vinculado";
    return drivers.find((d) => d.id === id)?.full_name ?? "—";
  }

  async function createVehicle(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("vehicles").insert({
      plate: form.plate,
      model: form.model || null,
      km_per_liter: Number(form.km_per_liter),
      fuel_price: Number(form.fuel_price),
      monthly_depreciation: Number(form.monthly_depreciation),
      driver_id: form.driver_id || null,
      active: true,
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  function startEdit(v: Vehicle) {
    setEditingId(v.id);
    setEditForm({
      plate: v.plate,
      model: v.model ?? "",
      km_per_liter: String(v.km_per_liter),
      fuel_price: String(v.fuel_price),
      monthly_depreciation: String(v.monthly_depreciation),
      driver_id: v.driver_id ?? "",
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await supabase
      .from("vehicles")
      .update({
        plate: editForm.plate,
        model: editForm.model || null,
        km_per_liter: Number(editForm.km_per_liter),
        fuel_price: Number(editForm.fuel_price),
        monthly_depreciation: Number(editForm.monthly_depreciation),
        driver_id: editForm.driver_id || null,
      })
      .eq("id", id);
    setSaving(false);
    setEditingId(null);
    load();
  }

  async function toggleActive(v: Vehicle) {
    await supabase.from("vehicles").update({ active: !v.active }).eq("id", v.id);
    load();
  }

  return (
    <div className="px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl text-graphite-900">Veículos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950"
        >
          {showForm ? "Cancelar" : "Novo veículo"}
        </button>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-graphite-600">
        Vincule um veículo a um contrato (na edição do contrato) pra alimentar o
        cálculo de combustível nas corridas e o repreço automático.
      </p>

      {showForm && (
        <form
          onSubmit={createVehicle}
          className="mb-8 grid max-w-xl gap-4 rounded-card border border-graphite-200 bg-white p-5"
        >
          <input
            required
            placeholder="Placa"
            value={form.plate}
            onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <input
            placeholder="Modelo (opcional)"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-graphite-600">Km/l</span>
              <input
                required
                type="number"
                step="0.1"
                value={form.km_per_liter}
                onChange={(e) => setForm({ ...form, km_per_liter: e.target.value })}
                className="w-full rounded-card border border-graphite-200 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-graphite-600">R$/litro</span>
              <input
                required
                type="number"
                step="0.01"
                value={form.fuel_price}
                onChange={(e) => setForm({ ...form, fuel_price: e.target.value })}
                className="w-full rounded-card border border-graphite-200 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-graphite-600">Depreciação/mês</span>
              <input
                required
                type="number"
                value={form.monthly_depreciation}
                onChange={(e) => setForm({ ...form, monthly_depreciation: e.target.value })}
                className="w-full rounded-card border border-graphite-200 px-3 py-2"
              />
            </label>
          </div>
          <select
            value={form.driver_id}
            onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          >
            <option value="">Sem motorista vinculado</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}{d.role === "admin" ? " (admin)" : ""}
              </option>
            ))}
          </select>
          <button className="rounded-card bg-graphite-950 py-2 text-white">
            Salvar veículo
          </button>
        </form>
      )}

      <ul className="space-y-3">
        {vehicles.map((v) => (
          <li key={v.id} className="rounded-card border border-graphite-200 bg-white p-4">
            {editingId === v.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={editForm.plate}
                    onChange={(e) => setEditForm({ ...editForm, plate: e.target.value.toUpperCase() })}
                    className="rounded-card border border-graphite-200 px-3 py-2"
                    placeholder="Placa"
                  />
                  <input
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                    className="rounded-card border border-graphite-200 px-3 py-2"
                    placeholder="Modelo"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.km_per_liter}
                    onChange={(e) => setEditForm({ ...editForm, km_per_liter: e.target.value })}
                    className="rounded-card border border-graphite-200 px-3 py-2"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.fuel_price}
                    onChange={(e) => setEditForm({ ...editForm, fuel_price: e.target.value })}
                    className="rounded-card border border-graphite-200 px-3 py-2"
                  />
                  <input
                    type="number"
                    value={editForm.monthly_depreciation}
                    onChange={(e) =>
                      setEditForm({ ...editForm, monthly_depreciation: e.target.value })
                    }
                    className="rounded-card border border-graphite-200 px-3 py-2"
                  />
                </div>
                <select
                  value={editForm.driver_id}
                  onChange={(e) => setEditForm({ ...editForm, driver_id: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                >
                  <option value="">Sem motorista vinculado</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}{d.role === "admin" ? " (admin)" : ""}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(v.id)}
                    disabled={saving}
                    className="rounded-card bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar"}
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-graphite-900">
                    {v.plate} {v.model && `— ${v.model}`}
                  </p>
                  <p className="text-sm text-graphite-600">
                    {v.km_per_liter} km/l · R$ {v.fuel_price}/l · Depreciação R${" "}
                    {v.monthly_depreciation}/mês
                  </p>
                  <p className="text-xs text-graphite-600">{driverName(v.driver_id)}</p>
                  {!v.active && (
                    <span className="mt-1 inline-block rounded-full bg-graphite-200 px-2 py-0.5 text-xs text-graphite-700">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(v)}
                    className="rounded-card border border-graphite-200 px-3 py-1.5 text-xs font-medium text-graphite-700 hover:border-amber-500"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(v)}
                    className="rounded-card border border-graphite-200 px-3 py-1.5 text-xs font-medium text-graphite-700"
                  >
                    {v.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {vehicles.length === 0 && (
          <p className="text-sm text-graphite-600">Nenhum veículo cadastrado ainda.</p>
        )}
      </ul>
    </div>
  );
}
