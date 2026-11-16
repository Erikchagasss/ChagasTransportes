import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "@/app/components/sign-out-button";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-mist-50">
      <header className="border-b border-graphite-200 bg-graphite-950 px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-graphite-600">Olá,</p>
            <p className="font-display text-lg">{profile?.full_name ?? "Motorista"}</p>
          </div>
          <SignOutButton />
        </div>
        <p className="mt-2 text-xs capitalize text-white/60">{todayLabel}</p>
      </header>
      <nav className="flex gap-4 border-b px-4 py-3 text-sm"><a href="/driver">Corridas do dia</a><a href="/driver/employees">Funcionárias</a><a href="/driver/routes">Minhas rotas</a></nav><main>{children}</main>
    </div>
  );
}

