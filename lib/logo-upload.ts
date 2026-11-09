import { createClient } from "@/lib/supabase/client";

/**
 * Sobe a logo pra bucket público "contract-logos" e retorna a URL
 * pública. Substitui a logo anterior se já existir uma pra esse
 * contrato (mesmo path, upsert true).
 */
export async function uploadContractLogo(contractId: string, file: File): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${contractId}/logo.${ext}`;

  const { error } = await supabase.storage
    .from("contract-logos")
    .upload(path, file, { upsert: true, cacheControl: "3600" });

  if (error) {
    console.error("Falha no upload da logo:", error.message);
    return null;
  }

  const { data } = supabase.storage.from("contract-logos").getPublicUrl(path);
  // cache-bust: sem isso, o navegador pode continuar mostrando a logo antiga
  // depois de trocar (mesmo path, mesma URL)
  return `${data.publicUrl}?t=${Date.now()}`;
}
