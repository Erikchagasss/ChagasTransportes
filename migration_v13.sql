-- Valor por trecho da funcionária para o controle mensal de corridas.
-- O relatório soma ida + volta com base neste valor, sem estimar tarifas.
begin;

alter table public.employees
  add column if not exists transport_leg_value numeric(12,2);

alter table public.employees
  drop constraint if exists employees_transport_leg_value_nonnegative;

alter table public.employees
  add constraint employees_transport_leg_value_nonnegative
  check (transport_leg_value is null or transport_leg_value >= 0);

comment on column public.employees.transport_leg_value is
  'Valor combinado por trecho (ida ou volta) da funcionária, usado no controle mensal exportado.';

commit;
