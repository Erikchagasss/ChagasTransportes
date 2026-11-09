import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const { address } = await request.json();
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  }

  if (profile?.role !== "admin") {
    // RLS limita a consulta aos contratos do motorista. Permite localizar
    // somente um endereço já cadastrado e visível para ele.
    const { data: employee } = await supabase.from("employees")
      .select("id").eq("address", address).limit(1).maybeSingle();
    if (profile?.role !== "driver" || !employee) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const result = await geocodeAddress(address);
  if (!result) {
    return NextResponse.json({ error: "não foi possível localizar o endereço" }, { status: 422 });
  }

  return NextResponse.json(result);
}
