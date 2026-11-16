"use client";
import { useState } from "react";
import { brazilPoint, parseLocationPoint, type LocationPoint } from "@/lib/location-point";
export default function LocationPicker({initial,address,onSave,onCancel}:{initial:LocationPoint|null;address:string;onSave:(point:LocationPoint)=>Promise<void>;onCancel:()=>void}) {
  const [text,setText]=useState(initial ? `${initial.lat}, ${initial.lng}` : "");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [accuracy,setAccuracy]=useState<number|null>(null);
  const point=parseLocationPoint(text);
  async function save() {
    if(!point || !confirmed) {setError("Informe um ponto válido no Brasil e confirme o local no mapa.");return;}
    setBusy(true);setError("");
    try {await onSave(point);} catch(e) {setError(e instanceof Error ? e.message : "Não foi possível salvar o ponto.");} finally {setBusy(false);}
  }
  function locate() {
    setError("");setBusy(true);setConfirmed(false);
    if(!navigator.geolocation) {setError("Este navegador não oferece localização. Cole o ponto do Google Maps.");setBusy(false);return;}
    navigator.geolocation.getCurrentPosition(position=>{
      setBusy(false);
      const p={lat:position.coords.latitude,lng:position.coords.longitude};
      if(!brazilPoint(p) || position.coords.accuracy > 25) {setError("GPS sem precisão suficiente (mais de 25 m). Vá para uma área aberta ou cole o ponto exato do Google Maps.");return;}
      setText(`${p.lat}, ${p.lng}`);setAccuracy(position.coords.accuracy);
    },()=>{setBusy(false);setError("Não foi possível obter o GPS. Confira a permissão do navegador ou cole o ponto do Google Maps.");},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }
  return <div className="mt-3 space-y-3 rounded-xl border border-teal-500 bg-white p-4">
    <p className="text-sm font-medium">Confirmar ponto exato de embarque / entrega</p><p className="text-xs text-graphite-600">{address}</p>
    <p className="text-xs text-graphite-600">No Google Maps, pressione o local exato (ou clique com o botão direito no computador) e copie latitude e longitude. Não use o centro da rua ou do bairro.</p>
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="block text-sm underline">Procurar endereço no Google Maps</a>
    <label className="block text-sm">Latitude, longitude<input aria-label="Latitude, longitude" value={text} onChange={e=>{setText(e.target.value);setConfirmed(false);setAccuracy(null);}} placeholder="-22.7195149, -47.3676155" className="mt-1 w-full rounded-lg border p-3" /></label>
    <button type="button" disabled={busy} onClick={locate} className="rounded-lg border px-3 py-2 text-sm">Usar GPS deste aparelho</button>
    <p className="text-xs text-graphite-600">Use o GPS somente quando estiver fisicamente no ponto correto de embarque/entrega.{accuracy != null ? ` Precisão informada pelo aparelho: ${Math.ceil(accuracy)} m.` : ""}</p>
    {point && <a href={`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer" className="block text-sm underline">Conferir este ponto no mapa</a>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={!point || busy} onChange={e=>setConfirmed(e.target.checked)} className="mt-1" />Conferi que este é o ponto correto.</label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-3"><button type="button" disabled={busy || !point || !confirmed} onClick={()=>void save()} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? "Aguarde..." : "Salvar ponto exato"}</button><button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button></div>
  </div>;
}
