"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addressNavigation, nextGuidedStep, tripProgress, type GuidedStop } from "@/lib/guided-trip";
import { pointForAddress, type LocationPoint } from "@/lib/location-point";

type Trip = {status:string;period:string;routes:{name:string}|null;contracts:{company_name:string;work_site_name:string|null;company_address:string;company_lat:number|null;company_lng:number|null;work_site_address:string|null;work_site_lat:number|null;work_site_lng:number|null}|null};
type NavigableStop = GuidedStop & {employees:{address:string;address_lat:number|null;address_lng:number|null;address_needs_review:boolean}|null};
const clock = (value:string|null) => value ? new Date(value).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}) : "—";
const primary = "min-h-14 w-full rounded-2xl bg-amber-500 px-5 py-4 text-base font-semibold text-graphite-950 disabled:opacity-40";

export default function TripPage() {
  const {tripId} = useParams<{tripId:string}>();
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [trip,setTrip] = useState<Trip|null>(null);
  const [stops,setStops] = useState<NavigableStop[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const locked = useRef(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [editing,setEditing] = useState<string|null>(null);
  const [absence,setAbsence] = useState<string|null>(null);
  const load = useCallback(async()=>{
    const [t,s] = await Promise.all([
      supabase.from("trips").select("status,period,routes(name),contracts(company_name,work_site_name,company_address,company_lat,company_lng,work_site_address,work_site_lat,work_site_lng)").eq("id",tripId).single(),
      supabase.from("trip_stops").select("id,status,employee_name,employee_phone,pickup_order,pickup_address,dropoff_address,arrived_at,boarded_at,dropoff_arrived_at,dropped_off_at,scheduled_start,scheduled_end,notes,employees(address,address_lat,address_lng,address_needs_review)").eq("trip_id",tripId).order("pickup_order").order("id"),
    ]);
    if(t.error || s.error) throw new Error("Não foi possível atualizar a rota. Confira sua conexão e tente novamente.");
    setTrip(t.data as unknown as Trip);setStops((s.data || []) as unknown as NavigableStop[]);
  },[supabase,tripId]);
  useEffect(()=>{void load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[load]);

  async function act(action:()=>Promise<void>,message:string) {
    if(locked.current) return;
    locked.current=true;setBusy(true);setError("");setNotice("");
    try {await action();await load();setNotice(message);}
    catch(e){setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");}
    finally{locked.current=false;setBusy(false);}
  }
  async function updateStops(ids:string[],values:object,condition?:{field:string;value:string|null}) {
    let query = supabase.from("trip_stops").update(values).eq("trip_id",tripId).in("id",ids);
    if(condition) query = condition.value === null ? query.is(condition.field,null) : query.eq(condition.field,condition.value);
    const {data,error} = await query.select("id");
    if(error) throw new Error(error.message);
    if(data?.length !== ids.length) throw new Error("A parada foi atualizada em outro acesso. Toque em Atualizar rota antes de continuar.");
  }
  const step = nextGuidedStep(stops,trip?.period || "ida");
  const employee = stops.find(s=>s.id === step?.stops[0]?.id)?.employees;
  const contract=trip?.contracts;
  const navPoint=step ? pointForAddress(step.address,[
    {address:employee?.address,lat:employee?.address_needs_review === false ? employee.address_lat : null,lng:employee?.address_needs_review === false ? employee.address_lng : null},
    {address:contract?.work_site_address,lat:contract?.work_site_lat,lng:contract?.work_site_lng},
    {address:contract?.company_address,lat:contract?.company_lat,lng:contract?.company_lng},
  ]) : null;
  const progress = tripProgress(stops);
  const active = trip?.status === "in_progress";
  const editable = active && !busy && !editing && !absence;
  const isReturn = trip?.period === "volta";
  const editedStop = stops.find(s=>s.id === editing);
  const arrivedAt = step?.kind === "pickup" ? "arrived_at" : "dropoff_arrived_at";

  function arrive() {
    if(!step) return;
    const ids=step.stops.filter(s=>!s[arrivedAt]).map(s=>s.id);
    void act(()=>updateStops(ids,{[arrivedAt]:new Date().toISOString()},{field:arrivedAt,value:null}),"Chegada registrada. Confirme agora o embarque ou a entrega.");
  }
  function board(stop:GuidedStop) {
    void act(async()=>{
      await updateStops([stop.id],{status:"boarded",boarded_at:new Date().toISOString()},{field:"status",value:"pending"});
      void fetch("/api/notifications/passenger-boarded",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stopId:stop.id})}).catch(()=>{});
    },`Embarque de ${stop.employee_name || "passageira"} registrado.`);
  }
  function deliver() {
    if(!step) return;
    void act(()=>updateStops(step.stops.map(s=>s.id),{dropped_off_at:new Date().toISOString()},{field:"dropped_off_at",value:null}),"Entrega registrada. A rota avançou para a próxima parada.");
  }
  function start() {
    void act(async()=>{
      const {error} = await supabase.from("trips").update({status:"in_progress",started_at:new Date().toISOString()}).eq("id",tripId).eq("status","planned").select("id").single();
      if(error) throw new Error(error.message);
    },"Rota iniciada. Siga para a primeira parada.");
  }
  function finish() {
    void act(async()=>{
      const response = await fetch(`/api/trips/${tripId}/complete`,{method:"POST"});
      if(!response.ok) throw new Error((await response.json()).error || "Não foi possível concluir a rota.");
      router.push("/driver");
    },"Rota concluída.");
  }
  return <div className="mx-auto max-w-2xl px-4 pb-12 pt-5">
    <div className="mb-5 flex items-center justify-between"><Link href="/driver" className="rounded-lg py-2 text-sm text-graphite-700">← Minhas viagens</Link><button disabled={busy || !!editing} onClick={()=>void act(async()=>{},"Rota atualizada.")} className="rounded-lg border border-graphite-200 bg-white px-3 py-2 text-sm disabled:opacity-40">Atualizar rota</button></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
    {loading ? <p role="status" className="p-8 text-center">Carregando sua rota...</p> : !trip ? <p className="p-4">Rota indisponível. Toque em Atualizar rota para tentar novamente.</p> : <>
      <header className="mb-5 overflow-hidden rounded-3xl bg-graphite-950 p-6 text-white">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-sm">{isReturn ? "Volta para casa" : "Ida ao trabalho"}</span><span className="text-sm text-white/70">{trip.status === "planned" ? "Programada" : active ? "Em andamento" : trip.status === "completed" ? "Concluída" : "Cancelada"}</span></div>
        <h1 className="text-2xl font-semibold leading-tight">{trip.routes?.name || "Sua rota"}</h1>
        <p className="mt-2 text-sm text-white/70">{trip.contracts?.work_site_name || trip.contracts?.company_name}</p>
        <div className="mt-6 flex gap-6 text-sm"><p><strong className="text-xl text-white">{progress.boarded}/{progress.total}</strong><br />embarcaram</p><p><strong className="text-xl text-white">{progress.delivered}</strong><br />entregues</p><p><strong className="text-xl text-white">{progress.absent}</strong><br />ausentes</p></div>
        <progress aria-label="Progresso de entregas e ausências" value={progress.resolved} max={Math.max(progress.total,1)} className="mt-5 h-2 w-full accent-teal-500" />
      </header>
      {!stops.length && <p className="rounded-2xl border bg-white p-5">Nenhuma passageira nesta rota. Verifique a lista em Minhas rotas.</p>}
      {trip.status === "planned" && stops.length > 0 && <div className="mb-5 space-y-3"><p className="text-sm text-graphite-600">Confira as paradas abaixo. Ao iniciar, o aplicativo vai guiar cada busca e entrega.</p><button disabled={busy} onClick={start} className={primary}>Iniciar rota</button></div>}
      {active && step && <section aria-label="Parada atual" className="mb-6 overflow-hidden rounded-3xl border border-teal-500 bg-white">
        <div className="flex items-center gap-3 bg-teal-50 px-5 py-4"><Pin /><h2 className="text-sm font-semibold text-teal-800">{step.arrived ? "Você chegou à parada" : "Próxima parada"} · {step.kind === "pickup" ? "Embarque" : "Entrega"}</h2></div>
        <div className="space-y-4 p-5">
          <div><p className="text-2xl font-semibold leading-tight text-graphite-950">{step.stops.length === 1 ? step.stops[0].employee_name || "Passageira" : step.kind === "pickup" ? "Embarque na empresa" : "Entrega na empresa"}</p><p className="mt-2 text-base leading-relaxed text-graphite-700">{step.address}</p></div>
          <Navigation address={step.address} point={navPoint} />
          <p className="text-xs text-graphite-600">{navPoint ? "Navegação pelas coordenadas salvas no cadastro." : "Endereço sem coordenada confirmada. Confira o destino no mapa antes de seguir; corrija o ponto em Funcionárias ou Contratos."}</p>
          {!step.arrived ? <><button disabled={!editable} onClick={arrive} className={primary}>{busy ? "Registrando..." : "Cheguei no local"}</button><p className="text-xs text-graphite-600">Chegada e embarque são horários separados. Confirme o embarque só quando a passageira entrar no veículo.</p></> : step.kind === "pickup" ? <div className="space-y-3">{step.stops.map(stop=><div key={stop.id} className="space-y-3 rounded-2xl bg-mist-50 p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{stop.employee_name || "Passageira"}</h3><p className="mt-1 text-sm text-graphite-600">{isReturn ? "Saída prevista" : "Entrada prevista"}: {(isReturn ? stop.scheduled_end : stop.scheduled_start)?.slice(0,5) || "Não informada"}</p><p className="text-sm text-graphite-600">Chegada registrada às {clock(stop.arrived_at)}</p></div>{stop.employee_phone && <a aria-label={`Ligar para ${stop.employee_name}`} href={`tel:${stop.employee_phone.replace(/[^+\d]/g,"")}`} className="rounded-xl border bg-white px-3 py-2 text-sm">Ligar</a>}</div>
            {stop.notes && <p className="whitespace-pre-wrap text-sm text-graphite-700">{stop.notes}</p>}
            <button disabled={!editable} onClick={()=>board(stop)} className={primary}>{busy ? "Registrando..." : "Funcionária embarcou"}</button>
            <div className="flex flex-wrap gap-4"><button disabled={!editable} onClick={()=>setAbsence(stop.id)} className="min-h-11 text-sm text-red-700 underline">Não compareceu</button></div>
          </div>)}</div> : <><p className="text-sm text-graphite-600">{step.stops.length === 1 ? "Confirme quando a passageira sair do veículo." : `Confirme a saída das ${step.stops.length} passageiras deste local.`}</p><ul className="space-y-1 text-sm">{step.stops.map(s=><li key={s.id}>• {s.employee_name}</li>)}</ul><button disabled={!editable} onClick={deliver} className={primary}>{busy ? "Registrando..." : step.stops.length === 1 ? "Confirmar desembarque" : `Confirmar entrega de ${step.stops.length} passageiras`}</button></>}
          <div className="space-y-2 border-t border-graphite-200 pt-3">{step.stops.map(s=><button key={s.id} disabled={!editable} onClick={()=>setEditing(s.id)} className="block min-h-11 text-left text-sm text-graphite-700 underline">Alterar local ou observações{step.stops.length > 1 ? ` · ${s.employee_name}` : ""}</button>)}</div>
        </div>
      </section>}
      {active && !step && <section className="mb-6 space-y-4 rounded-3xl border border-teal-500 bg-white p-6"><h2 className="text-xl font-semibold">Todas as paradas resolvidas</h2><p className="text-sm text-graphite-600">{progress.delivered} passageira(s) entregue(s) e {progress.absent} ausência(s) registrada(s).</p><button disabled={busy || !!editing || stops.length === 0} onClick={finish} className={primary}>{busy ? "Concluindo..." : "Finalizar rota"}</button></section>}
      {editedStop && <TicketEditor key={editedStop.id} stop={editedStop} busy={busy} onCancel={()=>setEditing(null)} onSave={(values)=>void act(async()=>{await updateStops([editedStop.id],values);setEditing(null);},"Local e observações salvos. Os próximos atalhos de navegação já usam o endereço atualizado.")} />}
      {absence && <section aria-label="Confirmar ausência" className="mb-5 space-y-3 rounded-2xl border border-red-200 bg-white p-5"><h2 className="font-semibold">Registrar ausência de {stops.find(s=>s.id === absence)?.employee_name}?</h2><p className="text-sm text-graphite-600">A passageira será retirada dos próximos embarques desta viagem.</p><form onSubmit={e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get("reason") || "").trim();const stop=stops.find(s=>s.id === absence);if(!stop) return;void act(async()=>{await updateStops([stop.id],{status:"absent",notes:[stop.notes,reason ? `Ausência: ${reason}` : "Ausência confirmada pelo motorista"].filter(Boolean).join("\n")},{field:"status",value:"pending"});setAbsence(null);},"Ausência registrada.");}}><label className="block text-sm">Motivo (opcional)<textarea name="reason" className="mt-1 w-full rounded-xl border p-3" /></label><div className="mt-3 flex gap-3"><button disabled={busy} className="min-h-12 rounded-xl bg-red-700 px-4 py-3 text-sm text-white">Confirmar ausência</button><button type="button" disabled={busy} onClick={()=>setAbsence(null)} className="min-h-12 rounded-xl border px-4 py-3 text-sm">Cancelar</button></div></form></section>}
      {stops.length > 0 && <section aria-label="Sequência da rota"><h2 className="mb-4 text-lg font-semibold">Sua sequência de paradas</h2><ol className="space-y-0">{stops.map((stop,index)=>{
        const current=step?.stops.some(s=>s.id === stop.id) && active;
        const label=stop.status === "absent" ? "Ausente" : stop.dropped_off_at ? "Entregue" : stop.status === "boarded" ? "No veículo" : "Aguardando busca";
        return <li key={stop.id} className="relative flex gap-3 pb-4"><div className="flex w-8 shrink-0 flex-col items-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${current ? "bg-teal-600 text-white" : stop.dropped_off_at ? "bg-teal-100 text-teal-800" : "border border-graphite-200 bg-white text-graphite-600"}`}>{index+1}</span><span className="mt-1 w-px flex-1 bg-graphite-200" /></div><details className={`min-w-0 flex-1 rounded-2xl border p-4 ${current ? "border-teal-500 bg-teal-50" : "border-graphite-200 bg-white"}`}><summary className="cursor-pointer"><span className="font-medium">{stop.employee_name || "Passageira"}</span><span className="ml-2 text-xs text-graphite-600">{label}</span></summary><div className="mt-3 space-y-2 text-sm text-graphite-600"><p>Busca: {stop.pickup_address || "Não informada"}</p><p>Entrega: {stop.dropoff_address || "Não informada"}</p><p>Chegada à busca: {clock(stop.arrived_at)}<br />Embarque: {clock(stop.boarded_at)}<br />Chegada à entrega: {clock(stop.dropoff_arrived_at)}<br />Desembarque: {clock(stop.dropped_off_at)}</p>{stop.notes && <p className="whitespace-pre-wrap">{stop.notes}</p>}{active && <button disabled={busy || !!editing || !!absence} onClick={()=>setEditing(stop.id)} className="min-h-11 underline">Editar local e observações</button>}</div></details></li>;
      })}</ol></section>}
    </>}
  </div>;
}
function Pin() {return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-teal-700"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;}
function Navigation({address,point}:{address:string;point:LocationPoint|null}) {
  if(!point) return <a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} className="block rounded-xl border border-amber-500 px-3 py-3 text-center text-sm font-medium">Pesquisar e conferir local no mapa</a>;
  const links=addressNavigation(address,point);
  return <div className="grid grid-cols-2 gap-3"><a target="_blank" rel="noopener noreferrer" href={links.google} className="rounded-xl bg-graphite-950 px-3 py-3 text-center text-sm font-medium text-white">Google Maps ↗</a><a target="_blank" rel="noopener noreferrer" href={links.waze} className="rounded-xl border border-graphite-200 px-3 py-3 text-center text-sm font-medium text-graphite-900">Waze ↗</a></div>;
}
function TicketEditor({stop,busy,onCancel,onSave}:{stop:GuidedStop;busy:boolean;onCancel:()=>void;onSave:(values:{pickup_address:string;dropoff_address:string;notes:string})=>void}) {
  return <section className="mb-6 rounded-2xl border border-amber-500 bg-white p-5"><h2 className="mb-3 font-semibold">Local e observações · {stop.employee_name}</h2><p className="mb-3 text-xs text-graphite-600">Salve ou cancele a edição antes de continuar a rota.</p><form className="space-y-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({pickup_address:String(f.get("pickup_address")).trim(),dropoff_address:String(f.get("dropoff_address")).trim(),notes:String(f.get("notes")).trim()});}}><label className="block text-sm">Local de busca<input required autoFocus name="pickup_address" defaultValue={stop.pickup_address || ""} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-sm">Local de entrega<input required name="dropoff_address" defaultValue={stop.dropoff_address || ""} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-sm">Observações<textarea name="notes" defaultValue={stop.notes} rows={3} className="mt-1 w-full rounded-xl border p-3" placeholder="Mudança de local, atraso ou informação sobre a passageira" /></label><div className="flex gap-3"><button disabled={busy} className="min-h-12 rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white">{busy ? "Salvando..." : "Salvar alterações"}</button><button disabled={busy} type="button" onClick={onCancel} className="min-h-12 rounded-xl border px-4 py-3 text-sm">Cancelar</button></div></form></section>;
}
