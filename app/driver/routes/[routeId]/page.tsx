import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WEEKDAY_LABELS } from "@/lib/schedule";
export default async function DriverRouteDetail({params}:{params:Promise<{routeId:string}>}) {
 const {routeId}=await params;
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const {data:route,error}=await supabase.from("routes").select("name,weekdays,contracts(company_name,work_site_name)").eq("id",routeId).eq("driver_id",user.id).eq("active",true).maybeSingle();
 if(error) return <p role="alert" className="p-6 text-red-700">Não foi possível carregar a rota. Atualize a página.</p>;
 if(!route) return <p className="p-6">Rota não encontrada ou não atribuída a você.</p>;
 const contract=route.contracts as unknown as {company_name:string;work_site_name:string|null}|null;
 return <div className="mx-auto max-w-2xl space-y-4 p-6"><Link href="/driver/routes" className="text-sm underline">Voltar às minhas rotas</Link><h1 className="text-2xl font-semibold">{route.name}</h1><p>{contract?.work_site_name || contract?.company_name}</p><section className="space-y-2 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Dias de operação</h2><p>{[...(route.weekdays as number[])].sort((a,b)=>a-b).map(d=>WEEKDAY_LABELS[d]).join(", ")}</p><p className="text-sm text-graphite-600">A lista de buscas e entregas aparece dentro de cada viagem do dia. O administrador cuida da composição da rota e dos cadastros.</p></section><Link href="/driver" className="inline-block rounded-xl bg-teal-600 px-4 py-3 font-medium text-white">Abrir corridas do dia</Link></div>;
}
