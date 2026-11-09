import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * ATENÇÃO: usa a service role key, que ignora RLS por completo.
 * Nunca importar isso em um Client Component ou expor a chave no bundle
 * do browser — só existe pra rotas server-side que precisam ler dados
 * de outro usuário (ex: motorista disparando notificação pro admin).
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
