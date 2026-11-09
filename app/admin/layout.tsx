import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PushNotificationSetup from "./push-notification-setup";

const NAV = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/contracts", label: "Contratos" },
  { href: "/admin/routes", label: "Rotas" },
  { href: "/admin/employees", label: "Funcionárias" },
  { href: "/admin/drivers", label: "Motoristas" },
  { href: "/admin/vehicles", label: "Veículos" },
  { href: "/admin/legal", label: "Jurídico" },
  { href: "/admin/calculator", label: "Calculadora" },
  { href: "/admin/reports", label: "Relatórios" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-graphite-200 bg-graphite-950 p-4 text-white md:block">
        <p className="mb-6 font-display text-lg">Fretado</p>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-card px-3 py-2 text-sm text-graphite-600 hover:bg-graphite-900 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-graphite-800 pt-4">
          <PushNotificationSetup />
        </div>
      </aside>

      {/* Navegação mobile simplificada */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-graphite-200 bg-white p-2 md:hidden">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="px-2 py-1 text-xs text-graphite-700">
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1 pb-16 md:pb-0">{children}</div>
    </div>
  );
}
