-- ============================================================
-- MIGRATION_V4
-- Adiciona período (ida/volta) nas corridas — cada rota agora gera
-- DUAS corridas por dia (leva de manhã, busca à tarde/noite), não
-- mais uma só.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_period') then
    create type trip_period as enum ('ida', 'volta');
  end if;
end $$;

alter table public.trips add column if not exists period trip_period not null default 'ida';

-- troca a constraint unique antiga (route_id, trip_date) pela nova
-- (route_id, trip_date, period) — a antiga impediria ter ida e volta
-- no mesmo dia pra mesma rota.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'trips_route_id_trip_date_key'
  ) then
    alter table public.trips drop constraint trips_route_id_trip_date_key;
  end if;
end $$;

alter table public.trips
  add constraint trips_route_id_trip_date_period_key unique (route_id, trip_date, period);

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
