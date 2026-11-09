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
      "id, driver_id, contract_id, route_id, contracts(company_lat, company_lng, work_site_lat, work_site_lng), routes(vehicle_id)"
    )
    .eq("id", tripId)
    .single();

  if (!trip || trip.driver_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: stops } = await supabase
    .from("trip_stops")
    .select("status, pickup_order, employees(address_lat, address_lng)")
    .eq("trip_id", tripId)
    .eq("status", "boarded")
    .order("pickup_order", { ascending: true });

  const employeeLocations = (stops ?? [])
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

  if (hasCompanyLocation && employeeLocations.length > 0) {
    // Ordem real de embarque -> destino no final. Prioriza a Directions API
    // (ruas de verdade); cai pra estimativa por linha reta se a API não
    // estiver configurada ou falhar, pra nunca travar a conclusão da corrida.
    const routeStops = [...employeeLocations, { lat: destLat, lng: destLng }];
    const realRoute = await calculateRouteDistance(routeStops);

    if (realRoute) {
      distanceKm = realRoute.distanceKm;
      distanceSource = "directions_api";
    } else {
      distanceKm = estimateDailyDistance({ lat: destLat, lng: destLng }, employeeLocations);
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
      distance_km: Number(distanceKm.toFixed(2)),
      fuel_cost: Number(fuelCost.toFixed(2)),
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
