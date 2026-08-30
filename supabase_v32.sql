/* =============================================================================
   v32 — Keep clutches isolated by species, including clutches without a pairing.
   Existing linked rows inherit their pairing species; old orphan rows remain Gecko.
   ============================================================================= */

do $guard$
begin
  if to_regclass('public.clutches') is null
     or to_regclass('public.pairings') is null then
    raise exception 'v32 requires public.clutches and public.pairings';
  end if;
end
$guard$;

alter table public.clutches
  add column if not exists species text;

update public.clutches as clutch
   set species = linked_pair.species
  from public.pairings as linked_pair
 where clutch.pairing = linked_pair.id
   and clutch.species is null;

update public.clutches
   set species = 'gecko'
 where species is null;

alter table public.clutches
  alter column species set default 'gecko',
  alter column species set not null;

alter table public.clutches
  drop constraint if exists clutches_species_ck;
alter table public.clutches
  add constraint clutches_species_ck
  check (species in ('gecko','crested','fattail','ballpython'));

create or replace function public.clutches_pairing_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_pair record;
begin
  if new.pairing is null then
    return new;
  end if;

  select pairing.user_id, pairing.species
    into linked_pair
    from public.pairings as pairing
   where pairing.id = new.pairing;

  if not found then
    raise exception 'pairing not found';
  end if;
  if linked_pair.user_id is distinct from new.user_id then
    raise exception 'clutch and pairing owners must match';
  end if;
  if linked_pair.species is distinct from new.species then
    raise exception 'clutch and pairing species must match';
  end if;
  if (select auth.uid()) is null
     or linked_pair.user_id is distinct from (select auth.uid()) then
    raise exception 'pairing does not belong to the authenticated user';
  end if;

  return new;
end;
$$;

revoke all on function public.clutches_pairing_guard()
  from public, anon, authenticated;

drop trigger if exists clutches_pairing_guard on public.clutches;
create trigger clutches_pairing_guard
  before insert or update of pairing, user_id, species
  on public.clutches
  for each row execute function public.clutches_pairing_guard();
