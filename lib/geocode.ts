interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

// A LocationIQ (base OpenStreetMap) é bem mais sensível a abreviação do
// que o Google costumava ser — "Av." pode não bater com "Avenida" no
// índice. Expande as abreviações mais comuns de endereço no Brasil antes
// de consultar, sem exigir que o usuário digite tudo por extenso.
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bav\.?(?=\s|,|$)/gi, "Avenida"],
  [/\br\.(?=\s|,|$)/gi, "Rua"],
  [/\bal\.?(?=\s|,|$)/gi, "Alameda"],
  [/\btrav\.?(?=\s|,|$)/gi, "Travessa"],
  [/\bpça\.?(?=\s|,|$)/gi, "Praça"],
  [/\bpc\.?(?=\s|,|$)/gi, "Praça"],
  [/\brod\.?(?=\s|,|$)/gi, "Rodovia"],
  [/\best\.?(?=\s|,|$)/gi, "Estrada"],
  [/\bjd\.?(?=\s|,|$)/gi, "Jardim"],
  [/\bvl\.?(?=\s|,|$)/gi, "Vila"],
  [/\bqd\.?(?=\s|,|$)/gi, "Quadra"],
  [/\bbl\.?(?=\s|,|$)/gi, "Bloco"],
  [/\bapto\.?(?=\s|,|$)/gi, "Apartamento"],
  [/\bcj\.?(?=\s|,|$)/gi, "Conjunto"],
  // "nº 123" / "n. 123" antes de um número costuma confundir mais do que
  // ajudar o parser — remove e deixa só o número.
  [/\bn[ºo°]?\.?\s*(?=\d)/gi, ""],
];

function normalizeAddress(address: string): string {
  return ABBREVIATIONS.reduce((acc, [pattern, full]) => acc.replace(pattern, full), address).replace(
    /\s{2,}/g,
    " "
  );
}

async function locationIqSearch(apiKey: string, query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://us1.locationiq.com/v1/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString());

  // LocationIQ responde 404 quando não encontra nada (diferente da Google,
  // que responde 200 com status ZERO_RESULTS) — não é um erro de verdade.
  if (response.status === 404) return null;
  if (!response.ok) {
    console.error("Geocoding falhou:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const result = data[0];
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    formattedAddress: result.display_name,
  };
}

/**
 * Converte um endereço em texto para coordenadas usando a LocationIQ
 * Geocoding API (dados OpenStreetMap) — sem cartão de crédito, 5.000
 * chamadas grátis por dia. Retorna null se não encontrar ou se a API
 * key não estiver configurada — quem chama deve lidar com esse caso
 * sem quebrar o fluxo (o endereço em texto continua sendo salvo
 * normalmente).
 *
 * Tenta a versão com abreviações expandidas primeiro (mais chance de
 * bater com o índice do OSM); se não achar, tenta o texto original como
 * fallback, caso a expansão tenha atrapalhado algum caso específico.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.LOCATIONIQ_API_KEY;
  if (!apiKey) {
    console.warn("LOCATIONIQ_API_KEY não configurada — endereço não geocodificado.");
    return null;
  }

  const normalized = normalizeAddress(address);

  const result = await locationIqSearch(apiKey, normalized);
  if (result) return result;

  if (normalized !== address) {
    return locationIqSearch(apiKey, address);
  }

  return null;
}
