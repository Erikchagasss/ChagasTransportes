-- Chegadas separadas de embarque e desembarque. Aplicar após a v8.
begin;
alter table public.trip_stops add column if not exists arrived_at timestamptz;
alter table public.trip_stops add column if not exists dropoff_arrived_at timestamptz;
create or replace function public.validate_transport_arrival() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.arrived_at is not null and new.boarded_at is not null and new.boarded_at < new.arrived_at then
    raise exception 'Embarque deve ocorrer depois da chegada ao local de busca';
  end if;
  if new.dropoff_arrived_at is not null and
    (new.status <> 'boarded' or new.boarded_at is null or new.dropoff_arrived_at < new.boarded_at) then
    raise exception 'Chegada à entrega exige embarque anterior';
  end if;
  if new.dropoff_arrived_at is not null and new.dropped_off_at is not null and new.dropped_off_at < new.dropoff_arrived_at then
    raise exception 'Desembarque deve ocorrer depois da chegada ao destino';
  end if;
  return new;
end $$;
drop trigger if exists transport_arrival_validation on public.trip_stops;
create trigger transport_arrival_validation before insert or update on public.trip_stops
for each row execute function public.validate_transport_arrival();
commit;
