-- Tickets de transporte. Aplicar depois de migration_v6.sql.
begin;
alter table public.trip_stops add column if not exists dropped_off_at timestamptz;
alter table public.trip_stops add column if not exists notes text not null default '';
alter table public.trip_stops add column if not exists pickup_address text;
alter table public.trip_stops add column if not exists dropoff_address text;
alter table public.trip_stops add column if not exists employee_name text;
alter table public.trip_stops add column if not exists employee_phone text;
alter table public.trip_stops add column if not exists scheduled_start time;
alter table public.trip_stops add column if not exists scheduled_end time;

create or replace function public.prepare_transport_ticket() returns trigger
language plpgsql set search_path = public as $$
declare t public.trips; e public.employees; c public.contracts;
begin
  select * into t from public.trips where id = new.trip_id;
  if tg_op = 'UPDATE' then
    if new.trip_id <> old.trip_id or new.employee_id <> old.employee_id then
      raise exception 'Não é permitido transferir um ticket';
    end if;
    if not public.is_admin() and t.status <> 'in_progress' then
      raise exception 'Inicie a corrida antes de registrar o transporte';
    end if;
    new.employee_name := old.employee_name;
    new.employee_phone := old.employee_phone;
    new.scheduled_start := old.scheduled_start;
    new.scheduled_end := old.scheduled_end;
  else
    select * into e from public.employees where id = new.employee_id;
    if e.contract_id <> t.contract_id then raise exception 'Funcionária de outro contrato'; end if;
    select * into c from public.contracts where id = t.contract_id;
    new.employee_name := e.full_name;
    new.employee_phone := e.phone;
    new.scheduled_start := e.shift_start_time;
    new.scheduled_end := e.shift_end_time;
    new.pickup_address := case when t.period = 'ida' then e.address else coalesce(c.work_site_address, c.company_address) end;
    new.dropoff_address := case when t.period = 'ida' then coalesce(c.work_site_address, c.company_address) else e.address end;
  end if;
  if new.dropped_off_at is not null and (new.boarded_at is null or new.dropped_off_at < new.boarded_at) then
    raise exception 'Desembarque deve ocorrer depois do embarque';
  end if;
  if new.status <> 'boarded' and (new.boarded_at is not null or new.dropped_off_at is not null) then
    raise exception 'Horários exigem confirmação de embarque';
  end if;
  return new;
end $$;

-- Registros antigos recebem os dados disponíveis hoje, sem inventar horários.
update public.trip_stops s set employee_name=e.full_name, employee_phone=e.phone,
 scheduled_start=e.shift_start_time, scheduled_end=e.shift_end_time,
 pickup_address=case when t.period='ida' then e.address else coalesce(c.work_site_address,c.company_address) end,
 dropoff_address=case when t.period='ida' then coalesce(c.work_site_address,c.company_address) else e.address end
from public.employees e, public.trips t, public.contracts c
where s.employee_id=e.id and s.trip_id=t.id and t.contract_id=c.id and s.employee_name is null;
drop trigger if exists transport_ticket_prepare on public.trip_stops;
create trigger transport_ticket_prepare before insert or update on public.trip_stops
for each row execute function public.prepare_transport_ticket();

drop policy if exists employees_driver_insert on public.employees;
create policy employees_driver_insert on public.employees for insert with check (
 exists(select 1 from public.routes r where r.contract_id=employees.contract_id and r.driver_id=auth.uid() and r.active));
drop policy if exists employees_driver_update on public.employees;
create policy employees_driver_update on public.employees for update using (
 exists(select 1 from public.routes r where r.contract_id=employees.contract_id and r.driver_id=auth.uid() and r.active)) with check (
 exists(select 1 from public.routes r where r.contract_id=employees.contract_id and r.driver_id=auth.uid() and r.active));

-- Conclusão validada também no banco, inclusive para chamadas diretas.
create or replace function public.check_transport_completion() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='completed' and old.status is distinct from new.status then
   if old.status <> 'in_progress' then raise exception 'Corrida não está em andamento'; end if;
   if exists(select 1 from public.trip_stops where trip_id=new.id and
      (status='pending' or (status='boarded' and dropped_off_at is null))) then
     raise exception 'Registre todas as ausências e desembarques antes de concluir';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists transport_completion on public.trips;
create trigger transport_completion before update on public.trips for each row execute function public.check_transport_completion();
drop policy if exists route_employees_driver_manage on public.route_employees;
create policy route_employees_driver_manage on public.route_employees for all using (
 exists(select 1 from public.routes r where r.id=route_employees.route_id and r.driver_id=auth.uid() and r.active)) with check (
 exists(select 1 from public.routes r join public.employees e on e.contract_id=r.contract_id
 where r.id=route_employees.route_id and e.id=route_employees.employee_id and e.active and r.driver_id=auth.uid() and r.active));
-- Ajusta corridas ainda não iniciadas quando a composição da rota muda.
-- Corridas em andamento/concluídas mantêm seus tickets.
create or replace function public.sync_planned_transport_tickets() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
   insert into public.trip_stops(trip_id,employee_id,pickup_order)
   select t.id,new.employee_id,new.pickup_order from public.trips t
   join public.employees e on e.id=new.employee_id and e.contract_id=t.contract_id
   where t.route_id=new.route_id and t.status='planned'
     and t.trip_date >= (now() at time zone 'America/Sao_Paulo')::date
     and e.active and (
       (e.shift_type='fixed' and extract(dow from t.trip_date)::int = any(e.work_weekdays))
       or (e.shift_type='12x36' and (e.shift_anchor_date is null or (t.trip_date-e.shift_anchor_date)%2=0))
     )
   on conflict(trip_id,employee_id) do nothing;
 elsif tg_op='DELETE' then
   delete from public.trip_stops s using public.trips t
   where s.trip_id=t.id and t.route_id=old.route_id and s.employee_id=old.employee_id
     and t.status='planned' and s.status='pending'
     and t.trip_date >= (now() at time zone 'America/Sao_Paulo')::date;
 end if;
 return null;
end $$;
drop trigger if exists route_transport_tickets on public.route_employees;
create trigger route_transport_tickets after insert or delete on public.route_employees
for each row execute function public.sync_planned_transport_tickets();
commit;
