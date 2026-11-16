-- Agenda por horário e retornos após a meia-noite. Aplicar depois da v11.
begin;
alter table public.trips add column if not exists scheduled_time time;
alter table public.trips add column if not exists scheduled_slot text not null default 'legacy';
update public.trips t set scheduled_time=q.scheduled_time from (
  select t.id,min(case when t.period='ida' then s.scheduled_start else s.scheduled_end end) as scheduled_time
  from public.trips t left join public.trip_stops s on s.trip_id=t.id group by t.id
) q where q.id=t.id and t.scheduled_slot='legacy';
update public.trips set scheduled_slot=case when status='planned' and trip_date>=(now() at time zone 'America/Sao_Paulo')::date then 'replaced:'||id::text else 'legacy:'||id::text end where scheduled_slot='legacy';
-- Preserva os tickets antigos; só substitui viagens que ainda não começaram.
update public.trips set status='cancelled' where status='planned' and scheduled_slot like 'replaced:%' and trip_date>=(now() at time zone 'America/Sao_Paulo')::date;
alter table public.trips drop constraint if exists trips_route_id_trip_date_period_key;
do $$ begin if not exists(select 1 from pg_catalog.pg_constraint where conname='trips_route_date_period_slot_key' and conrelid='public.trips'::regclass) then
 alter table public.trips add constraint trips_route_date_period_slot_key unique(route_id,trip_date,period,scheduled_slot);
end if; end $$;

create or replace function public.transport_works_on_date(p_shift public.shift_type,p_days int[],p_anchor date,p_date date)
returns boolean language sql immutable set search_path=public as $$
 select case when p_shift='12x36' then p_anchor is null or (p_date-p_anchor)%2=0
 else extract(dow from p_date)::int=any(case when coalesce(cardinality(p_days),0)=0 then array[1,2,3,4,5] else p_days end) end;
$$;

create or replace function public.ensure_daily_trips(p_driver_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_today date := (now() at time zone 'America/Sao_Paulo')::date;
 v_scope uuid := p_driver_id;
 v_admin boolean := coalesce(public.is_admin(),false) or coalesce(auth.role()='service_role',false);
 r record; slot record; v_trip_id uuid; v_status public.trip_status; v_key text;
 v_expected text[]; v_created text[]; v_existing text[]; v_seen uuid[]; v_total int;
 v_results jsonb := '[]'::jsonb;
begin
 if not v_admin then
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='driver') then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_driver_id is not null and p_driver_id<>auth.uid() then raise exception 'Motorista só pode preparar suas próprias corridas' using errcode='42501'; end if;
  v_scope:=auth.uid();
 end if;
 for r in select rt.* from public.routes rt join public.contracts c on c.id=rt.contract_id
  where rt.active and c.status='active' and (v_scope is null or rt.driver_id=v_scope) order by rt.id
 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.id::text||v_today::text,0));
  v_created:='{}'; v_existing:='{}'; v_expected:='{}'; v_seen:='{}'; v_total:=0;
  for slot in
   with assigned as (
    select e.*,re.pickup_order,
      case when e.shift_start_time is not null and e.shift_end_time is not null and e.shift_end_time<=e.shift_start_time then v_today-1 else v_today end as return_work_date
    from public.route_employees re join public.employees e on e.id=re.employee_id
    where re.route_id=r.id and e.contract_id=r.contract_id and e.active
   ), candidates as (
    select 'ida'::public.trip_period as period,e.shift_start_time as target_time,e.id,e.pickup_order from assigned e
    where extract(dow from v_today)::int=any(r.weekdays) and public.transport_works_on_date(e.shift_type,e.work_weekdays,e.shift_anchor_date,v_today)
    union all
    select 'volta'::public.trip_period,e.shift_end_time,e.id,e.pickup_order from assigned e
    where extract(dow from e.return_work_date)::int=any(r.weekdays) and public.transport_works_on_date(e.shift_type,e.work_weekdays,e.shift_anchor_date,e.return_work_date)
   )
   select period,target_time,array_agg(id order by pickup_order,id) as ids from candidates group by period,target_time order by target_time nulls last,period
  loop
   v_key:=coalesce(slot.target_time::text,'unscheduled');
   v_expected:=array_append(v_expected,slot.period::text||'/'||v_key);
   v_seen:=array(select distinct unnest(v_seen||slot.ids)); v_total:=cardinality(v_seen);
   -- Viagem antiga já iniciada/concluída/cancelada não é recriada ou dividida.
   if exists(select 1 from public.trips where route_id=r.id and trip_date=v_today and period=slot.period and scheduled_slot like 'legacy:%' and status in('in_progress','completed','cancelled')) then
    v_existing:=array_append(v_existing,slot.period::text||' (registro anterior)');continue;
   end if;
   v_trip_id:=null;
   insert into public.trips(route_id,driver_id,contract_id,trip_date,period,status,scheduled_time,scheduled_slot)
   values(r.id,r.driver_id,r.contract_id,v_today,slot.period,'planned',slot.target_time,v_key)
   on conflict(route_id,trip_date,period,scheduled_slot) do nothing returning id into v_trip_id;
   if v_trip_id is null then
    select id,status into v_trip_id,v_status from public.trips where route_id=r.id and trip_date=v_today and period=slot.period and scheduled_slot=v_key for update;
    if v_status='planned' and exists(select 1 from public.trip_stops where trip_id=v_trip_id and not(employee_id=any(slot.ids))) then
     update public.trips set status='cancelled',scheduled_slot='replaced:'||id::text where id=v_trip_id;
     insert into public.trips(route_id,driver_id,contract_id,trip_date,period,status,scheduled_time,scheduled_slot) values(r.id,r.driver_id,r.contract_id,v_today,slot.period,'planned',slot.target_time,v_key) returning id into v_trip_id;
     v_status:='planned';
    end if;
    v_existing:=array_append(v_existing,slot.period::text||' '||coalesce(left(slot.target_time::text,5),'sem horário'));
   else
    v_status:='planned';v_created:=array_append(v_created,slot.period::text||' '||coalesce(left(slot.target_time::text,5),'sem horário'));
   end if;
   if v_status='planned' then
    insert into public.trip_stops(trip_id,employee_id,pickup_order,status)
    select v_trip_id,re.employee_id,re.pickup_order,'pending' from public.route_employees re where re.route_id=r.id and re.employee_id=any(slot.ids)
    on conflict(trip_id,employee_id) do nothing;
   end if;
  end loop;
  update public.trips t set status='cancelled',scheduled_slot='replaced:'||t.id::text
  where t.route_id=r.id and t.trip_date=v_today and t.status='planned' and t.scheduled_slot not like 'legacy:%' and t.scheduled_slot not like 'replaced:%'
   and not((t.period::text||'/'||t.scheduled_slot)=any(v_expected))
   and not exists(select 1 from public.trip_stops s where s.trip_id=t.id and (s.status<>'pending' or s.arrived_at is not null or s.boarded_at is not null or s.dropped_off_at is not null or coalesce(s.notes,'')<>''));
  v_results:=v_results||jsonb_build_array(jsonb_build_object('route_id',r.id,'route_name',r.name,'trips_created',to_jsonb(v_created),'trips_already_existed',to_jsonb(v_existing),'scheduled_employees_today',v_total,'reason_if_skipped',case when v_total=0 then 'Sem passageiras escaladas para entrada ou saída hoje' else null end));
 end loop;
 return jsonb_build_object('date',v_today,'routes_evaluated',jsonb_array_length(v_results),'routes',v_results);
end $$;
revoke all on function public.ensure_daily_trips(uuid) from public,anon;
grant execute on function public.ensure_daily_trips(uuid) to authenticated,service_role;

-- Inclusões são montadas pela geração por horário. Remoções só afetam viagens não iniciadas.
create or replace function public.sync_planned_transport_tickets() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if tg_op='DELETE' then
  delete from public.trip_stops s using public.trips t where s.trip_id=t.id and t.route_id=old.route_id and s.employee_id=old.employee_id and t.status='planned' and s.status='pending' and t.trip_date>=(now() at time zone 'America/Sao_Paulo')::date and s.arrived_at is null and s.boarded_at is null and coalesce(s.notes,'')='';
 end if;return null;end $$;
commit;
