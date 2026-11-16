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

export function timeValue(value:string|null|undefined):number {
  const match=value?.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/);
  return match ? Number(match[1])*3600+Number(match[2])*60+Number(match[3] || 0) : Infinity;
}
type ShiftTimes={scheduled_start:string|null;scheduled_end:string|null};
export const stopTime = (stop:ShiftTimes,period:string) => period === "ida" ? stop.scheduled_start : stop.scheduled_end;
export function orderedStops<T extends ShiftTimes & {pickup_order:number;id:string}>(stops:T[],period:string):T[] {
  return [...stops].sort((a,b)=>{
    const first=timeValue(stopTime(a,period)),second=timeValue(stopTime(b,period));
    return (first === second ? 0 : first < second ? -1 : 1) || a.pickup_order-b.pickup_order || a.id.localeCompare(b.id);
  });
}
type TimetableTrip={id:string;status:string;period:string;trip_date:string;scheduled_time?:string|null;trip_stops?:ShiftTimes[]};
export function tripScheduleTime(trip:TimetableTrip):string|null {
  if(timeValue(trip.scheduled_time) !== Infinity) return trip.scheduled_time!;
  return [...(trip.trip_stops || [])].map(s=>stopTime(s,trip.period)).filter(t=>timeValue(t)!==Infinity).sort((a,b)=>timeValue(a)-timeValue(b))[0] || null;
}
export function orderedDailyTrips<T extends TimetableTrip>(trips:T[]):T[] {
  const priority:Record<string,number>={in_progress:0,planned:1,completed:2,cancelled:3};
  return [...trips].sort((a,b)=>{
    const first=timeValue(tripScheduleTime(a)),second=timeValue(tripScheduleTime(b));
    return (priority[a.status] ?? 4)-(priority[b.status] ?? 4) || a.trip_date.localeCompare(b.trip_date) ||
      (first === second ? 0 : first < second ? -1 : 1) || a.period.localeCompare(b.period) || a.id.localeCompare(b.id);
  });
}

/** A ida coleta nas casas; a volta embarca por local e entrega casa a casa. */
export function nextGuidedStep(stops: GuidedStop[], period: string): GuidedStep | null {
  const ordered = orderedStops(stops,period);
  const unresolved=ordered.filter(s=>s.status === "pending" || (s.status === "boarded" && !s.dropped_off_at));
  if(!unresolved.length) return null;
  const slot=timeValue(stopTime(unresolved[0],period));
  const pending = unresolved.filter(s=>s.status === "pending" && timeValue(stopTime(s,period)) === slot);
  const onboard = unresolved.filter(s=>s.status === "boarded" && timeValue(stopTime(s,period)) === slot);
  const first = pending[0] || onboard[0];
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

export function addressNavigation(address: string, point?: {lat:number;lng:number}|null) {
  const valid=point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat)<=90 && Math.abs(point.lng)<=180;
  if(valid) return {
    google:`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${point.lat},${point.lng}`,
    waze:`https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`,
  };
  return {
    google:`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`,
    waze:`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`,
  };
}
