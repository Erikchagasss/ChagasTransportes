export interface GuidedStop {
  id: string;
  status: "pending" | "boarded" | "absent";
  employee_name: string | null;
  employee_phone: string | null;
  pickup_order: number;
  pickup_address: string | null;
  dropoff_address: string | null;
  arrived_at: string | null;
  boarded_at: string | null;
  dropoff_arrived_at: string | null;
  dropped_off_at: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  notes: string;
}
export interface GuidedStep {
  kind: "pickup" | "dropoff";
  address: string;
  stops: GuidedStop[];
  arrived: boolean;
}
const addressKey = (address: string | null) => (address || "").trim().toLocaleLowerCase("pt-BR");

/** A ida coleta nas casas; a volta embarca por local e entrega casa a casa. */
export function nextGuidedStep(stops: GuidedStop[], period: string): GuidedStep | null {
  const ordered = [...stops].sort((a,b)=>a.pickup_order-b.pickup_order || a.id.localeCompare(b.id));
  const pending = ordered.filter(s=>s.status === "pending");
  const onboard = ordered.filter(s=>s.status === "boarded" && !s.dropped_off_at);
  const first = pending[0] || onboard[0];
  if(!first) return null;
  const kind = pending.length ? "pickup" : "dropoff";
  const field = kind === "pickup" ? "pickup_address" : "dropoff_address";
  const arrivalField = kind === "pickup" ? "arrived_at" : "dropoff_arrived_at";
  const group = (period === "volta" && kind === "pickup") || (period === "ida" && kind === "dropoff");
  // Não agrupa endereços ausentes, nem mistura um local alterado com a empresa.
  const samePlace = group && addressKey(first[field])
    ? (kind === "pickup" ? pending : onboard).filter(s=>addressKey(s[field]) === addressKey(first[field]))
    : [first];
  return { kind, address:first[field] || "Endereço não informado", stops:samePlace, arrived:samePlace.every(s=>!!s[arrivalField]) };
}

export function tripProgress(stops: GuidedStop[]) {
  return {
    total: stops.length,
    boarded: stops.filter(s=>s.status === "boarded").length,
    delivered: stops.filter(s=>s.status === "boarded" && !!s.dropped_off_at).length,
    absent: stops.filter(s=>s.status === "absent").length,
    resolved: stops.filter(s=>s.status === "absent" || (s.status === "boarded" && !!s.dropped_off_at)).length,
  };
}

export function addressNavigation(address: string) {
  return {
    google:`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`,
    waze:`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`,
  };
}
