-- Executar no SQL Editor como administrador do banco. Não persiste alterações.
begin;
do $$ declare actor uuid; begin
  select id into actor from public.profiles where role='driver' order by id limit 1;
  if actor is null then raise exception 'Cadastre um motorista para executar o teste'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
set local role authenticated;
do $$ declare before_trips int; before_stops int; modified int; begin
  perform public.ensure_daily_trips(auth.uid());
  select count(*) into before_trips from public.trips;
  select count(*) into before_stops from public.trip_stops;
  perform public.ensure_daily_trips(auth.uid());
  if before_trips<>(select count(*) from public.trips) or before_stops<>(select count(*) from public.trip_stops) then
    raise exception 'Falha: geração duplicou viagens/paradas';
  end if;
  if exists(select 1 from public.trips where driver_id<>auth.uid()) then
    raise exception 'Falha: motorista consegue ler viagens alheias';
  end if;
  if exists(select 1 from public.employees e
    where not exists(select 1 from public.route_employees re join public.routes r on r.id=re.route_id where re.employee_id=e.id and r.driver_id=auth.uid())
      and not exists(select 1 from public.trip_stops s join public.trips t on t.id=s.trip_id where s.employee_id=e.id and t.driver_id=auth.uid())) then
    raise exception 'Falha: diretório global visível';
  end if;
  update public.employees set phone=phone;
  get diagnostics modified=row_count;
  if modified<>0 then raise exception 'Falha: motorista consegue editar cadastros'; end if;
  begin
    perform public.ensure_daily_trips('00000000-0000-0000-0000-000000000001');
    raise exception using errcode='ZX001',message='Falha: geração para terceiros permitida';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: geração idempotente e acesso restrito ao próprio motorista; teste revertido' as validation;
