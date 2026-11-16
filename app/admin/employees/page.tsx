"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import LocationPicker from "@/app/components/location-picker";
import { geocodeAddressClient } from "@/lib/geocode-client";
import { formatShiftSummary, WEEKDAY_LABELS } from "@/lib/schedule";
import { suspiciousDistanceFrom } from "@/lib/geo-sanity";
import type { Contract, Employee, ShiftType } from "@/types/database";

interface EmployeeFormState {
  full_name: string;
  phone: string;
  address: string;
  shift_type: ShiftType;
  work_weekdays: number[];
  shift_anchor_date: string;
  shift_start_time: string;
  shift_end_time: string;
}

const EMPTY_FORM: EmployeeFormState = {
  full_name: "",
  phone: "",
  address: "",
  shift_type: "fixed",
  work_weekdays: [1, 2, 3, 4, 5],
  shift_anchor_date: "",
  shift_start_time: "",
  shift_end_time: "",
};

function employeeToForm(emp: Employee): EmployeeFormState {
  return {
    full_name: emp.full_name,
    phone: emp.phone ?? "",
    address: emp.address,
    shift_type: emp.shift_type,
    work_weekdays: emp.work_weekdays?.length ? emp.work_weekdays : [1, 2, 3, 4, 5],
    shift_anchor_date: emp.shift_anchor_date ?? "",
    shift_start_time: emp.shift_start_time?.slice(0, 5) ?? "",
    shift_end_time: emp.shift_end_time?.slice(0, 5) ?? "",
  };
}

function formToPayload(f: EmployeeFormState) {
  return {
    full_name: f.full_name,
    phone: f.phone || null,
    address: f.address,
    shift_type: f.shift_type,
    work_weekdays: f.shift_type === "fixed" ? f.work_weekdays : [1, 2, 3, 4, 5],
    shift_anchor_date: f.shift_type === "12x36" ? f.shift_anchor_date || null : null,
    shift_start_time: f.shift_start_time || null,
    shift_end_time: f.shift_end_time || null,
  };
}

export default function EmployeesPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);

  const [manualCoordsId, setManualCoordsId] = useState<string | null>(null);

  const loadContracts = useCallback(async () => {
    const { data } = await supabase.from("contracts").select("*").eq("status", "active");
    setContracts(data ?? []);
    if (data && data.length > 0 && !selectedContract) {
      setSelectedContract(data[0].id);
    }
  }, [supabase, selectedContract]);

  const loadEmployees = useCallback(async () => {
    if (!selectedContract) return;
    const { data } = await supabase
      .from("employees")
      .select("*")
      .eq("contract_id", selectedContract)
      .order("full_name");
    setEmployees(data ?? []);
  }, [supabase, selectedContract]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    const { data: inserted, error } = await supabase
      .from("employees")
      .insert({
        contract_id: selectedContract,
        address_lat: null,
        address_lng: null,
        active: true,
        ...formToPayload(form),
      })
      .select()
      .single();

    if (error) { setError(error.message); return; }
    setError("");
    setForm(EMPTY_FORM);
    setShowForm(false);
    loadEmployees();

    if (inserted) geocodeEmployee(inserted.id, inserted.address);
  }

  async function geocodeEmployee(id: string, address: string) {
    setGeocodingId(id);setError("");
    const result = await geocodeAddressClient(address);
    if (result) {
      const {error}=await supabase.from("employees").update({ address_lat: result.lat, address_lng: result.lng, address_needs_review:false }).eq("id",id).eq("address",address).select("id").single();
      if(error) setError(error.message);
    } else setError("O endereço não foi localizado com precisão no número informado. Confira cidade, estado e CEP ou use Conferir / corrigir ponto exato.");
    setGeocodingId(null);await loadEmployees();
  }

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setEditForm(employeeToForm(emp));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function saveEdit(empId: string) {
    setSaving(true);
    const current = employees.find((e) => e.id === empId);
    const addressChanged = current && current.address !== editForm.address;

    const { error } = await supabase
      .from("employees")
      .update({
        ...formToPayload(editForm),
        ...(addressChanged ? { address_lat: null, address_lng: null } : {}),
      })
      .eq("id", empId);

    setSaving(false);
    if (error) { setError(error.message); return; }
    setError("");
    setEditingId(null);
    loadEmployees();

    if (addressChanged) geocodeEmployee(empId, editForm.address);
  }

  async function toggleActive(emp: Employee) {
    const { error } = await supabase.from("employees").update({ active: !emp.active }).eq("id", emp.id).select("id").single();
    if (error) { setError(error.message); return; }
    setError("");
    loadEmployees();
  }

  function startManualCoords(emp: Employee) { setManualCoordsId(emp.id); }

  const currentContract = contracts.find((c) => c.id === selectedContract) ?? null;
  const contractReference = currentContract
    ? {
        lat: currentContract.work_site_lat ?? currentContract.company_lat,
        lng: currentContract.work_site_lng ?? currentContract.company_lng,
      }
    : null;

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="mb-6 text-2xl text-graphite-900">Funcionárias</h1>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      <p className="mb-4 text-sm">Desativar remove das próximas gerações e preserva os tickets existentes.</p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={selectedContract}
          onChange={(e) => setSelectedContract(e.target.value)}
          className="rounded-card border border-graphite-200 px-4 py-2"
        >
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={!selectedContract}
          className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950 disabled:opacity-40"
        >
          {showForm ? "Cancelar" : "Nova funcionária"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createEmployee}
          className="mb-8 max-w-xl rounded-card border border-graphite-200 bg-white p-5"
        >
          <EmployeeFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
          <button className="mt-4 w-full rounded-card bg-graphite-950 py-2 text-white">
            Salvar funcionária
          </button>
        </form>
      )}

      <ul className="space-y-3">
        {employees.map((emp) => (
          <li key={emp.id} className="rounded-card border border-graphite-200 bg-white p-4">
            {editingId === emp.id ? (
              <div>
                <EmployeeFields
                  value={editForm}
                  onChange={(patch) => setEditForm({ ...editForm, ...patch })}
                />
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => saveEdit(emp.id)}
                    disabled={saving}
                    className="rounded-card bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded-card border border-graphite-200 px-4 py-2 text-sm text-graphite-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-graphite-900">{emp.full_name}</p>
                  <p className="text-sm text-graphite-600">{emp.address}</p>
                  {emp.phone && <p className="text-sm text-graphite-600">{emp.phone}</p>}
                  <p className="mt-1 text-xs text-graphite-600">{formatShiftSummary(emp)}</p>
                  {emp.address_needs_review && <p className="mt-2 text-xs font-medium text-amber-700">Ponto pendente de conferência. O motorista não será guiado pelas coordenadas antigas.</p>}
                  {emp.address_lat == null && (
                    <button
                      onClick={() => geocodeEmployee(emp.id, emp.address)}
                      disabled={geocodingId === emp.id}
                      className="mt-1 block text-xs text-amber-600 underline disabled:opacity-50"
                    >
                      {geocodingId === emp.id
                        ? "Localizando..."
                        : "⚠ Endereço não localizado — tentar novamente"}
                    </button>
                  )}
                  {emp.address_lat != null &&
                    (() => {
                      const suspicious = suspiciousDistanceFrom(
                        { lat: emp.address_lat!, lng: emp.address_lng! },
                        contractReference
                      );
                      if (suspicious == null) return null;
                      return (
                        <p className="mt-1 text-xs font-medium text-danger-500">
                          ⚠ Endereço a {suspicious.toFixed(0)} km do contratante — parece
                          errado (geocoding pode ter casado com rua homônima em outra
                          cidade). Confira ou ajuste manualmente abaixo.
                        </p>
                      );
                    })()}
                  {manualCoordsId === emp.id ? <LocationPicker address={emp.address} initial={emp.address_lat != null && emp.address_lng != null ? {lat:Number(emp.address_lat),lng:Number(emp.address_lng)} : null} onCancel={()=>setManualCoordsId(null)} onSave={async point=>{
                    const {error}=await supabase.from("employees").update({address_lat:point.lat,address_lng:point.lng,address_needs_review:false}).eq("id",emp.id).eq("address",emp.address).select("id").single();
                    if(error) throw new Error(error.message);
                    setManualCoordsId(null);await loadEmployees();
                  }} /> : <div className="mt-2 flex flex-wrap gap-3"><button onClick={()=>startManualCoords(emp)} className="text-xs text-teal-700 underline">Conferir / corrigir ponto exato</button>{emp.address_lat != null && <button disabled={geocodingId === emp.id} onClick={()=>geocodeEmployee(emp.id,emp.address)} className="text-xs underline">{geocodingId === emp.id ? "Validando..." : "Revalidar endereço"}</button>}</div>}
                  {!emp.active && (
                    <span className="mt-1 inline-block rounded-full bg-graphite-200 px-2 py-0.5 text-xs text-graphite-700">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => startEdit(emp)}
                    className="rounded-card border border-graphite-200 px-3 py-1.5 text-xs font-medium text-graphite-700 hover:border-amber-500"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(emp)}
                    className="rounded-card border border-graphite-200 px-3 py-1.5 text-xs font-medium text-graphite-700"
                  >
                    {emp.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {employees.length === 0 && (
          <p className="text-sm text-graphite-600">Nenhuma funcionária neste contrato ainda.</p>
        )}
      </ul>
    </div>
  );
}

function EmployeeFields({
  value,
  onChange,
}: {
  value: EmployeeFormState;
  onChange: (patch: Partial<EmployeeFormState>) => void;
}) {
  function toggleWeekday(day: number) {
    onChange({
      work_weekdays: value.work_weekdays.includes(day)
        ? value.work_weekdays.filter((d) => d !== day)
        : [...value.work_weekdays, day].sort(),
    });
  }

  return (
    <div className="grid gap-4">
      <input
        required
        placeholder="Nome completo"
        value={value.full_name}
        onChange={(e) => onChange({ full_name: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />
      <input
        placeholder="Telefone (opcional)"
        value={value.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />
      <input
        required
        placeholder="Endereço residencial"
        value={value.address}
        onChange={(e) => onChange({ address: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />

      <div>
        <p className="mb-2 text-sm text-graphite-600">Escala de trabalho</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ shift_type: "fixed" })}
            className={`rounded-card px-4 py-2 text-sm ${
              value.shift_type === "fixed"
                ? "bg-teal-500 text-white"
                : "border border-graphite-200 text-graphite-700"
            }`}
          >
            Dias fixos
          </button>
          <button
            type="button"
            onClick={() => onChange({ shift_type: "12x36" })}
            className={`rounded-card px-4 py-2 text-sm ${
              value.shift_type === "12x36"
                ? "bg-teal-500 text-white"
                : "border border-graphite-200 text-graphite-700"
            }`}
          >
            Escala 12x36
          </button>
        </div>
      </div>

      {value.shift_type === "fixed" ? (
        <div>
          <p className="mb-2 text-xs text-graphite-600">Dias que trabalha</p>
          <div className="flex gap-2">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleWeekday(i)}
                className={`h-9 w-11 rounded-card text-xs font-medium ${
                  value.work_weekdays.includes(i)
                    ? "bg-teal-500 text-white"
                    : "border border-graphite-200 text-graphite-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">
            Data de referência (um dia em que ela trabalhou — o sistema alterna
            trabalha/folga a partir daí)
          </span>
          <input
            type="date"
            value={value.shift_anchor_date}
            onChange={(e) => onChange({ shift_anchor_date: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-4 py-2"
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">Início do turno</span>
          <input
            type="time"
            value={value.shift_start_time}
            onChange={(e) => onChange({ shift_start_time: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-4 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">Fim do turno</span>
          <input
            type="time"
            value={value.shift_end_time}
            onChange={(e) => onChange({ shift_end_time: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-4 py-2"
          />
        </label>
      </div>
    </div>
  );
}
