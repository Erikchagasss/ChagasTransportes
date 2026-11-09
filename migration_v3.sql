-- ============================================================
-- MIGRATION_V3
-- 1. Permite mais de um motorista por contrato (contract_drivers, N:N)
-- 2. Corrige o cálculo de distância do repreço automático: antes
--    somava ida-e-volta por funcionária (multiplicava o resultado
--    pelo número de funcionárias); agora monta a rota de verdade,
--    na ordem de embarque configurada em Rotas, por rota do contrato.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================

-- ------------------------------------------------------------
-- 1. CONTRACT_DRIVERS — substitui o campo único contracts.driver_id
-- ------------------------------------------------------------
create table if not exists public.contract_drivers (
  contract_id uuid not null references public.contracts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  primary key (contract_id, driver_id)
);

alter table public.contract_drivers enable row level security;

drop policy if exists "contract_drivers_admin_all" on public.contract_drivers;
create policy "contract_drivers_admin_all"
  on public.contract_drivers for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "contract_drivers_driver_select_own" on public.contract_drivers;
create policy "contract_drivers_driver_select_own"
  on public.contract_drivers for select
  using (driver_id = auth.uid());

create index if not exists idx_contract_drivers_driver on public.contract_drivers(driver_id);

-- migra o motorista único que já estava salvo em contracts.driver_id
-- (se essa coluna ainda existir — não duplica se já rodou antes)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contracts' and column_name = 'driver_id'
  ) then
    insert into public.contract_drivers (contract_id, driver_id)
    select id, driver_id from public.contracts where driver_id is not null
    on conflict do nothing;
  end if;
end $$;

-- atualiza a policy de select do motorista pra usar ROUTES em vez do
-- campo único que está saindo
drop policy if exists "contracts_driver_select_own" on public.contracts;
create policy "contracts_driver_select_own"
  on public.contracts for select
  using (
    exists (
      select 1 from public.routes r
      where r.contract_id = contracts.id and r.driver_id = auth.uid()
    )
  );

-- a policy de employees também dependia de contracts.driver_id — precisa
-- ser trocada ANTES de derrubar a coluna, senão o DROP COLUMN falha
-- (2BP01: outros objetos dependem dela)
drop policy if exists "employees_driver_select_own_contract" on public.employees;
create policy "employees_driver_select_own_contract"
  on public.employees for select
  using (
    exists (
      select 1 from public.routes r
      where r.contract_id = employees.contract_id
      and r.driver_id = auth.uid()
    )
  );

-- remove a coluna antiga (o índice idx_contracts_driver cai junto
-- automaticamente, já que dependia dela)
alter table public.contracts drop column if exists driver_id;

-- ------------------------------------------------------------
-- 2. Cálculo de distância corrigido — rota de verdade por rota do
--    contrato, na ordem de embarque, em vez de ida-e-volta por
--    funcionária somada (bug antigo).
-- ------------------------------------------------------------
create or replace function public.estimate_contract_daily_distance(p_contract_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_dest_lat numeric;
  v_dest_lng numeric;
  v_total numeric := 0;
  v_any_route boolean := false;
  v_route record;
  v_prev_lat numeric;
  v_prev_lng numeric;
  v_route_total numeric;
  v_stop_count int;
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

  for v_route in
    select id from public.routes where contract_id = p_contract_id and active = true
  loop
    v_prev_lat := null;
    v_prev_lng := null;
    v_route_total := 0;
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
        v_route_total := v_route_total
          + public.haversine_km(v_prev_lat, v_prev_lng, r.address_lat, r.address_lng);
      end if;
      v_prev_lat := r.address_lat;
      v_prev_lng := r.address_lng;
      v_stop_count := v_stop_count + 1;
    end loop;

    if v_stop_count > 0 then
      v_route_total := v_route_total
        + public.haversine_km(v_prev_lat, v_prev_lng, v_dest_lat, v_dest_lng);
      v_total := v_total + v_route_total * 2;
      v_any_route := true;
    end if;
  end loop;

  if not v_any_route then
    return 0;
  end if;

  return v_total * 1.4;
end;
$$;

-- gatilhos novos: a conta agora depende de rota e ordem de embarque
create or replace function public.trg_recalc_on_route_employee_change()
returns trigger
language plpgsql
as $$
declare
  v_contract_id uuid;
begin
  select contract_id into v_contract_id
  from public.routes
  where id = coalesce(new.route_id, old.route_id);

  if v_contract_id is not null then
    perform public.recalculate_contract_pricing(v_contract_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists route_employees_recalc_pricing on public.route_employees;
create trigger route_employees_recalc_pricing
after insert or update of pickup_order or delete on public.route_employees
for each row execute function public.trg_recalc_on_route_employee_change();

create or replace function public.trg_recalc_on_route_change()
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

drop trigger if exists routes_recalc_pricing_ins_del on public.routes;
create trigger routes_recalc_pricing_ins_del
after insert or delete on public.routes
for each row execute function public.trg_recalc_on_route_change();

drop trigger if exists routes_recalc_pricing_upd on public.routes;
create trigger routes_recalc_pricing_upd
after update of active, contract_id on public.routes
for each row execute function public.trg_recalc_on_route_change();

-- ------------------------------------------------------------
-- 3. Recalcula todos os contratos agora com a fórmula corrigida
--    (limpa os números inflados que o bug antigo gerou)
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
