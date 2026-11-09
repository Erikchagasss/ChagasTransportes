interface NavPoint {
  lat: number;
  lng: number;
  label?: string;
}

/**
 * Link universal do Google Maps — abre o app se instalado, senão cai
 * no navegador. Funciona em Android e iOS sem precisar detectar o
 * sistema operacional.
 */
export function googleMapsUrl(dest: NavPoint): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Link universal do Waze — mesma lógica, abre o app se instalado.
 */
export function wazeUrl(dest: NavPoint): string {
  const params = new URLSearchParams({
    ll: `${dest.lat},${dest.lng}`,
    navigate: "yes",
  });
  return `https://waze.com/ul?${params.toString()}`;
}
