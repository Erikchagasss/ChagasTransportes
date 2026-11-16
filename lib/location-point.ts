export interface LocationPoint { lat: number; lng: number }
export function validPoint(point: {lat:unknown;lng:unknown} | null | undefined): point is LocationPoint {
  return !!point && typeof point.lat === "number" && typeof point.lng === "number" && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}
export function brazilPoint(point: LocationPoint) {
  return validPoint(point) && point.lat >= -34 && point.lat <= 6 && point.lng >= -75 && point.lng <= -28;
}
export function parseLocationPoint(input: string): LocationPoint | null {
  const text=input.trim();
  // Somente pares explícitos. O @ de um link do Maps pode ser a câmera, não o destino.
  const match = text.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(!match) return null;
  const point={lat:Number(match[1]),lng:Number(match[2])};
  return brazilPoint(point) ? point : null;
}
export const sameAddress = (a:string|null|undefined,b:string|null|undefined) =>
  !!a?.trim() && !!b?.trim() && a.trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR") === b.trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR");

export function pointForAddress(address:string, sources:Array<{address:string|null|undefined;lat:unknown;lng:unknown}>):LocationPoint|null {
  for(const source of sources) {
    if(!sameAddress(address,source.address) || source.lat == null || source.lng == null || source.lat === "" || source.lng === "") continue;
    const point={lat:Number(source.lat),lng:Number(source.lng)};
    if(brazilPoint(point)) return point;
  }
  return null;
}
