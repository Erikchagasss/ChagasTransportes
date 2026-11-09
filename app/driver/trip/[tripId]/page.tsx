"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
interface Ticket { id: string; status: string; boarded_at: string | null; dropped_off_at: string | null; employee_name: string; employee_phone: string | null; scheduled_start: string | null; scheduled_end: string | null; pickup_address: string; dropoff_address: string; notes: string; }
const time = (value: string | null) => value ? new Date(value).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export default function TripPage() {
 const { tripId } = useParams<{tripId: string}>();
 const router = useRouter();
 const [supabase] = useState(createClient);
 const [trip, setTrip] = useState<{status: string; period: string} | null>(null);
 const [stops, setStops] = useState<Ticket[]>([]);
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const [loading, setLoading] = useState(true);
 const load = useCallback(async () => {
  const [t,s] = await Promise.all([supabase.from("trips").select("status, period").eq("id",tripId).single(), supabase.from("trip_stops").select("*").eq("trip_id",tripId).order("pickup_order")]);
  if(t.error || s.error) setError("Não foi possível carregar os tickets. Verifique a conexão e a migração v7.");
  else {setTrip(t.data);setStops(s.data || []);}
  setLoading(false);
 }, [supabase,tripId]);
 useEffect(()=>{void load();},[load]);
 async function update(table: string, id: string, values: object) {
  setBusy(true);setError("");
  try {const {error} = await supabase.from(table).update(values).eq("id",id).select("id").single(); if(error) throw error; if(table === "trip_stops" && "status" in values && values.status === "boarded") void fetch("/api/notifications/passenger-boarded", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stopId:id})}).catch(()=>{}); await load();}
  catch(e) {setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");}
  finally {setBusy(false);}
 }
 async function complete() {
  setBusy(true);setError("");
  try {const response = await fetch(`/api/trips/${tripId}/complete`,{method:"POST"});if(!response.ok) throw new Error((await response.json()).error || "Falha ao concluir");router.push("/driver");}
  catch(e){setError(e instanceof Error ? e.message : "Falha de conexão");}finally{setBusy(false);}
 }
 const active = trip?.status === "in_progress";
 const resolved = stops.every(s=>s.status === "absent" || (s.status === "boarded" && !!s.dropped_off_at));
 return <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-28">
  <a href="/driver" className="text-sm underline">Voltar às corridas</a>
  <h1 className="text-2xl">Tickets · {trip?.period === "ida" ? "Casa → Trabalho" : "Trabalho → Casa"}</h1>
  {error && <p role="alert" className="rounded-card bg-red-50 p-4 text-red-700">{error}</p>}
  {loading ? <p>Carregando...</p> : !trip ? <p>Corrida indisponível.</p> : <>
  {trip.status === "planned" && <button disabled={busy} onClick={()=>update("trips",tripId,{status:"in_progress",started_at:new Date().toISOString()})} className="w-full rounded-card bg-teal-500 p-3 text-white">Iniciar corrida</button>}
  {!stops.length && <p>Nenhuma funcionária vinculada. Configure a rota e gere as corridas no painel.</p>}
  {stops.map(s=><article key={s.id} className="space-y-3 rounded-card border border-graphite-200 bg-white p-4">
   <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">{s.employee_name}</h2><span className="text-sm">{s.status === "absent" ? "Ausente" : s.dropped_off_at ? "Entregue" : s.status === "boarded" ? "Em transporte" : "Aguardando"}</span></div>
   {s.employee_phone && <a className="block text-sm underline" href={`tel:${s.employee_phone}`}>{s.employee_phone}</a>}
   <p className="text-sm">Turno previsto: {s.scheduled_start?.slice(0,5) || "—"} às {s.scheduled_end?.slice(0,5) || "—"}</p>
   <p className="text-sm">Busca: {time(s.boarded_at)} · Entrega: {time(s.dropped_off_at)}</p>
   <div className="flex gap-4 text-sm underline"><a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.pickup_address || "")}`}>Navegar até a busca</a><a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.dropoff_address || "")}`}>Navegar até a entrega</a></div>
   <form key={s.id+String(active)} className="space-y-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void update("trip_stops",s.id,{pickup_address:String(f.get("pickup_address")),dropoff_address:String(f.get("dropoff_address")),notes:String(f.get("notes"))});}}>
    <label className="block text-sm">Local de busca<input required disabled={!active} name="pickup_address" defaultValue={s.pickup_address} className="block w-full rounded border p-2" /></label>
    <label className="block text-sm">Local de entrega<input required disabled={!active} name="dropoff_address" defaultValue={s.dropoff_address} className="block w-full rounded border p-2" /></label>
    <label className="block text-sm">Observações<textarea disabled={!active} name="notes" defaultValue={s.notes} placeholder="Alteração de local, atraso, motivo da ausência..." className="block w-full rounded border p-2" /></label>
    {active && <button disabled={busy} className="rounded border px-3 py-2 disabled:opacity-40">Salvar locais e observações</button>}
   </form>
   {active && s.status === "pending" && <div className="flex gap-2"><button disabled={busy} onClick={()=>update("trip_stops",s.id,{status:"boarded",boarded_at:new Date().toISOString()})} className="flex-1 rounded-card bg-amber-500 p-3">Confirmar busca / embarque</button><button disabled={busy} onClick={()=>update("trip_stops",s.id,{status:"absent"})} className="rounded border p-3">Ausente</button></div>}
   {active && s.status === "boarded" && !s.dropped_off_at && <button disabled={busy} onClick={()=>update("trip_stops",s.id,{dropped_off_at:new Date().toISOString()})} className="w-full rounded-card bg-teal-500 p-3 text-white">Confirmar entrega / desembarque</button>}
  </article>)}
  {active && <button disabled={busy || !resolved} onClick={complete} className="w-full rounded-card bg-graphite-950 p-4 text-white disabled:opacity-40">{busy ? "Salvando..." : resolved ? "Concluir corrida" : "Registre todas as entregas e ausências"}</button>}
  </>}
 </div>;
}
