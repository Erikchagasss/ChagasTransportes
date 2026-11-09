interface RouteStop {
  lat: number;
  lng: number;
}

interface RouteDistanceResult {
  distanceKm: number;
  durationMin: number;
}

/**
 * Calcula a distância real rodada numa sequência de paradas (na ordem
 * dada) usando a LocationIQ Directions API (roteamento OSRM sobre dados
 * OpenStreetMap) — mesmo plano grátis do geocoding, sem cartão de
 * crédito. Respeita ruas de verdade, em vez da aproximação por linha
 * reta usada como fallback em lib/calculator.ts.
 *
 * stops precisa ter pelo menos 2 pontos, na ordem em que devem ser
 * visitados (primeiro = origem, último = destino).
 */
export async function calculateRouteDistance(
  stops: RouteStop[]
): Promise<RouteDistanceResult | null> {
  const apiKey = process.env.LOCATIONIQ_API_KEY;
  if (!apiKey || stops.length < 2) return null;

  // LocationIQ/OSRM espera "lon,lat" (invertido em relação ao par lat,lng
  // que usamos no resto do app) separados por ; na ordem da rota.
  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(";");
  const url = new URL(`https://us1.locationiq.com/v1/directions/driving/${coords}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("overview", "false");

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error("Directions falhou:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.[0]) return null;

  const route = data.routes[0] as { distance: number; duration: number };
  return { distanceKm: route.distance / 1000, durationMin: route.duration / 60 };
}
