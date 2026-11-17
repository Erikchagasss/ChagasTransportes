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
  contracts: { company_name: string } | null; routes?: { name: string } | null; trip_stops: Ticket[];
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

type MonthlyTicket = Ticket & { trip_date: string; period: string };
type MonthlyEmployee = { id: string; name: string; legValue: number | null };
const sheetName = (value:string, used:Set<string>) => {
  const safe=(value.replace(/[\\/?*:[\]]/g," ").trim() || "Rota").slice(0,31);
  let candidate=safe, index=2;
  while(used.has(candidate)){candidate=`${safe.slice(0,28)} ${index++}`;}
  used.add(candidate);return candidate;
};
const dateList=(from:string,to:string,fallback:string[]) => {
  const first=from || fallback.slice().sort()[0], last=to || fallback.slice().sort().at(-1);
  if(!first || !last || first>last) return [] as string[];
  const result:string[]=[]; const cursor=new Date(`${first}T12:00:00`); const end=new Date(`${last}T12:00:00`);
  while(cursor<=end){result.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`);cursor.setDate(cursor.getDate()+1);}
  return result;
};
const excelDate=(date:string)=>new Date(`${date}T12:00:00`);
const time=(value?:string|null)=>value?.slice(0,5) || "";

/** Replica o controle mensal fornecido: duas funcionárias por folha, fins de semana e totais. */
export function addMonthlyRideControl(workbook: Workbook, trips: ReportTrip[], from: string, to: string, values: Map<string,number|null>) {
  const byRoute=new Map<string,{name:string;trips:ReportTrip[]}>();
  for(const trip of trips){
    const group=byRoute.get(trip.route_id) || {name:trip.routes?.name || "Rota",trips:[]};
    group.trips.push(trip);byRoute.set(trip.route_id,group);
  }
  const usedNames=new Set<string>();
  for(const route of byRoute.values()){
    const tickets=new Map<string,MonthlyTicket[]>();
    for(const trip of route.trips) for(const stop of trip.trip_stops || []) {
      const items=tickets.get(stop.employee_id) || [];
      items.push({...stop,trip_date:trip.trip_date,period:trip.period});tickets.set(stop.employee_id,items);
    }
    const employees:MonthlyEmployee[]=[...tickets.entries()].map(([id,items])=>({id,name:items[0].employee_name || "Funcionária",legValue:values.get(id) ?? null})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    const dates=dateList(from,to,route.trips.map(trip=>trip.trip_date));
    for(let pairStart=0;pairStart<employees.length;pairStart+=2){
      const pair=employees.slice(pairStart,pairStart+2);
      const suffix=employees.length>2 ? ` ${Math.floor(pairStart/2)+1}` : "";
      const sheet=workbook.addWorksheet(sheetName(`${route.name}${suffix}`,usedNames),{views:[{showGridLines:true,zoomScale:90}]});
      const headers=["Entrada ","Saida","Funcionaria","Data","Valor  (Entrada+Saida)","","Entrada ","Saida","Funcionaria","Data","Valor  (Entrada+Saida)","Total Valores"];
      const widths=[12.5,12.5,18.5,11.6,26.1,3,12.5,12.5,18.5,11.6,26.1,18.3];
      widths.forEach((width,index)=>sheet.getColumn(index+1).width=width);
      sheet.getRow(1).values=headers;
      for(let column=1;column<=12;column++){
        const cell=sheet.getCell(1,column);
        cell.font={name:"Aptos Narrow",size:11,bold:true,color:{argb:"FFFFFFFF"}};
        cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};
        cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:column===6?"FFFCE4D6":"FF4472C4"}};
        if(column!==6) cell.border={top:{style:"thin",color:{argb:"FFA6A6A6"}},bottom:{style:"thin",color:{argb:"FFA6A6A6"}},left:{style:"thin",color:{argb:"FFA6A6A6"}},right:{style:"thin",color:{argb:"FFA6A6A6"}}};
      }
      for(const date of dates){
        const row=sheet.addRow([]); const weekday=new Date(`${date}T12:00:00`).getDay();
        const dayRecords=pair.map(employee=>tickets.get(employee.id)?.filter(ticket=>ticket.trip_date===date) || []);
        if((weekday===0 || weekday===6) && dayRecords.every(record=>record.length===0)){
          sheet.mergeCells(row.number,1,row.number,12);const cell=row.getCell(1);cell.value="FINAL DE SEMANA";
          cell.font={name:"Aptos Narrow",size:11};cell.alignment={horizontal:"center",vertical:"middle"};
          cell.border={top:{style:"thin",color:{argb:"FFD9E1F2"}},bottom:{style:"thin",color:{argb:"FFD9E1F2"}},left:{style:"thin",color:{argb:"FFD9E1F2"}},right:{style:"thin",color:{argb:"FFD9E1F2"}}};
          continue;
        }
        pair.forEach((employee,index)=>{
          const employeeRecords=dayRecords[index];const outbound=employeeRecords.find(ticket=>ticket.period==="ida");const inbound=employeeRecords.find(ticket=>ticket.period==="volta");const base=index===0?1:7;
          const legs=Number(!!outbound)+Number(!!inbound);
          row.getCell(base).value=time(outbound?.scheduled_start || inbound?.scheduled_start);
          row.getCell(base+1).value=time(inbound?.scheduled_end || outbound?.scheduled_end);
          row.getCell(base+2).value=employeeRecords.length?employee.name:"";
          row.getCell(base+3).value=employeeRecords.length?excelDate(date):"";
          row.getCell(base+3).numFmt="dd/mm/yyyy";
          if(legs && employee.legValue != null){row.getCell(base+4).value={formula:`${employee.legValue}*${legs}`};row.getCell(base+4).numFmt='_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';}
        });
        if(dayRecords.some(records=>records.length)){row.getCell(12).value={formula:`SUM(E${row.number},K${row.number})`};row.getCell(12).numFmt='_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';}
        row.eachCell({includeEmpty:true},(cell,columnNumber)=>{cell.font={name:"Aptos Narrow",size:11,color:{argb:"FF1F1F1F"}};cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};if(columnNumber!==6)cell.border={top:{style:"thin",color:{argb:"FFD9E1F2"}},bottom:{style:"thin",color:{argb:"FFD9E1F2"}},left:{style:"thin",color:{argb:"FFD9E1F2"}},right:{style:"thin",color:{argb:"FFD9E1F2"}}};});
      }
      const totalRow=sheet.addRow([]); totalRow.getCell(12).value={formula:`SUM(L2:L${Math.max(1,totalRow.number-1)})`};totalRow.getCell(12).numFmt='_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
      sheet.pageSetup={orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1};
    }
  }
  workbook.calcProperties.fullCalcOnLoad=true;
}
