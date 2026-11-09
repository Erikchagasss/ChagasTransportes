import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToAdmins } from "@/lib/push/send";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { stopId } = await request.json();

  // RLS garante que esse select só volta dado se o motorista logado for
  // dono da trip — não confiamos em nome/mensagem vindos do client.
  const { data: stop } = await supabase
    .from("trip_stops")
    .select("status, employees(full_name), trips(driver_id, contracts(company_name))")
    .eq("id", stopId)
    .single();

  if (!stop) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const employeeName = (stop as any).employees?.full_name ?? "Passageira";
  const companyName = (stop as any).trips?.contracts?.company_name ?? "";

  const driverId = (stop as any).trips?.driver_id;
  let driverName = "Motorista";
  if (driverId) {
    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", driverId)
      .single();
    driverName = driverProfile?.full_name ?? driverName;
  }

  await sendPushToAdmins({
    title: "Passageira embarcou",
    body: `${driverName} pegou ${employeeName}${companyName ? ` — ${companyName}` : ""}`,
    url: "/admin",
  });

  return NextResponse.json({ ok: true });
}
