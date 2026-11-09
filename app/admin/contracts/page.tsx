"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { geocodeAddressClient } from "@/lib/geocode-client";
import { uploadContractLogo } from "@/lib/logo-upload";
import type { Contract, ContractStatus, Profile } from "@/types/database";

interface ContractFormState {
  company_name: string;
  company_cnpj: string;
  company_representative: string;
  company_address: string;
  work_site_name: string;
  work_site_address: string;
  monthly_value: string;
  driver_ids: string[];
  driver_pct: string;
  tax_pct: string;
  margin_pct: string;
  other_fixed_costs: string;
  work_days_per_month: string;
  status: ContractStatus;
}

const EMPTY_FORM: ContractFormState = {
  company_name: "",
  company_cnpj: "",
  company_representative: "",
  company_address: "",
  work_site_name: "",
  work_site_address: "",
  monthly_value: "",
  driver_ids: [],
  driver_pct: "30",
  tax_pct: "6",
  margin_pct: "15",
  other_fixed_costs: "150",
  work_days_per_month: "22",
  status: "active",
};

function contractToForm(c: Contract, driverIds: string[]): ContractFormState {
  return {
    company_name: c.company_name,
    company_cnpj: c.company_cnpj ?? "",
    company_representative: c.company_representative ?? "",
    company_address: c.company_address,
    work_site_name: c.work_site_name ?? "",
    work_site_address: c.work_site_address ?? "",
    monthly_value: String(c.monthly_value),
    driver_ids: driverIds,
    driver_pct: String((c.driver_pct ?? 0) * 100),
    tax_pct: String((c.tax_pct ?? 0) * 100),
    margin_pct: String((c.margin_pct ?? 0.15) * 100),
    other_fixed_costs: String(c.other_fixed_costs ?? 0),
    work_days_per_month: String(c.work_days_per_month ?? 22),
    status: c.status,
  };
}

function formToPayload(f: ContractFormState) {
  return {
    company_name: f.company_name,
    company_cnpj: f.company_cnpj || null,
    company_representative: f.company_representative || null,
    company_address: f.company_address,
    work_site_name: f.work_site_name || null,
    work_site_address: f.work_site_address || null,
    monthly_value: Number(f.monthly_value),
    driver_pct: Number(f.driver_pct) / 100,
    tax_pct: Number(f.tax_pct) / 100,
    margin_pct: Number(f.margin_pct) / 100,
    other_fixed_costs: Number(f.other_fixed_costs),
    work_days_per_month: Number(f.work_days_per_month),
    status: f.status,
  };
}

export default function ContractsPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [contractDrivers, setContractDrivers] = useState<Record<string, string[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [form, setForm] = useState<ContractFormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContractFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [manualCoordsTarget, setManualCoordsTarget] = useState<{
    contractId: string;
    field: "company" | "work_site";
  } | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");

  const load = useCallback(async () => {
    const { data: contractsData } = await supabase
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: driversData } = await supabase
      .from("profiles")
      .select("*")
      .order("role", { ascending: false })
      .order("full_name");
    const { data: contractDriversData } = await supabase
      .from("contract_drivers")
      .select("contract_id, driver_id");

    const grouped: Record<string, string[]> = {};
    (contractDriversData ?? []).forEach((row) => {
      grouped[row.contract_id] = [...(grouped[row.contract_id] ?? []), row.driver_id];
    });

    setContracts(contractsData ?? []);
    setDrivers(driversData ?? []);
    setContractDrivers(grouped);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function syncContractDrivers(contractId: string, driverIds: string[]) {
    await supabase.from("contract_drivers").delete().eq("contract_id", contractId);
    if (driverIds.length > 0) {
      await supabase
        .from("contract_drivers")
        .insert(driverIds.map((driver_id) => ({ contract_id: contractId, driver_id })));
    }
  }

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    const { data: inserted } = await supabase
      .from("contracts")
      .insert(formToPayload(form))
      .select()
      .single();

    const pendingLogoFile = logoFile;
    const pendingDriverIds = form.driver_ids;

    setForm(EMPTY_FORM);
    setLogoFile(null);
    setShowForm(false);
    load();

    if (!inserted) return;

    if (pendingDriverIds.length > 0) {
      await syncContractDrivers(inserted.id, pendingDriverIds);
      load();
    }

    geocodeContract(inserted.id, inserted.company_address);
    if (inserted.work_site_address) {
      geocodeWorkSite(inserted.id, inserted.work_site_address);
    }

    if (pendingLogoFile) {
      setUploadingLogoId(inserted.id);
      const url = await uploadContractLogo(inserted.id, pendingLogoFile);
      if (url) {
        await supabase.from("contracts").update({ company_logo_url: url }).eq("id", inserted.id);
      }
      setUploadingLogoId(null);
      load();
    }
  }

  function startEdit(c: Contract) {
    setEditingId(c.id);
    setEditForm(contractToForm(c, contractDrivers[c.id] ?? []));
  }

  async function saveEdit(contractId: string) {
    setSaving(true);
    const current = contracts.find((c) => c.id === contractId);
    const addressChanged = current && current.company_address !== editForm.company_address;
    const workSiteChanged = current && (current.work_site_address ?? "") !== editForm.work_site_address;

    await supabase
      .from("contracts")
      .update({
        ...formToPayload(editForm),
        ...(addressChanged ? { company_lat: null, company_lng: null } : {}),
        ...(workSiteChanged ? { work_site_lat: null, work_site_lng: null } : {}),
      })
      .eq("id", contractId);

    await syncContractDrivers(contractId, editForm.driver_ids);

    setSaving(false);
    setEditingId(null);
    load();

    if (addressChanged) geocodeContract(contractId, editForm.company_address);
    if (workSiteChanged && editForm.work_site_address) {
      geocodeWorkSite(contractId, editForm.work_site_address);
    }
  }

  async function changeLogo(contractId: string, file: File) {
    setUploadingLogoId(contractId);
    const url = await uploadContractLogo(contractId, file);
    if (url) {
      await supabase.from("contracts").update({ company_logo_url: url }).eq("id", contractId);
    }
    setUploadingLogoId(null);
    load();
  }

  async function geocodeContract(id: string, address: string) {
    setGeocodingId(id);
    const result = await geocodeAddressClient(address);
    if (result) {
      await supabase
        .from("contracts")
        .update({ company_lat: result.lat, company_lng: result.lng })
        .eq("id", id);
    }
    setGeocodingId(null);
    load();
  }

  async function geocodeWorkSite(id: string, address: string) {
    setGeocodingId(`worksite:${id}`);
    const result = await geocodeAddressClient(address);
    if (result) {
      await supabase
        .from("contracts")
        .update({ work_site_lat: result.lat, work_site_lng: result.lng })
        .eq("id", id);
    }
    setGeocodingId(null);
    load();
  }

  function startManualCoords(contractId: string, field: "company" | "work_site", contract: Contract) {
    setManualCoordsTarget({ contractId, field });
    const lat = field === "company" ? contract.company_lat : contract.work_site_lat;
    const lng = field === "company" ? contract.company_lng : contract.work_site_lng;
    setManualLat(lat != null ? String(lat) : "");
    setManualLng(lng != null ? String(lng) : "");
  }

  async function saveManualCoords() {
    if (!manualCoordsTarget) return;
    const lat = Number(manualLat.replace(",", "."));
    const lng = Number(manualLng.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const columns =
      manualCoordsTarget.field === "company"
        ? { company_lat: lat, company_lng: lng }
        : { work_site_lat: lat, work_site_lng: lng };

    await supabase.from("contracts").update(columns).eq("id", manualCoordsTarget.contractId);
    setManualCoordsTarget(null);
    load();
  }

  function driverNames(contractId: string) {
    const ids = contractDrivers[contractId] ?? [];
    if (ids.length === 0) return "Sem motorista vinculado";
    return ids
      .map((id) => drivers.find((d) => d.id === id)?.full_name)
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl text-graphite-900">Contratos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950"
        >
          {showForm ? "Cancelar" : "Novo contrato"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createContract}
          className="mb-8 max-w-xl rounded-card border border-graphite-200 bg-white p-5"
        >
          <ContractFields
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            drivers={drivers}
          />
          <div className="mt-4">
            <label className="mb-1 block text-xs text-graphite-600">
              Logo do contratante (opcional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-card border border-graphite-200 px-4 py-2 text-sm"
            />
          </div>
          <button className="mt-4 w-full rounded-card bg-graphite-950 py-2 text-white">
            Salvar contrato
          </button>
        </form>
      )}

      <ul className="space-y-3">
        {contracts.map((c) => (
          <li key={c.id} className="rounded-card border border-graphite-200 bg-white p-4">
            {editingId === c.id ? (
              <div>
                <ContractFields
                  value={editForm}
                  onChange={(patch) => setEditForm({ ...editForm, ...patch })}
                  drivers={drivers}
                      />
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => saveEdit(c.id)}
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
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.company_logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.company_logo_url}
                        alt={`Logo ${c.company_name}`}
                        className="h-10 w-10 shrink-0 rounded-card border border-graphite-200 bg-white object-contain"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-mist-200 text-xs text-graphite-600">
                        {c.company_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-graphite-900">
                        {c.company_name}
                        {c.status !== "active" && (
                          <span className="ml-2 rounded-full bg-mist-200 px-2 py-0.5 text-xs text-graphite-700">
                            {c.status === "paused" ? "Pausado" : "Encerrado"}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-graphite-600">{c.company_address}</p>
                      <p className="text-xs text-graphite-600">{driverNames(c.id)}</p>
                      {c.company_lat == null && (
                        <button
                          onClick={() => geocodeContract(c.id, c.company_address)}
                          disabled={geocodingId === c.id}
                          className="mt-1 block text-xs text-amber-600 underline disabled:opacity-50"
                        >
                          {geocodingId === c.id
                            ? "Localizando..."
                            : "⚠ Endereço não localizado — tentar novamente"}
                        </button>
                      )}
                      {c.work_site_address && c.work_site_lat == null && (
                        <button
                          onClick={() => geocodeWorkSite(c.id, c.work_site_address!)}
                          disabled={geocodingId === `worksite:${c.id}`}
                          className="mt-1 block text-xs text-amber-600 underline disabled:opacity-50"
                        >
                          {geocodingId === `worksite:${c.id}`
                            ? "Localizando..."
                            : "⚠ Endereço de destino não localizado — tentar novamente"}
                        </button>
                      )}
                      {c.work_site_name && (
                        <p className="mt-1 text-xs text-graphite-600">
                          Destino: {c.work_site_name}
                          {c.work_site_address ? ` — ${c.work_site_address}` : ""}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-3">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs text-graphite-700 underline"
                        >
                          Editar
                        </button>
                        <label className="cursor-pointer text-xs text-graphite-600 underline">
                          {uploadingLogoId === c.id ? "Enviando..." : "Trocar logo"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingLogoId === c.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) changeLogo(c.id, file);
                            }}
                          />
                        </label>
                        <button
                          onClick={() => startManualCoords(c.id, "company", c)}
                          className="text-xs text-graphite-600 underline"
                        >
                          Coordenadas do contratante na mão
                        </button>
                        {c.work_site_address && (
                          <button
                            onClick={() => startManualCoords(c.id, "work_site", c)}
                            className="text-xs text-graphite-600 underline"
                          >
                            Coordenadas do destino na mão
                          </button>
                        )}
                      </div>

                      {manualCoordsTarget?.contractId === c.id && (
                        <div className="mt-2 space-y-1 rounded-card border border-teal-500 bg-teal-500/5 p-2">
                          <p className="text-xs text-graphite-600">
                            Endereços em marco de rodovia (ex: &quot;km 131&quot;) ou zona
                            rural costumam confundir o roteador — pega a coordenada certa
                            no Google Maps: clique com botão direito bem em cima do local →
                            o primeiro número da lista já vem no formato certo pra colar.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={manualLat}
                              onChange={(e) => setManualLat(e.target.value)}
                              placeholder="Latitude"
                              className="w-36 rounded-card border border-graphite-200 px-2 py-1 text-xs"
                            />
                            <input
                              value={manualLng}
                              onChange={(e) => setManualLng(e.target.value)}
                              placeholder="Longitude"
                              className="w-36 rounded-card border border-graphite-200 px-2 py-1 text-xs"
                            />
                            <button
                              onClick={saveManualCoords}
                              className="rounded-card bg-teal-500 px-3 py-1 text-xs font-medium text-white"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => setManualCoordsTarget(null)}
                              className="text-xs text-graphite-600 underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 font-display text-lg text-graphite-900">
                    {c.monthly_value.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>

                {c.needs_price_review && <PriceReviewAlert contract={c} onAccept={load} />}
                <PreciseRecalculateButton contractId={c.id} onDone={load} />
              </>
            )}
          </li>
        ))}
        {contracts.length === 0 && (
          <p className="text-sm text-graphite-600">Nenhum contrato cadastrado ainda.</p>
        )}
      </ul>
    </div>
  );
}

function ContractFields({
  value,
  onChange,
  drivers,
}: {
  value: ContractFormState;
  onChange: (patch: Partial<ContractFormState>) => void;
  drivers: Profile[];
}) {
  return (
    <div className="grid gap-4">
      <input
        required
        placeholder="Nome da empresa"
        value={value.company_name}
        onChange={(e) => onChange({ company_name: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />
      <input
        placeholder="CNPJ"
        value={value.company_cnpj}
        onChange={(e) => onChange({ company_cnpj: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />
      <input
        placeholder="Nome do representante legal"
        value={value.company_representative}
        onChange={(e) => onChange({ company_representative: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />
      <input
        required
        placeholder="Endereço da empresa"
        value={value.company_address}
        onChange={(e) => onChange({ company_address: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />

      <div className="rounded-card border border-dashed border-graphite-200 p-3">
        <p className="mb-2 text-xs font-medium text-graphite-700">
          Empresa de destino (se as funcionárias trabalham em outro lugar)
        </p>
        <p className="mb-3 text-xs text-graphite-600">
          Deixe em branco se a contratante acima é o próprio local de trabalho.
          Preencha quando for terceirização — ex: contratante &quot;Casa
          Tempero&quot;, mas as funcionárias trabalham na &quot;Xhara&quot;.
        </p>
        <div className="grid gap-3">
          <input
            placeholder="Nome da empresa de destino"
            value={value.work_site_name}
            onChange={(e) => onChange({ work_site_name: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
          <input
            placeholder="Endereço de destino"
            value={value.work_site_address}
            onChange={(e) => onChange({ work_site_address: e.target.value })}
            className="rounded-card border border-graphite-200 px-4 py-2"
          />
        </div>
      </div>

      <input
        required
        type="number"
        placeholder="Valor mensal (R$)"
        value={value.monthly_value}
        onChange={(e) => onChange({ monthly_value: e.target.value })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      />

      <select
        value={value.status}
        onChange={(e) => onChange({ status: e.target.value as ContractStatus })}
        className="rounded-card border border-graphite-200 px-4 py-2"
      >
        <option value="active">Ativo</option>
        <option value="paused">Pausado</option>
        <option value="ended">Encerrado</option>
      </select>

      <div>
        <p className="mb-2 text-xs text-graphite-600">
          Motoristas do contrato (marque um ou vários — a operação toda geralmente
          precisa de mais de um)
        </p>
        {drivers.length === 0 ? (
          <p className="text-xs text-graphite-600">
            Nenhum motorista cadastrado ainda — cadastre em &quot;Motoristas&quot;.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {drivers.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 rounded-card border border-graphite-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.driver_ids.includes(d.id)}
                  onChange={(e) =>
                    onChange({
                      driver_ids: e.target.checked
                        ? [...value.driver_ids, d.id]
                        : value.driver_ids.filter((id) => id !== d.id),
                    })
                  }
                />
                {d.full_name}
                {d.role === "admin" && (
                  <span className="text-xs text-graphite-600">(admin)</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <p className="-mt-2 text-xs text-graphite-600">
        Veículo é configurado por rota (cada rota pode usar uma van diferente)
        — vá em &quot;Rotas&quot; depois de salvar pra vincular.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">% motorista</span>
          <input
            type="number"
            value={value.driver_pct}
            onChange={(e) => onChange({ driver_pct: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">% imposto</span>
          <input
            type="number"
            value={value.tax_pct}
            onChange={(e) => onChange({ tax_pct: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">% margem</span>
          <input
            type="number"
            value={value.margin_pct}
            onChange={(e) => onChange({ margin_pct: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">Outros custos fixos (R$/mês)</span>
          <input
            type="number"
            value={value.other_fixed_costs}
            onChange={(e) => onChange({ other_fixed_costs: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-graphite-600">Dias úteis/mês</span>
          <input
            type="number"
            value={value.work_days_per_month}
            onChange={(e) => onChange({ work_days_per_month: e.target.value })}
            className="w-full rounded-card border border-graphite-200 px-3 py-2"
          />
        </label>
      </div>
    </div>
  );
}

function PriceReviewAlert({
  contract,
  onAccept,
}: {
  contract: Contract;
  onAccept: () => void;
}) {
  const supabase = createClient();
  const [applying, setApplying] = useState(false);

  const variance = contract.value_variance_pct ?? 0;
  const isIncrease = variance > 0;

  async function acceptSuggestion() {
    if (contract.suggested_monthly_value == null) return;
    setApplying(true);
    await supabase
      .from("contracts")
      .update({ monthly_value: contract.suggested_monthly_value })
      .eq("id", contract.id);
    setApplying(false);
    onAccept();
  }

  return (
    <div className="mt-3 rounded-card border border-amber-500 bg-amber-500/10 p-3">
      <p className="text-sm font-medium text-amber-600">
        Valor precisa de revisão — distância mudou{" "}
        {isIncrease ? "para mais" : "para menos"} ({(variance * 100).toFixed(1)}%)
      </p>
      <p className="mt-1 text-xs text-graphite-600">
        Distância diária estimada: {contract.current_estimated_distance_km?.toFixed(1)} km ·
        Valor sugerido:{" "}
        {contract.suggested_monthly_value?.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
      </p>
      <button
        onClick={acceptSuggestion}
        disabled={applying}
        className="mt-2 rounded-card bg-amber-500 px-3 py-1.5 text-xs font-medium text-graphite-950 disabled:opacity-50"
      >
        {applying ? "Aplicando..." : "Aplicar novo valor"}
      </button>
    </div>
  );
}

interface PreciseBreakdownRow {
  name: string;
  route: string;
  idaKm: number | null;
  voltaKm: number | null;
  flagged: boolean;
  daysPerMonth: number;
  monthlyKm: number;
}

function PreciseRecalculateButton({
  contractId,
  onDone,
}: {
  contractId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    totalMonthlyKm: number;
    breakdown: PreciseBreakdownRow[];
    anyFlagged: boolean;
  } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/contracts/${contractId}/recalculate-precise`, {
      method: "POST",
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Falha ao calcular.");
      return;
    }

    setResult({
      totalMonthlyKm: data.totalMonthlyKm,
      breakdown: data.breakdown,
      anyFlagged: data.anyFlagged,
    });
    setShowBreakdown(true);
    onDone();
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-card border border-teal-500 px-3 py-1.5 text-xs font-medium text-teal-600 disabled:opacity-50"
      >
        {loading
          ? "Calculando rota real de cada funcionária..."
          : "Calcular distância real (por funcionária, ida+volta, escala)"}
      </button>

      {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}

      {result && (
        <div className="mt-2 rounded-card border border-graphite-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-graphite-900">
              Total: {result.totalMonthlyKm.toLocaleString("pt-BR")} km/mês
            </p>
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-xs text-graphite-600 underline"
            >
              {showBreakdown ? "Ocultar detalhe" : "Ver detalhe"}
            </button>
          </div>

          {result.anyFlagged && (
            <p className="mb-2 text-xs text-amber-600">
              ⚠ Uma ou mais linhas marcadas com * usaram estimativa por linha reta —
              a rota real que a API devolveu ficou implausível (provável marco de
              rodovia/zona rural mal mapeado). Considere fixar as coordenadas do
              destino manualmente acima.
            </p>
          )}

          {showBreakdown && (
            <table className="w-full text-left text-xs">
              <thead className="text-graphite-600">
                <tr>
                  <th className="py-1 pr-2">Funcionária</th>
                  <th className="py-1 pr-2">Rota</th>
                  <th className="py-1 pr-2">Ida</th>
                  <th className="py-1 pr-2">Volta</th>
                  <th className="py-1 pr-2">Dias/mês</th>
                  <th className="py-1">Km/mês</th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="border-t border-graphite-200">
                    <td className="py-1 pr-2">
                      {row.name}
                      {row.flagged && <span className="text-amber-600"> *</span>}
                    </td>
                    <td className="py-1 pr-2 text-graphite-600">{row.route}</td>
                    <td className="py-1 pr-2">
                      {row.idaKm != null ? `${row.idaKm.toFixed(1)} km` : "— (estimado)"}
                    </td>
                    <td className="py-1 pr-2">
                      {row.voltaKm != null ? `${row.voltaKm.toFixed(1)} km` : "— (estimado)"}
                    </td>
                    <td className="py-1 pr-2">{row.daysPerMonth}</td>
                    <td className="py-1">{row.monthlyKm} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
