"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contract } from "@/types/database";

interface TripRow {
  id: string;
  route_id: string;
  driver_id: string;
  trip_stops: { id: string; employee_id: string; employee_name: string; employee_phone: string | null; scheduled_start: string | null; scheduled_end: string | null; boarded_at: string | null; dropped_off_at: string | null; pickup_address: string; dropoff_address: string; notes: string; status: string }[];
  trip_date: string;
  period: string;
  status: string;
  distance_km: number | null;
  fuel_cost: number | null;
  contracts: { company_name: string } | null;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    planned: "A iniciar",
    in_progress: "Em andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
  };
  return map[status] ?? status;
}

function formatBRL(value: number | null) {
  return value != null
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

export default function ReportsPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    supabase
      .from("contracts")
      .select("*")
      .order("company_name")
      .then(({ data }) => setContracts(data ?? []));
  }, [supabase]);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError("");
    const rows: TripRow[] = [];
    for (let offset = 0; ; offset += 50) {
      let query = supabase.from("trips")
        .select("id, route_id, driver_id, trip_date, period, status, distance_km, fuel_cost, contracts(company_name), trip_stops(*)")
        .order("trip_date", { ascending: false }).order("id").range(offset, offset + 49);
      if (contractId) query = query.eq("contract_id", contractId);
      if (dateFrom) query = query.gte("trip_date", dateFrom);
      if (dateTo) query = query.lte("trip_date", dateTo);
      const { data, error } = await query;
      if (error) { setError("Falha ao carregar relatório: " + error.message); setTrips([]); setLoading(false); return; }
      rows.push(...(data as unknown as TripRow[]));
      if (data.length < 50) break;
    }
    setTrips(rows);
    setLoading(false);
  }, [supabase, contractId, dateFrom, dateTo]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const totalDistance = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const totalFuel = trips.reduce((sum, t) => sum + (t.fuel_cost ?? 0), 0);
  const completedCount = trips.filter((t) => t.status === "completed").length;

  async function exportExcel() {
    setExporting("excel");
    try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Corridas");

    const columnWidths = [14, 10, 28, 16, 12, 18];
    columnWidths.forEach((width, i) => {
      sheet.getColumn(i + 1).width = width;
    });

    const selectedContract = contracts.find((c) => c.id === contractId);
    let headerRowNumber = 1;

    if (selectedContract?.company_logo_url) {
      const dataUrl = await fetchImageAsDataUrl(selectedContract.company_logo_url);
      if (dataUrl) {
        const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,/);
        const ext = match?.[1] === "jpg" ? "jpeg" : ((match?.[1] as "png" | "jpeg") ?? "png");
        const imageId = workbook.addImage({ base64: dataUrl, extension: ext });
        sheet.addImage(imageId, "A1:B4");
        sheet.getCell("C1").value = selectedContract.company_name;
        sheet.getCell("C1").font = { bold: true, size: 14 };
        headerRowNumber = 6; // 4 linhas da logo + 1 em branco
      }
    }

    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = ["Data", "Período", "Contrato", "Status", "Km", "Combustível (R$)"];
    headerRow.font = { bold: true };

    trips.forEach((t) => {
      sheet.addRow([
        t.trip_date,
        t.period === "ida" ? "Ida" : "Volta",
        t.contracts?.company_name ?? "",
        statusLabel(t.status),
        t.distance_km ?? "",
        t.fuel_cost ?? "",
      ]);
    });

    sheet.addRow([]);
    const totalsRow = sheet.addRow([
      "",
      "",
      "Total",
      `${completedCount} concluída(s)`,
      Number(totalDistance.toFixed(1)),
      Number(totalFuel.toFixed(2)),
    ]);
    totalsRow.font = { bold: true };

    const { addTransportTickets } = await import("@/lib/transport-report");
    addTransportTickets(workbook, trips, dateFrom, dateTo);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `relatorio_corridas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao exportar Excel"); } finally { setExporting(null); }
  }

  async function exportPdf() {
    setExporting("pdf");
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();
    const selectedContract = contracts.find((c) => c.id === contractId);
    const contractName = selectedContract?.company_name ?? "Todos os contratos";

    let textStartX = 14;

    // Logo só faz sentido quando o filtro é de um contrato específico —
    // "todos os contratos" não tem uma única marca pra estampar.
    if (selectedContract?.company_logo_url) {
      try {
        const logoDataUrl = await fetchImageAsDataUrl(selectedContract.company_logo_url);
        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "PNG", 14, 10, 18, 18);
          textStartX = 38;
        }
      } catch {
        // se a logo falhar ao carregar, segue o relatório sem ela
      }
    }

    doc.setFontSize(14);
    doc.text("Relatório de corridas", textStartX, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Contrato: ${contractName}`, textStartX, 25);
    doc.text(`Intervalo: ${dateFrom || "início"} até ${dateTo || "hoje"}`, textStartX, 31);

    autoTable(doc, {
      startY: 40,
      head: [["Data", "Período", "Contrato", "Status", "Km", "Combustível"]],
      body: trips.map((t) => [
        t.trip_date,
        t.period === "ida" ? "Ida" : "Volta",
        t.contracts?.company_name ?? "",
        statusLabel(t.status),
        t.distance_km?.toFixed(1) ?? "—",
        formatBRL(t.fuel_cost),
      ]),
      foot: [
        ["", "", "Total", `${completedCount} concluída(s)`, totalDistance.toFixed(1), formatBRL(totalFuel)],
      ],
      headStyles: { fillColor: [18, 21, 28] },
      footStyles: { fillColor: [236, 238, 242], textColor: [20, 20, 20] },
      styles: { fontSize: 9 },
    });

    doc.save(`relatorio_corridas_${new Date().toISOString().slice(0, 10)}.pdf`);
    setExporting(null);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="mb-6 text-2xl text-graphite-900">Relatórios</h1>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      <p className="mb-4 text-sm text-graphite-600">Excel inclui tickets por funcionária: horários previstos, busca e entrega na ida e volta, locais e observações.</p>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-graphite-600">Contrato</label>
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className="rounded-card border border-graphite-200 px-3 py-2 text-sm"
          >
            <option value="">Todos os contratos</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-graphite-600">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-card border border-graphite-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-graphite-600">Até</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-card border border-graphite-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={exportExcel}
            disabled={loading || !!error || exporting !== null || trips.length === 0}
            className="rounded-card border border-graphite-200 px-4 py-2 text-sm font-medium text-graphite-700 hover:border-teal-500 disabled:opacity-40"
          >
            {exporting === "excel" ? "Gerando..." : "Exportar Excel"}
          </button>
          <button
            onClick={exportPdf}
            disabled={exporting !== null || trips.length === 0}
            className="rounded-card border border-graphite-200 px-4 py-2 text-sm font-medium text-graphite-700 hover:border-amber-500 disabled:opacity-40"
          >
            {exporting === "pdf" ? "Gerando..." : "Exportar PDF"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryCard label="Corridas concluídas" value={String(completedCount)} />
        <SummaryCard label="Km total" value={`${totalDistance.toFixed(1)} km`} />
        <SummaryCard label="Combustível total" value={formatBRL(totalFuel)} />
      </div>

      <div className="overflow-x-auto rounded-card border border-graphite-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-graphite-200 text-graphite-600">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Contrato</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Km</th>
              <th className="px-4 py-3">Combustível</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={i} className="border-b border-graphite-200 last:border-0">
                <td className="px-4 py-3">{t.trip_date}</td>
                <td className="px-4 py-3">{t.period === "ida" ? "Ida" : "Volta"}</td>
                <td className="px-4 py-3">{t.contracts?.company_name}</td>
                <td className="px-4 py-3">{statusLabel(t.status)}</td>
                <td className="px-4 py-3">{t.distance_km?.toFixed(1) ?? "—"}</td>
                <td className="px-4 py-3">{formatBRL(t.fuel_cost)}</td>
              </tr>
            ))}
            {!loading && trips.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-graphite-600">
                  Nenhuma corrida encontrada nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-graphite-200 bg-white p-4">
      <p className="text-xs text-graphite-600">{label}</p>
      <p className="mt-1 text-xl font-display font-semibold text-graphite-900">{value}</p>
    </div>
  );
}
