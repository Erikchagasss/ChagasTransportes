import type { Workbook } from "exceljs";

interface Ticket {
  id: string; employee_id: string; employee_name: string; employee_phone: string | null;
  scheduled_start: string | null; scheduled_end: string | null;
  boarded_at: string | null; dropped_off_at: string | null;
  pickup_address: string; dropoff_address: string; notes: string; status: string;
  arrived_at?: string | null; dropoff_arrived_at?: string | null;
}
interface ReportTrip {
  id: string; route_id: string; driver_id: string; trip_date: string; period: string;
  contracts: { company_name: string } | null; trip_stops: Ticket[];
}
const clock = (v?: string | null) => v ? new Date(v).toLocaleTimeString("pt-BR", {timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"}) : "";
const label = (s?: Ticket) => !s ? "Sem ticket" : s.status === "absent" ? "Ausente" : s.dropped_off_at ? "Entregue" : s.status === "boarded" ? "Em transporte" : "Aguardando";

export function addTransportTickets(workbook: Workbook, trips: ReportTrip[], from: string, to: string) {
  const sheet = workbook.addWorksheet("Tickets de transporte", {views: [{state: "frozen", xSplit: 3, ySplit: 5}]});
  const headers = ["Data", "Contrato", "Funcionária", "Telefone", "Entrada prevista", "Saída prevista", "Busca em casa", "Entrega na empresa", "Busca na empresa", "Entrega em casa", "Situação ida", "Situação volta", "Local busca ida", "Local entrega ida", "Local busca volta", "Local entrega volta", "Observações ida", "Observações volta", "Motorista ida (ID)", "Motorista volta (ID)", "Ticket ida", "Ticket volta", "Chegada à busca ida", "Chegada à entrega ida", "Chegada à busca volta", "Chegada à entrega volta"];
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell("A1").value = "CHAGAS TRANSPORTE · CONTROLE DE ENTRADA E SAÍDA";
  sheet.getRow(1).height = 34;
  sheet.getCell("A1").font = {name: "Calibri", size: 18, bold: true, color: {argb: "FFFFFFFF"}};
  sheet.getCell("A1").fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF123C46"}};
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell("A2").value = `Período: ${from || "início"} a ${to || "último registro"} · Horários de Brasília · Uma linha por data, rota e funcionária`;
  sheet.mergeCells(3, 1, 3, headers.length);
  sheet.getCell("A3").value = "Horários vazios indicam eventos não registrados. Dados antigos usam o cadastro disponível na migração. Este é um comprovante de transporte.";
  const groups = new Map<string, {trip: ReportTrip; ida?: Ticket; volta?: Ticket; idaDriver?: string; voltaDriver?: string}>();
  for (const trip of trips) for (const stop of trip.trip_stops || []) {
    const key = `${trip.trip_date}/${trip.route_id}/${stop.employee_id}`;
    const group = groups.get(key) || {trip};
    if (trip.period === "ida") {group.ida = stop; group.idaDriver = trip.driver_id;}
    else {group.volta = stop; group.voltaDriver = trip.driver_id;}
    groups.set(key, group);
  }
  sheet.getRow(5).values = headers;
  sheet.getRow(5).height = 32;
  for (const {trip, ida: i, volta: v, idaDriver, voltaDriver} of [...groups.values()].sort((a,b)=>a.trip.trip_date.localeCompare(b.trip.trip_date) || (a.ida?.employee_name || a.volta?.employee_name || "").localeCompare(b.ida?.employee_name || b.volta?.employee_name || ""))) {
    const s = i || v!;
    const row = sheet.addRow([trip.trip_date.split("-").reverse().join("/"), trip.contracts?.company_name || "", s.employee_name, s.employee_phone || "", s.scheduled_start?.slice(0,5) || "", s.scheduled_end?.slice(0,5) || "", clock(i?.boarded_at), clock(i?.dropped_off_at), clock(v?.boarded_at), clock(v?.dropped_off_at), label(i), label(v), i?.pickup_address || "", i?.dropoff_address || "", v?.pickup_address || "", v?.dropoff_address || "", i?.notes || "", v?.notes || "", idaDriver || "", voltaDriver || "", i?.id || "", v?.id || ""]);
    row.getCell(23).value = clock(i?.arrived_at);
    row.getCell(24).value = clock(i?.dropoff_arrived_at);
    row.getCell(25).value = clock(v?.arrived_at);
    row.getCell(26).value = clock(v?.dropoff_arrived_at);
    row.height = 48;
    row.eachCell({includeEmpty: true}, cell => {
      cell.font = {name: "Calibri", size: 11, color: {argb: "FF23343B"}};
      cell.alignment = {vertical: "middle", wrapText: true};
      cell.fill = {type: "pattern", pattern: "solid", fgColor: {argb: row.number % 2 ? "FFF0F7F7" : "FFFFFFFF"}};
    });
  }
  sheet.getRow(5).eachCell(cell => {
    cell.font = {bold: true, color: {argb: "FFFFFFFF"}};
    cell.fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF157A79"}};
    cell.alignment = {wrapText: true, vertical: "middle"};
  });
  headers.forEach((_, index) => {sheet.getColumn(index + 1).width = index >= 12 ? 36 : index === 1 || index === 2 ? 26 : 19;});
  sheet.autoFilter = {from: {row: 5, column: 1}, to: {row: Math.max(5, sheet.rowCount), column: headers.length}};
  sheet.pageSetup = {orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5"};
}
