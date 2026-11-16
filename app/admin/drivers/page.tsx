"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function DriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(
    null
  );

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    cpf: "",
    password: generatePassword(),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", phone: "", cpf: "" });

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [resetResultId, setResetResultId] = useState<{ id: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("role", "driver").order("full_name");
    setDrivers(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function createDriver(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Falha ao criar motorista.");
      setSaving(false);
      return;
    }

    setCreatedCredentials({ email: form.email, password: form.password });
    setForm({ full_name: "", email: "", phone: "", cpf: "", password: generatePassword() });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function removeDriver(driverId: string, name: string) {
    if (!confirm(`Remover ${name}? Isso apaga o acesso dele ao app.`)) return;
    await fetch("/api/admin/drivers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId }),
    });
    load();
  }

  function startEdit(d: Profile) {
    setEditingId(d.id);
    setEditForm({ full_name: d.full_name, phone: d.phone ?? "", cpf: d.cpf ?? "" });
    setResettingId(null);
  }

  async function saveEdit(driverId: string) {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ full_name: editForm.full_name, phone: editForm.phone || null, cpf: editForm.cpf || null })
      .eq("id", driverId);
    setSaving(false);
    setEditingId(null);
    load();
  }

  function startReset(driverId: string) {
    setResettingId(driverId);
    setEditingId(null);
    setNewPassword(generatePassword());
    setResetResultId(null);
  }

  async function confirmReset(driverId: string) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/drivers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId, newPassword }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Falha ao resetar senha.");
      return;
    }

    setResettingId(null);
    setResetResultId({ id: driverId, password: newPassword });
  }

  return (
    <div className="px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl text-graphite-900">Motoristas</h1>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setCreatedCredentials(null);
          }}
          className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950"
        >
          {showForm ? "Cancelar" : "Novo motorista"}
        </button>
      </div>

      <a href="/admin/payroll" className="mb-6 block rounded-card border border-teal-500 bg-white p-4 text-sm text-teal-700">Cadastrar salários fixos e acompanhar km, corridas e rotas por motorista →</a>

      {createdCredentials && (
        <div className="mb-6 rounded-card border border-teal-500 bg-teal-500/10 p-4">
          <p className="mb-2 text-sm font-medium text-teal-600">
            Motorista criado — envie esses dados de acesso pra ele agora, essa senha não
            fica visível de novo:
          </p>
          <p className="font-mono text-sm text-graphite-900">E-mail: {createdCredentials.email}</p>
          <p className="font-mono text-sm text-graphite-900">Senha: {createdCredentials.password}</p>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={createDriver}
          className="mb-8 grid max-w-xl gap-4 rounded-card border border-graphite-200 bg-white p-5"
        >
          <input
            required
            placeholder="Nome completo"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <input
            required
            type="email"
            placeholder="E-mail (login do motorista)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <input
            placeholder="Telefone (opcional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <input
            placeholder="CPF (opcional, necessário pro contrato em Jurídico)"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <div>
            <label className="mb-1 block text-xs text-graphite-600">Senha inicial</label>
            <div className="flex gap-2">
              <input
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="flex-1 rounded-card border border-graphite-200 px-4 py-2 font-mono"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, password: generatePassword() })}
                className="rounded-card border border-graphite-200 px-3 py-2 text-xs text-graphite-700"
              >
                Gerar outra
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-danger-500">{error}</p>}

          <button
            disabled={saving}
            className="rounded-card bg-graphite-950 py-2 text-white disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar motorista"}
          </button>
        </form>
      )}

      <ul className="space-y-3">
        {drivers.map((d) => (
          <li key={d.id} className="rounded-card border border-graphite-200 bg-white p-4">
            {editingId === d.id ? (
              <div className="space-y-3">
                <input
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                  placeholder="Nome completo"
                />
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                  placeholder="Telefone"
                />
                <input
                  value={editForm.cpf}
                  onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })}
                  className="w-full rounded-card border border-graphite-200 px-4 py-2"
                  placeholder="CPF"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(d.id)}
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
            ) : resettingId === d.id ? (
              <div className="space-y-3">
                <p className="text-sm text-graphite-600">Nova senha pra {d.full_name}:</p>
                <div className="flex gap-2">
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 rounded-card border border-graphite-200 px-4 py-2 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPassword(generatePassword())}
                    className="rounded-card border border-graphite-200 px-3 py-2 text-xs text-graphite-700"
                  >
                    Gerar outra
                  </button>
                </div>
                {error && <p className="text-sm text-danger-500">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmReset(d.id)}
                    disabled={saving}
                    className="rounded-card bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "Aplicando..." : "Confirmar nova senha"}
                  </button>
                  <button
                    onClick={() => setResettingId(null)}
                    className="rounded-card border border-graphite-200 px-4 py-2 text-sm text-graphite-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-graphite-900">{d.full_name}</p>
                  {d.phone && <p className="text-sm text-graphite-600">{d.phone}</p>}
                  {resetResultId?.id === d.id && (
                    <p className="mt-1 font-mono text-xs text-teal-600">
                      Nova senha: {resetResultId.password} (anote agora, não aparece de novo)
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(d)}
                    className="text-xs text-graphite-700 underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => startReset(d.id)}
                    className="text-xs text-graphite-700 underline"
                  >
                    Resetar senha
                  </button>
                  <button
                    onClick={() => removeDriver(d.id, d.full_name)}
                    className="text-xs text-danger-500 underline"
                  >
                    Remover
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!loading && drivers.length === 0 && (
          <p className="text-sm text-graphite-600">Nenhum motorista cadastrado ainda.</p>
        )}
      </ul>
    </div>
  );
}
