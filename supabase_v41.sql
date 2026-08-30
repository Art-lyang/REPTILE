begin;

create or replace function public.save_animal_with_initial_weight(
  p_device text,
  p_row jsonb,
  p_grams numeric default null,
  p_measured_on date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  newid uuid;
  measured date := coalesce(p_measured_on, current_date);
begin
  if auth.uid() is null then
    raise exception 'CARE_LOGIN_REQUIRED' using errcode = '42501';
  end if;
  if measured > current_date then
    raise exception 'CARE_WEIGHT_DATE_FUTURE' using errcode = '22007';
  end if;

  newid := public.save_row(p_device, 'animals', p_row);
  if p_grams is not null then
    insert into public.weight_logs (animal_id, grams, measured_on)
    values (newid, p_grams, measured);
  end if;
  return newid;
end;
$$;

revoke all on function public.save_animal_with_initial_weight(text, jsonb, numeric, date)
  from public, anon;
grant execute on function public.save_animal_with_initial_weight(text, jsonb, numeric, date)
  to authenticated;

commit;
