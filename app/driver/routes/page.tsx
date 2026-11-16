import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WEEKDAY_LABELS } from "@/lib/schedule";
type RouteRow={id:string;name:string;weekdays:number[];contracts:{company_name:string;work_site_name:string|null}|null;route_employees:{id:string}[]};
export default async function DriverRoutes() {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login");
 const {data,error}=await supabase.from("routes").select("id,name,weekdays,contracts(company_name,work_site_name),route_employees(id)").eq("driver_id",user.id).eq("active",true).order("name");
 const routes=(data || []) as unknown as RouteRow[];
 return <div className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Minhas rotas</h1><p className="text-sm text-graphite-600">Estas são as rotas atribuídas a você pelo administrador. Para executar as viagens previstas para hoje, abra Corridas do dia.</p><Link href="/driver" className="inline-block rounded-xl bg-teal-600 px-4 py-3 text-sm font-medium text-white">Ver corridas do dia</Link>{error && <p role="alert" className="text-red-700">Não foi possível carregar suas rotas. Atualize a página.</p>}{routes.map(r=><Link className="block space-y-2 rounded-2xl border bg-white p-5" href={`/driver/routes/${r.id}`} key={r.id}><h2 className="text-lg font-semibold">{r.name}</h2><p className="text-sm text-graphite-600">{r.contracts?.work_site_name || r.contracts?.company_name}</p><p className="text-sm">{[...r.weekdays].sort((a,b)=>a-b).map(d=>WEEKDAY_LABELS[d]).join(", ")}</p><p className="text-xs text-graphite-600">{r.route_employees.length} passageira(s) vinculada(s)</p></Link>)}{!error && !routes.length && <p>Nenhuma rota ativa atribuída a você. Peça ao administrador para conferir a atribuição.</p>}</div>;
}
