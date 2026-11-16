import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateDailyDistance } from "@/lib/calculator";
import { calculateRouteDistance } from "@/lib/distance";
import { sendPushToAdmins } from "@/lib/push/send";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, driver_id, contract_id, route_id, status, period, contracts(company_address, work_site_address, company_lat, company_lng, work_site_lat, work_site_lng), routes(vehicle_id)"
    )
    .eq("id", tripId)
    .single();

  if (!trip || trip.driver_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (trip.status !== "in_progress") {
    return NextResponse.json({error:"A corrida precisa estar em andamento."},{status:409});
  }

  const { data: stops, error: stopsError } = await supabase
    .from("trip_stops")
    .select("status, pickup_order, dropped_off_at, pickup_address, dropoff_address, employees(address, address_lat, address_lng)")
    .eq("trip_id", tripId)
    .order("pickup_order", { ascending: true });

  if (stopsError) return NextResponse.json({error:stopsError.message},{status:500});
  if ((stops ?? []).some(s=>s.status === "pending" || (s.status === "boarded" && !s.dropped_off_at))) {
    return NextResponse.json({error:"Registre todas as entregas e ausências antes de concluir."},{status:409});
  }
  const boarded = (stops ?? []).filter(s=>s.status === "boarded");

  const employeeLocations = boarded
    .map((s: any) => s.employees)
    .filter((e: any) => e?.address_lat != null && e?.address_lng != null)
    .map((e: any) => ({ lat: e.address_lat, lng: e.address_lng }));

  const contract = trip.contracts as any;
  // Destino real da corrida: usa a empresa de destino (work_site) quando
  // preenchida — caso de terceirização, onde a contratante não é o local
  // de trabalho. Sem isso, cai pro endereço do próprio contratante.
  const destLat = contract?.work_site_lat ?? contract?.company_lat;
  const destLng = contract?.work_site_lng ?? contract?.company_lng;
  const hasCompanyLocation = destLat != null && destLng != null;

  let distanceKm = 0;
  let distanceSource: "directions_api" | "straight_line_estimate" | "none" = "none";

  const addressesUnchanged = boarded.every((s: any) =>
    (trip.period === "ida" ? s.pickup_address : s.dropoff_address) === s.employees?.address &&
    (trip.period === "ida" ? s.dropoff_address : s.pickup_address) === (contract?.work_site_address ?? contract?.company_address)
  );
  if (hasCompanyLocation && employeeLocations.length > 0 && employeeLocations.length === boarded.length && addressesUnchanged) {
    // Ordem real de embarque -> destino no final. Prioriza a Directions API
    // (ruas de verdade); cai pra estimativa por linha reta se a API não
    // estiver configurada ou falhar, pra nunca travar a conclusão da corrida.
    const routeStops = trip.period === "volta"
      ? [{ lat: destLat, lng: destLng }, ...employeeLocations]
      : [...employeeLocations, { lat: destLat, lng: destLng }];
    const realRoute = await calculateRouteDistance(routeStops).catch(() => null);

    if (realRoute) {
      distanceKm = realRoute.distanceKm;
      distanceSource = "directions_api";
    } else {
      distanceKm = trip.period === "volta"
        ? estimateDailyDistance(employeeLocations[employeeLocations.length-1], [{lat:destLat,lng:destLng}, ...employeeLocations.slice(0,-1)])
        : estimateDailyDistance({ lat: destLat, lng: destLng }, employeeLocations);
      distanceSource = "straight_line_estimate";
    }
  }

  let fuelCost = 0;
  const route = trip.routes as any;
  if (route?.vehicle_id) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("km_per_liter, fuel_price")
      .eq("id", route.vehicle_id)
      .single();

    if (vehicle && vehicle.km_per_liter > 0) {
      fuelCost = (distanceKm / vehicle.km_per_liter) * vehicle.fuel_price;
    }
  }

  const { error } = await supabase
    .from("trips")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      distance_km: distanceSource === "none" ? null : Number(distanceKm.toFixed(2)),
      distance_source: distanceSource,
      fuel_cost: distanceSource === "none" ? null : Number(fuelCost.toFixed(2)),
    })
    .eq("id", tripId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: driverProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  await sendPushToAdmins({
    title: "Corrida concluída",
    body: `${driverProfile?.full_name ?? "Motorista"} finalizou a rota${
      distanceKm > 0 ? ` — ${distanceKm.toFixed(1)} km` : ""
    }`,
    url: "/admin",
  });

  return NextResponse.json({ distance_km: distanceKm, fuel_cost: fuelCost, distance_source: distanceSource });
}
