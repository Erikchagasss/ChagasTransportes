-- ============================================================
-- MIGRATION_V5
-- Move o vínculo de veículo de CONTRACTS pra ROUTES — um contrato
-- pode ter várias vans diferentes, cada rota usa a sua.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================

alter table public.routes add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

-- migra o veículo único que já estava em contracts.vehicle_id pras
-- rotas desse contrato que ainda não têm veículo definido
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contracts' and column_name = 'vehicle_id'
  ) then
    update public.routes r
    set vehicle_id = c.vehicle_id
    from public.contracts c
    where r.contract_id = c.id
      and r.vehicle_id is null
      and c.vehicle_id is not null;
  end if;
end $$;

-- precisa derrubar o gatilho antigo ANTES de apagar a coluna que ele
-- escutava (vehicle_id) — senão o Postgres recusa com "other objects
-- depend on it".
drop trigger if exists contracts_recalc_pricing on public.contracts;

alter table public.contracts drop column if exists vehicle_id;

-- ------------------------------------------------------------
-- Motor de repreço: soma combustível/depreciação por rota (cada uma
-- com seu próprio veículo), em vez de um veículo único pro contrato.
-- ------------------------------------------------------------
create or replace function public.estimate_contract_monthly_vehicle_costs(p_contract_id uuid)
returns table(total_fuel_cost numeric, total_depreciation numeric)
language plpgsql
as $$
declare
  v_dest_lat numeric;
  v_dest_lng numeric;
  v_work_days numeric;
  v_route record;
  v_vehicle record;
  v_prev_lat numeric;
  v_prev_lng numeric;
  v_route_km numeric;
  v_stop_count int;
  r record;
  v_fuel numeric := 0;
  v_depreciation numeric := 0;
begin
  select
    coalesce(work_site_lat, company_lat),
    coalesce(work_site_lng, company_lng),
    coalesce(work_days_per_month, 22)
  into v_dest_lat, v_dest_lng, v_work_days
  from public.contracts where id = p_contract_id;

  if v_dest_lat is null or v_dest_lng is null then
    return query select 0::numeric, 0::numeric;
    return;
  end if;

  for v_route in
    select id, vehicle_id from public.routes where contract_id = p_contract_id and active = true
  loop
    if v_route.vehicle_id is null then
      continue;
    end if;

    select * into v_vehicle from public.vehicles where id = v_route.vehicle_id;
    v_depreciation := v_depreciation + coalesce(v_vehicle.monthly_depreciation, 0);

    v_prev_lat := null;
    v_prev_lng := null;
    v_route_km := 0;
    v_stop_count := 0;

    for r in
      select e.address_lat, e.address_lng
      from public.route_employees re
      join public.employees e on e.id = re.employee_id
      where re.route_id = v_route.id and e.active = true
        and e.address_lat is not null and e.address_lng is not null
      order by re.pickup_order
    loop
      if v_prev_lat is not null then
        v_route_km := v_route_km
          + public.haversine_km(v_prev_lat, v_prev_lng, r.address_lat, r.address_lng);
      end if;
      v_prev_lat := r.address_lat;
      v_prev_lng := r.address_lng;
      v_stop_count := v_stop_count + 1;
    end loop;

    if v_stop_count > 0 and v_vehicle.km_per_liter is not null and v_vehicle.km_per_liter > 0 then
      v_route_km := (v_route_km
        + public.haversine_km(v_prev_lat, v_prev_lng, v_dest_lat, v_dest_lng)) * 2 * 1.4;
      v_fuel := v_fuel + (v_route_km * v_work_days / v_vehicle.km_per_liter) * v_vehicle.fuel_price;
    end if;
  end loop;

  return query select v_fuel, v_depreciation;
end;
$$;

create or replace function public.recalculate_contract_pricing(p_contract_id uuid)
returns void
language plpgsql
as $$
declare
  c record;
  v_daily_km numeric;
  v_vehicle_costs record;
  v_direct_cost numeric;
  v_denominator numeric;
  v_suggested numeric;
  v_variance numeric;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return;
  end if;

  v_daily_km := public.estimate_contract_daily_distance(p_contract_id);

  if v_daily_km is null then
    update public.contracts
    set current_estimated_distance_km = null,
        suggested_monthly_value = null,
        value_variance_pct = null,
        needs_price_review = false
    where id = p_contract_id;
    return;
  end if;

  select * into v_vehicle_costs from public.estimate_contract_monthly_vehicle_costs(p_contract_id);

  v_direct_cost := coalesce(v_vehicle_costs.total_fuel_cost, 0)
    + coalesce(v_vehicle_costs.total_depreciation, 0)
    + coalesce(c.other_fixed_costs, 0);

  v_denominator := 1 - coalesce(c.driver_pct, 0) - coalesce(c.tax_pct, 0) - coalesce(c.margin_pct, 0.15);

  if v_denominator <= 0 then
    update public.contracts
    set current_estimated_distance_km = v_daily_km,
        suggested_monthly_value = null,
        value_variance_pct = null,
        needs_price_review = true
    where id = p_contract_id;
    return;
  end if;

  v_suggested := v_direct_cost / v_denominator;
  v_variance := case
    when c.monthly_value > 0 then (v_suggested - c.monthly_value) / c.monthly_value
    else null
  end;

  update public.contracts
  set current_estimated_distance_km = v_daily_km,
      suggested_monthly_value = v_suggested,
      value_variance_pct = v_variance,
      needs_price_review = (v_variance is not null and abs(v_variance) > 0.05)
  where id = p_contract_id;
end;
$$;

-- gatilhos: rota reage a mudança de veículo agora; contrato não escuta
-- mais vehicle_id (a coluna nem existe mais nele)
drop trigger if exists routes_recalc_pricing_upd on public.routes;
create trigger routes_recalc_pricing_upd
after update of active, contract_id, vehicle_id on public.routes
for each row execute function public.trg_recalc_on_route_change();

drop trigger if exists contracts_recalc_pricing on public.contracts;
create trigger contracts_recalc_pricing
after update of monthly_value, driver_pct, tax_pct, margin_pct, other_fixed_costs,
  work_days_per_month, company_lat, company_lng, work_site_lat, work_site_lng
on public.contracts
for each row execute function public.trg_recalc_on_contract_change();

-- ------------------------------------------------------------
-- Recalcula todos os contratos agora com a fórmula corrigida
-- ------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in select id from public.contracts loop
    perform public.recalculate_contract_pricing(c.id);
  end loop;
end $$;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
