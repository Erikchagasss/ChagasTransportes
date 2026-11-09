-- ============================================================
-- FRETADO APP - SCHEMA COMPLETO (Supabase / Postgres)
-- Isolamento: motorista só vê o que está vinculado a ele.
-- Admin (você) vê tudo.
-- ============================================================

-- ------------------------------------------------------------
-- 0. EXTENSÕES
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILES (extende auth.users do Supabase)
-- ------------------------------------------------------------
create type user_role as enum ('admin', 'driver');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'driver',
  full_name text not null,
  phone text,
  cpf text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- helper: verifica se o usuário logado é admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_admin_only"
  on public.profiles for update
  using (public.is_admin());

-- ------------------------------------------------------------
-- 2. VEHICLES (frota - vinculada a um motorista, gerida pelo admin)
-- ------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles(id) on delete set null,
  plate text not null,
  model text,
  km_per_liter numeric(6,2) not null default 10,
  fuel_price numeric(8,2) not null default 6.00,
  monthly_depreciation numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

create policy "vehicles_admin_all"
  on public.vehicles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "vehicles_driver_select_own"
  on public.vehicles for select
  using (driver_id = auth.uid());

-- ------------------------------------------------------------
-- 3. CONTRACTS (contrato com a empresa contratante)
-- ------------------------------------------------------------
create type contract_status as enum ('active', 'paused', 'ended');

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_cnpj text,
  company_representative text,
  company_address text not null,
  company_logo_url text,
  company_lat numeric(10,7),
  company_lng numeric(10,7),
  -- Empresa de DESTINO das funcionárias, quando é diferente do
  -- contratante — caso clássico de terceirização: a contratante (quem
  -- paga, ex: "Casa Tempero") não é necessariamente o local onde as
  -- funcionárias trabalham (ex: "Xhara"). Se ficar em branco, o app usa
  -- o endereço do contratante como destino (caso mais simples, onde a
  -- contratante é o próprio local de trabalho).
  work_site_name text,
  work_site_address text,
  work_site_lat numeric(10,7),
  work_site_lng numeric(10,7),
  monthly_value numeric(10,2) not null,
  status contract_status not null default 'active',
  -- Nota: motoristas ficam em CONTRACT_DRIVERS (seção 4-B) e veículos
  -- ficam em ROUTES.vehicle_id — nem um nem outro é coluna aqui, porque
  -- um contrato normalmente precisa de mais de uma van/motorista pra
  -- dar conta da operação toda, e cada rota é quem sabe qual usa qual.
  -- parâmetros usados pela calculadora, guardados para referência/histórico
  driver_pct numeric(5,2),          -- % do valor destinado ao motorista
  tax_pct numeric(5,2),             -- % de imposto
  margin_pct numeric(5,2) not null default 0.15,   -- % de margem de lucro
  other_fixed_costs numeric(10,2) not null default 0, -- seguro, manutenção etc
  work_days_per_month int not null default 22,
  -- campos calculados automaticamente pelo gatilho de repricing (seção 11)
  current_estimated_distance_km numeric(8,2),
  suggested_monthly_value numeric(10,2),
  value_variance_pct numeric(6,4),
  needs_price_review boolean not null default false,
  notes text,
  started_at date,
  ended_at date,
  created_at timestamptz not null default now()
);

alter table public.contracts enable row level security;

create policy "contracts_admin_all"
  on public.contracts for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "contracts_driver_select_own"
  on public.contracts for select
  using (
    exists (
      select 1 from public.routes r
      where r.contract_id = contracts.id and r.driver_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3-B. CONTRACT_DRIVERS (motoristas vinculados ao contrato — N:N,
--      um contrato normalmente precisa de mais de um motorista)
-- ------------------------------------------------------------
create table public.contract_drivers (
  contract_id uuid not null references public.contracts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  primary key (contract_id, driver_id)
);

alter table public.contract_drivers enable row level security;

create policy "contract_drivers_admin_all"
  on public.contract_drivers for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "contract_drivers_driver_select_own"
  on public.contract_drivers for select
  using (driver_id = auth.uid());

-- ------------------------------------------------------------
-- 4. EMPLOYEES (funcionárias transportadas, vinculadas a um contrato)
-- ------------------------------------------------------------
create type shift_type as enum ('fixed', '12x36');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  full_name text not null,
  phone text,
  address text not null,
  address_lat numeric(10,7),
  address_lng numeric(10,7),
  active boolean not null default true,
  -- Escala de trabalho — define em quais dias a funcionária deve entrar
  -- na corrida gerada automaticamente (ver app/api/trips/generate-today/route.ts).
  shift_type shift_type not null default 'fixed',
  -- usado quando shift_type = 'fixed': dias da semana que ela trabalha
  -- (0=domingo...6=sábado). Padrão seg-sex.
  work_weekdays int[] not null default '{1,2,3,4,5}',
  -- usado quando shift_type = '12x36': uma data de referência em que ela
  -- trabalhou — a partir daí, alterna trabalha/folga a cada dia.
  shift_anchor_date date,
  shift_start_time time,
  shift_end_time time,
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "employees_admin_all"
  on public.employees for all
  using (public.is_admin())
  with check (public.is_admin());

-- motorista só vê funcionárias do(s) contrato(s) dele
create policy "employees_driver_select_own_contract"
  on public.employees for select
  using (
    exists (
      select 1 from public.routes r
      where r.contract_id = employees.contract_id
      and r.driver_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 5. ROUTES (rota de um motorista dentro de um contrato)
-- ------------------------------------------------------------
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  name text not null,
  weekdays int[] not null default '{1,2,3,4,5}', -- 0=domingo...6=sábado
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.routes enable row level security;

create policy "routes_admin_all"
  on public.routes for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "routes_driver_select_own"
  on public.routes for select
  using (driver_id = auth.uid());

-- ------------------------------------------------------------
-- 6. ROUTE_EMPLOYEES (quais funcionárias pertencem a qual rota, e ordem de embarque)
-- ------------------------------------------------------------
create table public.route_employees (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  pickup_order int not null default 0,
  unique (route_id, employee_id)
);

alter table public.route_employees enable row level security;

create policy "route_employees_admin_all"
  on public.route_employees for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "route_employees_driver_select_own"
  on public.route_employees for select
  using (
    exists (
      select 1 from public.routes r
      where r.id = route_employees.route_id
      and r.driver_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 7. TRIPS (corrida de um dia específico, gerada a partir de uma rota)
-- ------------------------------------------------------------
create type trip_status as enum ('planned', 'in_progress', 'completed', 'cancelled');
create type trip_period as enum ('ida', 'volta');

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  trip_date date not null default current_date,
  -- ida = leva as funcionárias de casa pro trabalho; volta = busca no
  -- trabalho e leva pra casa. Cada rota gera as duas todo dia.
  period trip_period not null default 'ida',
  status trip_status not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  distance_km numeric(8,2),      -- calculado via API de rotas ao concluir
  fuel_cost numeric(10,2),       -- calculado: distance_km / km_per_liter * fuel_price
  created_at timestamptz not null default now(),
  unique (route_id, trip_date, period)   -- evita gerar a mesma corrida duas vezes
);

alter table public.trips enable row level security;

create policy "trips_admin_all"
  on public.trips for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "trips_driver_select_own"
  on public.trips for select
  using (driver_id = auth.uid());

-- motorista pode ATUALIZAR apenas suas próprias corridas (embarque/conclusão)
create policy "trips_driver_update_own"
  on public.trips for update
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

create policy "trips_driver_insert_own"
  on public.trips for insert
  with check (driver_id = auth.uid());

-- ------------------------------------------------------------
-- 8. TRIP_STOPS (status de embarque de cada funcionária dentro de uma corrida)
-- ------------------------------------------------------------
create type stop_status as enum ('pending', 'boarded', 'absent');

create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  status stop_status not null default 'pending',
  boarded_at timestamptz,
  pickup_order int not null default 0,
  unique (trip_id, employee_id)
);

alter table public.trip_stops enable row level security;

create policy "trip_stops_admin_all"
  on public.trip_stops for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "trip_stops_driver_select_own_trip"
  on public.trip_stops for select
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_stops.trip_id
      and t.driver_id = auth.uid()
    )
  );

create policy "trip_stops_driver_update_own_trip"
  on public.trip_stops for update
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_stops.trip_id
      and t.driver_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 9. LEGAL_TEMPLATES (modelo de contrato jurídico, admin edita)
-- ------------------------------------------------------------
create table public.legal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content text not null, -- texto do contrato com placeholders {{campo}}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.legal_templates enable row level security;

create policy "legal_templates_admin_all"
  on public.legal_templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 10. ÍNDICES (performance nas consultas mais comuns)
-- ------------------------------------------------------------
create index idx_contract_drivers_driver on public.contract_drivers(driver_id);
create index idx_employees_contract on public.employees(contract_id);
create index idx_routes_driver on public.routes(driver_id);
create index idx_routes_contract on public.routes(contract_id);
create index idx_trips_driver on public.trips(driver_id);
create index idx_trips_route_date on public.trips(route_id, trip_date);
create index idx_trip_stops_trip on public.trip_stops(trip_id);

-- ============================================================
-- 11. REPREÇO AUTOMÁTICO
-- Sempre que uma funcionária muda de endereço, é adicionada ou
-- removida (ativada/desativada) de um contrato, recalcula a
-- distância estimada e o valor sugerido do contrato, e sinaliza
-- `needs_price_review = true` se a diferença passar de 5%.
-- Também reage a mudanças de veículo, percentuais, geocode da
-- empresa E geocode da empresa de destino (work_site). Depende de
-- coordenadas preenchidas — sem isso, o cálculo fica em branco e
-- nada é sinalizado.
-- ============================================================

-- distância em linha reta entre dois pontos (sem extensão externa)
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

-- Estima o km rodado por dia montando a ROTA de verdade: pra cada rota
-- ativa do contrato, soma a distância sequencial funcionária→funcionária
-- na ordem de embarque configurada, terminando no destino — depois soma
-- entre as rotas (cada rota é um veículo/motorista fazendo um trajeto
-- separado). NÃO faz ida-e-volta funcionária-por-funcionária (bug
-- corrigido: isso multiplicava o resultado pelo número de funcionárias,
-- em vez de calcular uma rota só passando por todo mundo).
-- Usa o endereço de destino (work_site) quando preenchido; senão cai
-- pro endereço do próprio contratante.
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
    return null; -- nem contratante nem destino têm geocode ainda
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
      -- último trecho: da última funcionária até o destino
      v_route_total := v_route_total
        + public.haversine_km(v_prev_lat, v_prev_lng, v_dest_lat, v_dest_lng);
      v_total := v_total + v_route_total * 2; -- ida de manhã + volta à noite
      v_any_route := true;
    end if;
  end loop;

  if not v_any_route then
    return 0;
  end if;


  return v_total * 1.4;
end;
$$;

-- recalcula distância + valor sugerido + sinalização de revisão para 1 contrato
-- Soma o custo de combustível e depreciação considerando o veículo
-- PRÓPRIO de cada rota (não um veículo único pro contrato inteiro) —
-- um contrato pode ter várias vans diferentes, cada uma com seu
-- consumo e preço de combustível.
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
      continue; -- rota sem veículo vinculado: não entra no custo de combustível
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

  -- sem geocode ainda: limpa sinalização em vez de calcular errado
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

  -- percentuais somados >= 100%: não existe valor que feche a conta
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

-- dispara o recálculo quando employees muda (insert/delete/update relevante)
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

  -- funcionária foi movida de contrato: recalcula o contrato antigo também
  if tg_op = 'UPDATE' and new.contract_id is distinct from old.contract_id then
    perform public.recalculate_contract_pricing(old.contract_id);
  end if;

  return new;
end;
$$;

create trigger employees_recalc_pricing_ins_del
after insert or delete on public.employees
for each row execute function public.trg_recalc_on_employee_change();

create trigger employees_recalc_pricing_upd
after update of address, address_lat, address_lng, active, contract_id
on public.employees
for each row execute function public.trg_recalc_on_employee_change();

-- dispara o recálculo quando a ordem de embarque ou a composição de uma
-- rota muda (adicionar/remover/reordenar funcionária na rota) — agora
-- que o cálculo usa a rota de verdade, isso afeta o resultado direto.
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

-- dispara o recálculo quando uma rota é criada, desativada/reativada,
-- ou apagada (muda quais motoristas/veículos cobrem o contrato)
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
after update of active, contract_id, vehicle_id on public.routes
for each row execute function public.trg_recalc_on_route_change();

-- dispara o recálculo quando o próprio contrato muda (%, geocode do
-- contratante OU geocode do destino) — veículo não entra mais aqui,
-- fica em ROUTES.vehicle_id (trigger acima já cobre isso).
-- não entra em loop: essas colunas nunca são tocadas por
-- recalculate_contract_pricing, que só escreve nas 4 colunas calculadas.
create or replace function public.trg_recalc_on_contract_change()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_contract_pricing(new.id);
  return new;
end;
$$;

create trigger contracts_recalc_pricing
after update of monthly_value, driver_pct, tax_pct, margin_pct, other_fixed_costs,
  work_days_per_month, company_lat, company_lng, work_site_lat, work_site_lng
on public.contracts
for each row execute function public.trg_recalc_on_contract_change();

-- ============================================================
-- 12. PUSH_SUBSCRIPTIONS (notificações — apenas admin se inscreve)
-- ------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Só admin gerencia a própria inscrição — garante, a nível de dado, que
-- só admin acumula subscriptions (quem envia notificação lê todas via
-- service role, sem precisar filtrar por role de novo).
create policy "push_subscriptions_admin_manage_own"
  on public.push_subscriptions for all
  using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());

-- ------------------------------------------------------------
-- 13. STORAGE — logos de contrato (bucket público, upload só admin)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('contract-logos', 'contract-logos', true)
on conflict (id) do nothing;

-- upload/edição só por admin; leitura é pública (URL direta), então não
-- precisa de policy de select — buckets públicos servem via endpoint
-- separado que ignora RLS.
create policy "contract_logos_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'contract-logos' and public.is_admin());

create policy "contract_logos_admin_update"
  on storage.objects for update
  using (bucket_id = 'contract-logos' and public.is_admin());

create policy "contract_logos_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'contract-logos' and public.is_admin());

-- ============================================================
-- FIM DO SCHEMA
-- Próximo passo: view materializada ou RPC para relatórios
-- consolidados (financeiro por contrato/mês) — a construir
-- junto com o módulo Financeiro.
-- ============================================================
