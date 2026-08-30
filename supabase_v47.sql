create or replace function public.mating_group_pairing_history_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.group_id is not null and new.group_id is null and (
    exists (select 1 from public.mating_events e where e.pairing_id = old.id)
    or exists (select 1 from public.clutches c where c.pairing = old.id)
  ) then
    raise exception 'CARE_MATING_GROUP_MEMBER_HAS_HISTORY';
  end if;
  return new;
end;
$$;
revoke all on function public.mating_group_pairing_history_guard() from public, anon, authenticated;
drop trigger if exists mating_group_pairing_history_guard on public.pairings;
create trigger mating_group_pairing_history_guard
  before update of group_id on public.pairings
  for each row execute function public.mating_group_pairing_history_guard();
