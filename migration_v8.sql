-- Salários fixos por vigência. Execute depois da v7.
begin;
create table if not exists public.driver_salaries (
  driver_id uuid not null references public.profiles(id) on delete restrict,
  effective_month date not null check (extract(day from effective_month)=1),
  monthly_salary numeric(12,2) not null check (monthly_salary >= 0),
  updated_at timestamptz not null default now(),
  primary key (driver_id, effective_month)
);
alter table public.driver_salaries enable row level security;
revoke all on public.driver_salaries from anon;
grant select, insert, update on public.driver_salaries to authenticated;
drop policy if exists driver_salaries_admin on public.driver_salaries;
create policy driver_salaries_admin on public.driver_salaries for all
using (public.is_admin()) with check (public.is_admin());
create or replace function public.validate_driver_salary() returns trigger
language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=new.driver_id and role='driver') then
    raise exception 'Salário deve pertencer a um motorista';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists validate_driver_salary on public.driver_salaries;
create trigger validate_driver_salary before insert or update on public.driver_salaries
for each row execute function public.validate_driver_salary();
-- Registros antigos não comprovam como a distância foi obtida.
alter table public.trips add column if not exists distance_source text not null default 'legacy';
commit;
