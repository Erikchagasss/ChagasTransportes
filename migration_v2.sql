-- ============================================================
-- MIGRATION_V2 — só as novidades desde a última vez que você
-- rodou o schema_fretado.sql completo.
--
-- Seguro rodar mais de uma vez: usa "if not exists" e
-- "create or replace" em tudo, então não quebra se algum pedaço
-- já existir. Não usa CREATE TABLE nem CREATE TYPE sem guarda,
-- que era o problema do schema_fretado.sql completo quando
-- rodado num banco que já tinha as tabelas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Novo tipo enum (só cria se ainda não existir — CREATE TYPE
--    não tem "if not exists" nativo no Postgres, por isso o DO block)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shift_type') then
    create type shift_type as enum ('fixed', '12x36');
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Novas colunas em CONTRACTS (empresa de destino / terceirização)
-- ------------------------------------------------------------
alter table public.contracts add column if not exists work_site_name text;
alter table public.contracts add column if not exists work_site_address text;
alter table public.contracts add column if not exists work_site_lat numeric(10,7);
alter table public.contracts add column if not exists work_site_lng numeric(10,7);

-- ------------------------------------------------------------
-- 3. Novas colunas em EMPLOYEES (escala de trabalho)
-- ------------------------------------------------------------
alter table public.employees add column if not exists shift_type shift_type not null default 'fixed';
alter table public.employees add column if not exists work_weekdays int[] not null default '{1,2,3,4,5}';
alter table public.employees add column if not exists shift_anchor_date date;
alter table public.employees add column if not exists shift_start_time time;
alter table public.employees add column if not exists shift_end_time time;

-- ------------------------------------------------------------
-- 4. Índice que pode ter ficado faltando
-- ------------------------------------------------------------
create index if not exists idx_contracts_driver on public.contracts(driver_id);

-- ------------------------------------------------------------
-- 5. MOTOR DE REPREÇO AUTOMÁTICO
-- CREATE OR REPLACE FUNCTION é sempre seguro rodar de novo.
-- Triggers não têm "or replace", por isso DROP + CREATE.
-- ------------------------------------------------------------
create or replace function public.haversine_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable
as $$
  select 6371 * 2 * asin(sqrt(
    pow(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.estimate_contract_daily_distance(p_contract_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_dest_lat numeric;
  v_dest_lng numeric;
  v_total numeric := 0;
  v_count int := 0;
  r record;
begin
  select
    coalesce(work_site_lat, company_lat),
    coalesce(work_site_lng, company_lng)
  into v_dest_lat, v_dest_lng
  from public.contracts where id = p_contract_id;

  if v_dest_lat is null or v_dest_lng is null then
    return null;
  end if;

  for r in
    select address_lat, address_lng from public.employees
    where contract_id = p_contract_id and active = true
      and address_lat is not null and address_lng is not null
  loop
    v_total := v_total + public.haversine_km(v_dest_lat, v_dest_lng, r.address_lat, r.address_lng) * 2;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    return 0;
  end if;

  return v_total * 1.4;
end;
$$;

create or replace function public.recalculate_contract_pricing(p_contract_id uuid)
returns void
language plpgsql
as $$
declare
  c record;
  v record;
  v_daily_km numeric;
  v_monthly_km numeric;
  v_fuel_cost numeric;
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

  if c.vehicle_id is not null then
    select * into v from public.vehicles where id = c.vehicle_id;
  end if;

  v_monthly_km := v_daily_km * coalesce(c.work_days_per_month, 22);
  v_fuel_cost := case
    when v.km_per_liter is not null and v.km_per_liter > 0
    then (v_monthly_km / v.km_per_liter) * v.fuel_price
    else 0
  end;
  v_direct_cost := v_fuel_cost + coalesce(v.monthly_depreciation, 0) + coalesce(c.other_fixed_costs, 0);

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

create or replace function public.trg_recalc_on_employee_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_contract_pricing(old.contract_id);
    return old;
  end if;

  perform public.recalculate_contract_pricing(new.contract_id);

  if tg_op = 'UPDATE' and new.contract_id is distinct from old.contract_id then
    perform public.recalculate_contract_pricing(old.contract_id);
  end if;

  return new;
end;
$$;

drop trigger if exists employees_recalc_pricing_ins_del on public.employees;
create trigger employees_recalc_pricing_ins_del
after insert or delete on public.employees
for each row execute function public.trg_recalc_on_employee_change();

drop trigger if exists employees_recalc_pricing_upd on public.employees;
create trigger employees_recalc_pricing_upd
after update of address, address_lat, address_lng, active, contract_id
on public.employees
for each row execute function public.trg_recalc_on_employee_change();

create or replace function public.trg_recalc_on_contract_change()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_contract_pricing(new.id);
  return new;
end;
$$;

drop trigger if exists contracts_recalc_pricing on public.contracts;
create trigger contracts_recalc_pricing
after update of monthly_value, driver_pct, tax_pct, margin_pct, other_fixed_costs,
  work_days_per_month, vehicle_id, company_lat, company_lng, work_site_lat, work_site_lng
on public.contracts
for each row execute function public.trg_recalc_on_contract_change();

-- ------------------------------------------------------------
-- 6. Dispara o cálculo agora pra quem já tem contrato cadastrado
--    (sem isso, os contratos existentes ficam com needs_price_review
--    em branco até a próxima mudança de endereço)
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
