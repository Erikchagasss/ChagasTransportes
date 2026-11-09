import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin" ? user : null;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { full_name, email, password, phone, cpf } = await request.json();

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: "nome, e-mail e senha são obrigatórios" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "a senha precisa ter pelo menos 6 caracteres" }, { status: 400 });
  }

  const service = createServiceClient();

  // Cria o usuário direto no Auth via service role — evita o admin ter
  // que abrir o dashboard do Supabase pra cadastrar motorista.
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // motorista já consegue logar sem confirmar e-mail
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "não foi possível criar o usuário" },
      { status: 400 }
    );
  }

  const { error: profileError } = await service.from("profiles").insert({
    id: created.user.id,
    role: "driver",
    full_name,
    phone: phone || null,
    cpf: cpf || null,
  });

  if (profileError) {
    // rollback: se o profile falhou, não deixa um usuário Auth órfão
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ id: created.user.id, full_name, email });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { driverId } = await request.json();
  if (!driverId) return NextResponse.json({ error: "driverId obrigatório" }, { status: 400 });

  const service = createServiceClient();
  // Apagar o usuário do Auth já remove o profile em cascata (FK on delete cascade)
  const { error } = await service.auth.admin.deleteUser(driverId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { driverId, newPassword } = await request.json();
  if (!driverId || !newPassword) {
    return NextResponse.json({ error: "driverId e newPassword são obrigatórios" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "a senha precisa ter pelo menos 6 caracteres" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(driverId, { password: newPassword });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
