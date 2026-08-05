begin;

create or replace function public.care_parent_candidate_update_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (
    select 1 from public.animals child
     where child.parent_a = new.id
       and not (
         new.sex = 'male' and new.life_stage = 'adult'
         and (case when new.species = 'leopard' then 'gecko' else new.species end)
             = (case when child.species = 'leopard' then 'gecko' else child.species end)
         and new.user_id is not distinct from child.user_id
         and (child.user_id is not null or new.device = child.device)
       )
  ) then
    raise exception 'CARE_LINKED_SIRE_INVALID';
  end if;

  if exists (
    select 1 from public.animals child
     where child.parent_b = new.id
       and not (
         new.sex = 'female' and new.life_stage = 'adult'
         and (case when new.species = 'leopard' then 'gecko' else new.species end)
             = (case when child.species = 'leopard' then 'gecko' else child.species end)
         and new.user_id is not distinct from child.user_id
         and (child.user_id is not null or new.device = child.device)
       )
  ) then
    raise exception 'CARE_LINKED_DAM_INVALID';
  end if;

  if exists (
    select 1 from public.pairings pairing
     where pairing.male = new.id
       and not (
         new.sex = 'male' and new.life_stage = 'adult'
         and (case when new.species = 'leopard' then 'gecko' else new.species end) = pairing.species
         and new.user_id is not distinct from pairing.user_id
         and (pairing.user_id is not null or new.device = pairing.device)
       )
  ) then
    raise exception 'CARE_LINKED_PAIRING_MALE_INVALID';
  end if;

  if exists (
    select 1 from public.pairings pairing
     where pairing.female = new.id
       and not (
         new.sex = 'female' and new.life_stage = 'adult'
         and (case when new.species = 'leopard' then 'gecko' else new.species end) = pairing.species
         and new.user_id is not distinct from pairing.user_id
         and (pairing.user_id is not null or new.device = pairing.device)
       )
  ) then
    raise exception 'CARE_LINKED_PAIRING_FEMALE_INVALID';
  end if;

  return new;
end $$;

revoke all on function public.care_parent_candidate_update_guard()
  from public, anon, authenticated;

drop trigger if exists care_parent_candidate_update_guard on public.animals;
create trigger care_parent_candidate_update_guard
  before update of sex, life_stage, species, user_id, device on public.animals
  for each row execute function public.care_parent_candidate_update_guard();

notify pgrst, 'reload schema';
commit;
