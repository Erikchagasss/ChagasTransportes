import { createBrowserClient } from "@supabase/ssr";

// Nota: sem o generic <Database> por enquanto — o tipo mínimo em
// types/database.ts serve de referência de shape, mas gera falsos
// positivos de "never" no compilador com Insert/Update parciais.
// Recomendado: gerar o tipo oficial com
// `npx supabase gen types typescript --project-id SEU_ID > types/database.ts`
// e então voltar a passar <Database> aqui.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
