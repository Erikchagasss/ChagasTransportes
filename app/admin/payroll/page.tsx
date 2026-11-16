"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { operationalDate } from "@/lib/local-date";
import { monthRange, summarizeDriver, type DriverActivity, type SalaryEntry } from "@/lib/driver-payroll";

type Driver = { id: string; full_name: string };
type Activity = DriverActivity & {
  period: string;
  routes: {name: string} | null;
  contracts: {company_name: string} | null;
};
const money = (value: number | null) => value == null ? "Não cadastrado" : value.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
const number = (value: number) => value.toLocaleString("pt-BR", {maximumFractionDigits: 1});
const statuses: Record<string,string> = {planned:"Programada", in_progress:"Em andamento", completed:"Concluída", cancelled:"Cancelada"};
const sources: Record<string,string> = {directions_api:"Calculado pelas ruas",straight_line_estimate:"Estimativa por coordenadas",legacy:"Registro anterior · método não identificado",none:"Sem distância calculada"};

async function pages<T>(fetchPage: (offset: number) => PromiseLike<{data: unknown[] | null; error: {message:string} | null}>) {
  const rows: T[] = [];
  for(let offset=0;;offset+=500) {
    const result = await fetchPage(offset);
    if(result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []) as T[]);
    if(!result.data || result.data.length < 500) return rows;
  }
}

export default function PayrollPage() {
  const [supabase] = useState(createClient);
  const [month,setMonth] = useState(() => operationalDate().slice(0,7));
  const [driverFilter,setDriverFilter] = useState("");
  const [drivers,setDrivers] = useState<Driver[]>([]);
  const [salaries,setSalaries] = useState<SalaryEntry[]>([]);
  const [trips,setTrips] = useState<Activity[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setError("");
    try {
      const {from,to} = monthRange(month);
      const [drivers,salaries,trips] = await Promise.all([
        pages<Driver>(offset => supabase.from("profiles").select("id,full_name").eq("role","driver").order("id").range(offset,offset+499)),
        pages<SalaryEntry>(offset => supabase.from("driver_salaries").select("driver_id,effective_month,monthly_salary").lte("effective_month",from).order("driver_id").order("effective_month").range(offset,offset+499)),
        pages<Activity>(offset => supabase.from("trips").select("id,driver_id,trip_date,status,period,distance_km,fuel_cost,distance_source,routes(name),contracts(company_name)").gte("trip_date",from).lte("trip_date",to).order("trip_date").order("id").range(offset,offset+499)),
      ]);
      if(current !== request.current) return;
      setDrivers(drivers.sort((a,b)=>a.full_name.localeCompare(b.full_name)));setSalaries(salaries);setTrips(trips);
    } catch(error) {
      if(current === request.current) {setDrivers([]);setSalaries([]);setTrips([]);setError(`Não foi possível carregar salários e km: ${error instanceof Error ? error.message : "falha de conexão"}. Verifique a migração v8 e tente atualizar.`);}
    } finally {if(current === request.current) setLoading(false);}
  },[supabase,month]);
  useEffect(()=> {void load();return ()=>{request.current++;};},[load]);

  async function saveSalary(driverId: string, amount: number) {
    setSaving(true);setError("");setNotice("");
    try {
      if(!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99) throw new Error("Informe um salário válido");
      const {error} = await supabase.from("driver_salaries").upsert({driver_id:driverId,effective_month:`${month}-01`,monthly_salary:Math.round(amount*100)/100},{onConflict:"driver_id,effective_month"}).select("driver_id").single();
      if(error) throw new Error(error.message);
      await load();setNotice("Salário salvo para vigorar a partir do mês selecionado.");
    } catch(error) {setError(error instanceof Error ? error.message : "Falha ao salvar salário");}
    finally {setSaving(false);}
  }
  const selected = drivers.filter(d=>!driverFilter || d.id === driverFilter);
  const rows = selected.map(driver=>({driver,summary:summarizeDriver(driver.id,month,salaries,trips)}));
  const totalSalary = rows.reduce((sum,r)=>sum+(r.summary.salary ?? 0),0);
  const missingSalary = rows.filter(r=>r.summary.salary == null).length;

  return <div className="space-y-6 px-4 py-8 md:px-8">
    <div><h1 className="text-2xl text-graphite-900">Salários e km dos motoristas</h1><p className="mt-2 text-sm text-graphite-600">Salário fixo mensal, sem comissão ou adicional por km. Você define o valor; o sistema consolida os cálculos.</p></div>
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-sm">Mês de referência<input aria-label="Mês de referência" type="month" required disabled={saving} value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){setMonth(e.target.value);setNotice("");}}} className="mt-1 block rounded-card border p-2" /></label>
      <label className="text-sm">Motorista<select disabled={loading || saving} value={driverFilter} onChange={e=>setDriverFilter(e.target.value)} className="mt-1 block rounded-card border p-2"><option value="">Todos os motoristas</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
      <button disabled={saving || loading} onClick={()=>void load()} className="rounded-card border px-4 py-2 text-sm">Atualizar</button>
    </div>
    {error && <p role="alert" className="rounded-card bg-red-50 p-4 text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-card bg-teal-50 p-4 text-teal-700">{notice}</p>}
    {loading ? <p role="status">Carregando salários e corridas...</p> : !error && <>
      <div className="grid gap-3 sm:grid-cols-3"><Stat label="Total fixo mensal cadastrado" value={money(totalSalary)} /><Stat label="Km de corridas concluídas" value={`${number(rows.reduce((sum,r)=>sum+r.summary.km,0))} km`} /><Stat label="Corridas concluídas" value={String(rows.reduce((sum,r)=>sum+r.summary.completedTrips,0))} /></div>
      {missingSalary > 0 && <p className="text-sm text-amber-700">{missingSalary} motorista(s) sem salário cadastrado neste mês. O total fixo ainda está incompleto.</p>}
      <p className="text-sm text-graphite-600">Os quilômetros são calculados pelas rotas, sem comprovação por GPS ou hodômetro. Corridas não concluídas ficam fora dos totais. O salário é integral para o mês: sem descontos por faltas, encargos ou rateio automático. No mês em andamento, a quilometragem e o custo por km são parciais.</p>
      {rows.map(({driver,summary})=><section key={driver.id} className="space-y-4 rounded-card border border-graphite-200 bg-white p-5">
        <h2 className="text-xl font-semibold">{driver.full_name}</h2>
        <SalaryForm key={`${driver.id}/${month}/${summary.salary}`} value={summary.salary} since={summary.salarySince} month={month} disabled={saving} onSave={value=>saveSalary(driver.id,value)} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Salário fixo do mês" value={money(summary.salary)} /><Stat label="Km registrados" value={`${number(summary.km)} km`} /><Stat label="Corridas / dias com corridas" value={`${summary.completedTrips} / ${summary.daysWorked}`} /><Stat label="Custo salarial por km" value={summary.salaryPerKm == null ? "Indisponível" : money(summary.salaryPerKm)} /></div>
        {(summary.missingDistance > 0 || summary.legacyDistance > 0) && <p className="text-sm text-amber-700">{summary.missingDistance > 0 ? `${summary.missingDistance} corrida(s) concluída(s) sem distância válida. O total de km está incompleto. ` : ""}{summary.legacyDistance > 0 ? `${summary.legacyDistance} corrida(s) anterior(es) sem identificação do método de distância.` : ""}</p>}
        <details><summary className="cursor-pointer text-sm font-medium">Ver corridas, rotas e contratos ({summary.totalTrips})</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Data","Sentido","Rota / contrato","Situação","Km","Origem dos km"].map(h=><th className="border-b p-2" key={h}>{h}</th>)}</tr></thead><tbody>{trips.filter(t=>t.driver_id === driver.id).map(t=><tr key={t.id}><td className="border-b p-2">{t.trip_date.split("-").reverse().join("/")}</td><td className="border-b p-2">{t.period === "ida" ? "Ida" : "Volta"}</td><td className="border-b p-2">{t.routes?.name || "Rota não disponível"}<br /><span className="text-graphite-600">{t.contracts?.company_name}</span></td><td className="border-b p-2">{statuses[t.status] || t.status}</td><td className="border-b p-2">{t.status === "completed" && t.distance_source !== "none" && t.distance_km != null ? number(Number(t.distance_km)) : "—"}</td><td className="border-b p-2">{sources[t.distance_source] || "Método não identificado"}</td></tr>)}</tbody></table>{!summary.totalTrips && <p className="p-3">Sem corridas neste mês. O salário fixo cadastrado permanece integral.</p>}</div></details>
      </section>)}
      {!drivers.length && <p>Nenhum motorista cadastrado. Cadastre em Motoristas para definir os salários.</p>}
    </>}
  </div>;
}

function Stat({label,value}:{label:string;value:string}) {
  return <div className="rounded-card border border-graphite-200 p-3"><p className="text-xs text-graphite-600">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
function SalaryForm({value,since,month,disabled,onSave}:{value:number|null;since:string|null;month:string;disabled:boolean;onSave:(value:number)=>Promise<void>}) {
  const [draft,setDraft] = useState(value == null ? "" : String(value));
  return <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void onSave(Number(draft));}}><label className="text-sm">Salário fixo mensal (R$)<input aria-label="Salário fixo mensal (R$)" type="number" min="0" max="9999999999.99" step="0.01" required disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} className="mt-1 block rounded-card border p-2" /></label><button disabled={disabled} className="rounded-card bg-teal-500 px-4 py-2 text-sm text-white disabled:opacity-50">{disabled ? "Salvando..." : "Salvar salário"}</button><p className="w-full text-xs text-graphite-600">Salvar define este valor a partir de {month.split("-").reverse().join("/")}, até o próximo reajuste. Meses anteriores são preservados.{since ? ` Vigência atual: ${since.slice(0,7).split("-").reverse().join("/")}.` : ""}</p></form>;
}
