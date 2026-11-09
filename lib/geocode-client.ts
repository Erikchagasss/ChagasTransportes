export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Chama /api/geocode. Retorna null em caso de falha (endereço não
 * encontrado, API fora do ar, etc) — quem chama deve seguir o fluxo
 * normalmente e só sinalizar visualmente que o endereço não foi
 * localizado, sem travar o cadastro.
 */
export async function geocodeAddressClient(address: string): Promise<GeocodeResult | null> {
  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
