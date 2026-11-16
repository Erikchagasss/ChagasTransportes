-- Executar no SQL Editor após a v12. Não persiste alterações.
begin;
do $$ begin
  perform set_config('request.jwt.claim.role','service_role',true);
end $$;
do $$ declare before_trips int;before_stops int;today date:=(now() at time zone 'America/Sao_Paulo')::date;begin
  if not public.transport_works_on_date('fixed',array[1,2,3,4,5],null,'2026-11-16') then raise exception 'Segunda-feira útil rejeitada'; end if;
  if public.transport_works_on_date('fixed',array[1,2,3,4,5],null,'2026-11-15') then raise exception 'Domingo de folga aceito'; end if;
  if public.transport_works_on_date('12x36',array[1,2,3,4,5],'2026-11-15','2026-11-16') then raise exception 'Folga 12x36 incorreta'; end if;
  if not public.transport_works_on_date('12x36',array[1,2,3,4,5],'2026-11-15','2026-11-15') then raise exception 'Dia 12x36 incorreto'; end if;
  perform public.ensure_daily_trips();
  if exists(select 1 from public.trips t join public.trip_stops s on s.trip_id=t.id
    where t.trip_date=today and t.status='planned' and t.scheduled_slot not like 'legacy:%' and t.scheduled_slot not like 'replaced:%'
      and (case when t.period='ida' then s.scheduled_start else s.scheduled_end end) is distinct from t.scheduled_time) then
    raise exception 'Horários diferentes misturados na mesma viagem';
  end if;
  if exists(select 1 from public.trips t join public.trip_stops s on s.trip_id=t.id join public.employees e on e.id=s.employee_id join public.routes r on r.id=t.route_id
    where t.trip_date=today and t.status='planned' and t.period='volta' and t.scheduled_slot not like 'legacy:%'
      and e.shift_end_time<=e.shift_start_time and
      (not public.transport_works_on_date(e.shift_type,e.work_weekdays,e.shift_anchor_date,today-1) or not(extract(dow from today-1)::int=any(r.weekdays)))) then
    raise exception 'Retorno noturno não respeita a escala do dia anterior';
  end if;
  select count(*) into before_trips from public.trips;
  select count(*) into before_stops from public.trip_stops;
  perform public.ensure_daily_trips();
  if before_trips<>(select count(*) from public.trips) or before_stops<>(select count(*) from public.trip_stops) then raise exception 'Geração duplicou viagens/paradas'; end if;
end $$;
rollback;
select 'PASS: horários separados, escala e retorno noturno corretos, geração sem duplicação; teste revertido' as validation;
