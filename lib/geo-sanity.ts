const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Distância acima da qual um endereço geocodificado é tratado como
 * suspeito — a LocationIQ (base OSM) às vezes casa um nome de rua com
 * uma rua homônima em outra cidade/litoral, bem longe de onde a pessoa
 * realmente mora. 80km cobre bem qualquer região metropolitana comum
 * sem disparar falso positivo pra funcionária que mora na cidade vizinha.
 */
export const SUSPICIOUS_DISTANCE_KM = 80;

export function suspiciousDistanceFrom(
  point: { lat: number; lng: number } | null,
  reference: { lat: number | null; lng: number | null } | null
): number | null {
  if (!point || !reference?.lat || !reference?.lng) return null;
  const distance = haversineKm(point.lat, point.lng, reference.lat, reference.lng);
  return distance > SUSPICIOUS_DISTANCE_KM ? distance : null;
}
