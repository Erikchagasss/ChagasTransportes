-- Área do motorista: somente suas rotas e viagens do dia.
begin;
drop policy if exists employees_driver_insert on public.employees;
drop policy if exists employees_driver_update on public.employees;
drop policy if exists route_employees_driver_manage on public.route_employees;
drop policy if exists trips_driver_insert_own on public.trips;
drop policy if exists employees_driver_select_own_contract on public.employees;
drop policy if exists employees_driver_select_assigned on public.employees;
create policy employees_driver_select_assigned on public.employees for select using (
  exists(select 1 from public.route_employees re join public.routes r on r.id=re.route_id
    where re.employee_id=employees.id and r.driver_id=auth.uid())
  or exists(select 1 from public.trip_stops s join public.trips t on t.id=s.trip_id
    where s.employee_id=employees.id and t.driver_id=auth.uid())
);

create or replace function public.ensure_daily_trips(p_driver_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day int := extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::int;
  v_scope uuid := p_driver_id;
  v_admin boolean := coalesce(public.is_admin(),false) or coalesce(auth.role()='service_role',false);
  r record;
  v_ids uuid[];
  v_trip_id uuid;
  v_status public.trip_status;
  v_period public.trip_period;
  v_created text[];
  v_existing text[];
  v_results jsonb := '[]'::jsonb;
begin
  if not v_admin then
    if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='driver') then
      raise exception 'Acesso negado' using errcode='42501';
    end if;
    if p_driver_id is not null and p_driver_id<>auth.uid() then
      raise exception 'Motorista só pode preparar suas próprias corridas' using errcode='42501';
    end if;
    v_scope := auth.uid();
  end if;
  for r in select rt.* from public.routes rt join public.contracts c on c.id=rt.contract_id
    where rt.active and c.status='active' and v_day=any(rt.weekdays)
      and (v_scope is null or rt.driver_id=v_scope)
    order by rt.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.id::text||v_today::text,0));
    v_created := '{}'; v_existing := '{}';
    select array_agg(e.id order by re.pickup_order,e.id) into v_ids
    from public.route_employees re join public.employees e on e.id=re.employee_id
    where re.route_id=r.id and e.contract_id=r.contract_id and e.active and (
      (e.shift_type='fixed' and v_day=any(case when coalesce(cardinality(e.work_weekdays),0)=0 then array[1,2,3,4,5] else e.work_weekdays end))
      or (e.shift_type='12x36' and (e.shift_anchor_date is null or (v_today-e.shift_anchor_date)%2=0))
    );
    if coalesce(cardinality(v_ids),0)=0 then
      update public.trips t set status='cancelled' where t.route_id=r.id and t.trip_date=v_today and t.status='planned'
        and not exists(select 1 from public.trip_stops s where s.trip_id=t.id);
      v_results := v_results || jsonb_build_array(jsonb_build_object('route_id',r.id,'route_name',r.name,'trips_created','[]'::jsonb,'trips_already_existed','[]'::jsonb,'scheduled_employees_today',0,'reason_if_skipped','Rota sem passageiras vinculadas ou sem passageiras escaladas para hoje'));
      continue;
    end if;
    foreach v_period in array array['ida'::public.trip_period,'volta'::public.trip_period] loop
      v_trip_id := null;
      insert into public.trips(route_id,driver_id,contract_id,trip_date,period,status)
      values(r.id,r.driver_id,r.contract_id,v_today,v_period,'planned')
      on conflict(route_id,trip_date,period) do nothing returning id into v_trip_id;
      if v_trip_id is null then
        select id,status into v_trip_id,v_status from public.trips where route_id=r.id and trip_date=v_today and period=v_period for update;
        v_existing := array_append(v_existing,v_period::text);
      else
        v_status := 'planned';
        v_created := array_append(v_created,v_period::text);
      end if;
      if v_status='planned' then
        -- Repara corridas criadas sem paradas, sem reescrever nenhum ticket existente.
        insert into public.trip_stops(trip_id,employee_id,pickup_order,status)
        select v_trip_id,re.employee_id,re.pickup_order,'pending' from public.route_employees re
        where re.route_id=r.id and re.employee_id=any(v_ids)
        on conflict(trip_id,employee_id) do nothing;
      end if;
    end loop;
    v_results := v_results || jsonb_build_array(jsonb_build_object('route_id',r.id,'route_name',r.name,'trips_created',to_jsonb(v_created),'trips_already_existed',to_jsonb(v_existing),'scheduled_employees_today',cardinality(v_ids)));
  end loop;
  return jsonb_build_object('date',v_today,'routes_evaluated',jsonb_array_length(v_results),'routes',v_results);
end $$;
revoke all on function public.ensure_daily_trips(uuid) from public,anon;
grant execute on function public.ensure_daily_trips(uuid) to authenticated,service_role;
commit;
