// Script one-off pra criar o PRIMEIRO admin, direto pelo terminal.
// Usa a service role key, que ignora RLS por completo — não esbarra na
// restrição de "must be owner of table" que o SQL Editor do Supabase
// tem hoje em dia.
//
// Uso:
//   node scripts/create-admin.js SEU_USER_ID_AQUI "Seu Nome"
//
// O SEU_USER_ID_AQUI é o UID que aparece em Authentication -> Users no
// Supabase, para o usuário que você já criou lá.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const [, , userId, fullName] = process.argv;

if (!userId || !fullName) {
  console.error('Uso: node scripts/create-admin.js SEU_USER_ID_AQUI "Seu Nome"');
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local"
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { error } = await supabase
    .from("profiles")
    .insert({ id: userId, role: "admin", full_name: fullName });

  if (error) {
    console.error("Falhou:", error.message);
    process.exit(1);
  }

  console.log(`Admin criado: ${fullName} (${userId})`);
}

main();
