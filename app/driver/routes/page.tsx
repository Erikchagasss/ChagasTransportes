import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
export default async function DriverRoutes() {
 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 const { data: routes, error } = await supabase.from("routes").select("id,name").eq("driver_id",user!.id).eq("active",true).order("name");
 return <div className="space-y-4 p-6"><h1 className="text-2xl">Minhas rotas</h1><p>Adicione, remova ou reordene funcionárias para as próximas corridas.</p>{error && <p role="alert">Falha ao carregar rotas.</p>}{routes?.map(r=><Link className="block rounded-card border bg-white p-4" href={`/driver/routes/${r.id}`} key={r.id}>{r.name}</Link>)}{!error && !routes?.length && <p>Nenhuma rota ativa vinculada.</p>}</div>;
}
