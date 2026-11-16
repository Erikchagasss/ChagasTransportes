-- Pontos anteriores exigem confirmação; mantém coordenadas antigas para revisão.
begin;
alter table public.employees add column if not exists address_needs_review boolean not null default true;
create or replace function public.review_employee_location_on_address_change() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.address is distinct from new.address then
    new.address_needs_review := true;
    new.address_lat := null;
    new.address_lng := null;
  end if;
  return new;
end $$;
drop trigger if exists employee_location_address_change on public.employees;
create trigger employee_location_address_change before update on public.employees
for each row execute function public.review_employee_location_on_address_change();
-- Não apresenta custo/distância parcial como orçamento completo.
create or replace function public.guard_pricing_unverified_locations() returns trigger
language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.employees e where e.contract_id=new.id and e.active and e.address_needs_review) then
    new.current_estimated_distance_km := null;
    new.suggested_monthly_value := null;
    new.value_variance_pct := null;
    new.needs_price_review := true;
  end if;
  return new;
end $$;
drop trigger if exists pricing_unverified_locations on public.contracts;
create trigger pricing_unverified_locations before update on public.contracts
for each row execute function public.guard_pricing_unverified_locations();
update public.contracts c set current_estimated_distance_km=null,suggested_monthly_value=null,value_variance_pct=null,needs_price_review=true
where exists(select 1 from public.employees e where e.contract_id=c.id and e.active and e.address_needs_review);
commit;
