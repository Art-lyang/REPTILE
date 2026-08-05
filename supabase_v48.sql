begin;

do $guard$
begin
  if to_regclass('public.animals') is null
     or to_regclass('public.pairings') is null
     or to_regclass('public.clutches') is null
     or to_regclass('public.breeding_projects') is null then
    raise exception 'v48 requires the v47 schema';
  end if;
end
$guard$;

alter table public.clutches
  add column if not exists fertile_count integer,
  add column if not exists infertile_count integer,
  add column if not exists stopped_count integer,
  add column if not exists hatched_count integer,
  add column if not exists actual_hatch_date date,
  add column if not exists outcome_closed boolean;

update public.clutches set
  fertile_count = coalesce(fertile_count, 0),
  infertile_count = coalesce(infertile_count, 0),
  stopped_count = coalesce(stopped_count, 0),
  hatched_count = coalesce(hatched_count, 0),
  outcome_closed = coalesce(outcome_closed, false);

alter table public.clutches
  alter column fertile_count set default 0,
  alter column fertile_count set not null,
  alter column infertile_count set default 0,
  alter column infertile_count set not null,
  alter column stopped_count set default 0,
  alter column stopped_count set not null,
  alter column hatched_count set default 0,
  alter column hatched_count set not null,
  alter column outcome_closed set default false,
  alter column outcome_closed set not null;

alter table public.clutches drop constraint if exists clutches_outcome_counts_ck;
alter table public.clutches add constraint clutches_outcome_counts_ck check (
  fertile_count >= 0 and infertile_count >= 0 and stopped_count >= 0 and hatched_count >= 0
  and fertile_count + infertile_count + stopped_count + hatched_count <= coalesce(egg_count, 0)
  and (hatched_count = 0 or actual_hatch_date is not null)
);

alter table public.animals
  add column if not exists clutch_id uuid,
  add column if not exists breeding_project_id uuid,
  add column if not exists breeding_project_step smallint;

alter table public.animals drop constraint if exists animals_clutch_id_fkey;
alter table public.animals add constraint animals_clutch_id_fkey
  foreign key (clutch_id) references public.clutches(id) on delete restrict;
alter table public.animals drop constraint if exists animals_breeding_project_id_fkey;
alter table public.animals add constraint animals_breeding_project_id_fkey
  foreign key (breeding_project_id) references public.breeding_projects(id) on delete set null;
alter table public.animals drop constraint if exists animals_breeding_project_step_ck;
alter table public.animals add constraint animals_breeding_project_step_ck
  check (breeding_project_step is null or breeding_project_step between 1 and 12);

create index if not exists animals_clutch_id_idx on public.animals(clutch_id)
  where clutch_id is not null;
create index if not exists animals_breeding_project_id_idx on public.animals(breeding_project_id)
  where breeding_project_id is not null;
create index if not exists clutches_outcome_owner_idx
  on public.clutches(user_id, outcome_closed, actual_hatch_date desc);

create or replace function public.clutches_owner_fill()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'CARE_CLUTCH_LOGIN_REQUIRED'; end if;
  if tg_op = 'INSERT' then
    new.user_id := current_user_id;
    new.device := 'u_' || current_user_id::text;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'CARE_CLUTCH_OWNER_INVALID';
  end if;
  return new;
end;
$$;
revoke all on function public.clutches_owner_fill() from public, anon, authenticated;
drop trigger if exists clutches_00_owner_fill on public.clutches;
create trigger clutches_00_owner_fill
  before insert or update on public.clutches
  for each row execute function public.clutches_owner_fill();

create or replace function public.clutches_outcome_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare registered_count integer;
begin
  if new.actual_hatch_date is not null and new.actual_hatch_date > current_date then
    raise exception 'CARE_CLUTCH_HATCH_DATE_INVALID';
  end if;
  if new.actual_hatch_date is not null and new.laid_date is not null
     and new.actual_hatch_date < new.laid_date then
    raise exception 'CARE_CLUTCH_HATCH_DATE_INVALID';
  end if;
  select count(*) into registered_count
    from public.animals a where a.clutch_id = new.id;
  if registered_count > coalesce(new.hatched_count, 0) then
    raise exception 'CARE_CLUTCH_OFFSPRING_LIMIT';
  end if;
  return new;
end;
$$;
revoke all on function public.clutches_outcome_guard() from public, anon, authenticated;
drop trigger if exists clutches_outcome_guard on public.clutches;
create trigger clutches_outcome_guard
  before insert or update of laid_date, egg_count, fertile_count, infertile_count,
    stopped_count, hatched_count, actual_hatch_date, outcome_closed
  on public.clutches
  for each row execute function public.clutches_outcome_guard();

create or replace function public.care_animal_clutch_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  linked_clutch record;
  linked_pair record;
  registered_count integer;
begin
  if new.clutch_id is null then return new; end if;
  select c.user_id, c.device, c.species, c.laid_date, c.actual_hatch_date, c.hatched_count,
         p.male, p.female, p.project_id, p.project_step, p.name
    into linked_clutch
    from public.clutches c
    join public.pairings p on p.id = c.pairing
   where c.id = new.clutch_id;
  if not found then raise exception 'CARE_CLUTCH_LINK_INVALID'; end if;
  if linked_clutch.user_id is distinct from new.user_id
     or (new.user_id is null and linked_clutch.device is distinct from new.device) then
    raise exception 'CARE_CLUTCH_OWNER_INVALID';
  end if;
  if (case when new.species = 'leopard' then 'gecko' else new.species end)
     is distinct from linked_clutch.species then
    raise exception 'CARE_CLUTCH_SPECIES_INVALID';
  end if;
  if new.parent_a is not null and new.parent_a is distinct from linked_clutch.male then
    raise exception 'CARE_CLUTCH_SIRE_INVALID';
  end if;
  if new.parent_b is not null and new.parent_b is distinct from linked_clutch.female then
    raise exception 'CARE_CLUTCH_DAM_INVALID';
  end if;
  select count(*) into registered_count
    from public.animals a
   where a.clutch_id = new.clutch_id and a.id is distinct from new.id;
  if registered_count >= linked_clutch.hatched_count then
    raise exception 'CARE_CLUTCH_OFFSPRING_LIMIT';
  end if;
  new.parent_a := linked_clutch.male;
  new.parent_b := linked_clutch.female;
  new.hatch_date := coalesce(new.hatch_date, linked_clutch.actual_hatch_date);
  if new.hatch_date is null or new.hatch_date < linked_clutch.laid_date
     or new.hatch_date > current_date then
    raise exception 'CARE_CLUTCH_HATCH_DATE_INVALID';
  end if;
  new.breeding_project_id := linked_clutch.project_id;
  new.breeding_project_step := case when linked_clutch.project_step is null then null
    else least(12, linked_clutch.project_step + 1) end;
  new.clutch_label := coalesce(new.clutch_label, linked_clutch.name);
  return new;
end;
$$;
revoke all on function public.care_animal_clutch_guard() from public, anon, authenticated;
drop trigger if exists care_animal_clutch_guard on public.animals;
create trigger care_animal_clutch_guard
  before insert or update of clutch_id, parent_a, parent_b, hatch_date, user_id, device, species
  on public.animals
  for each row execute function public.care_animal_clutch_guard();

create or replace function public.save_clutch_v48(p_row jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  clutch_id_value uuid := nullif(p_row->>'id', '')::uuid;
begin
  if current_user_id is null then raise exception 'CARE_CLUTCH_LOGIN_REQUIRED'; end if;
  if clutch_id_value is null then
    insert into public.clutches (
      user_id, device, pairing, laid_date, temp, expected_hatch, egg_count, note, species
    ) values (
      current_user_id, 'u_' || current_user_id::text, nullif(p_row->>'pairing', '')::uuid,
      nullif(p_row->>'laid_date', '')::date, nullif(p_row->>'temp', '')::numeric,
      nullif(p_row->>'expected_hatch', '')::date, nullif(p_row->>'egg_count', '')::integer,
      nullif(btrim(p_row->>'note'), ''), coalesce(nullif(p_row->>'species', ''), 'gecko')
    ) returning id into clutch_id_value;
  else
    update public.clutches set
      pairing = nullif(p_row->>'pairing', '')::uuid,
      laid_date = nullif(p_row->>'laid_date', '')::date,
      temp = nullif(p_row->>'temp', '')::numeric,
      expected_hatch = nullif(p_row->>'expected_hatch', '')::date,
      egg_count = nullif(p_row->>'egg_count', '')::integer,
      note = nullif(btrim(p_row->>'note'), ''),
      species = coalesce(nullif(p_row->>'species', ''), species)
    where id = clutch_id_value and user_id = current_user_id;
    if not found then raise exception 'CARE_CLUTCH_OWNER_INVALID'; end if;
  end if;
  return clutch_id_value;
end;
$$;
revoke all on function public.save_clutch_v48(jsonb) from public, anon;
grant execute on function public.save_clutch_v48(jsonb) to authenticated;

create or replace function public.save_clutch_outcome(p_clutch_id uuid, p_outcome jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'CARE_CLUTCH_LOGIN_REQUIRED'; end if;
  update public.clutches set
    fertile_count = coalesce(nullif(p_outcome->>'fertile_count', '')::integer, 0),
    infertile_count = coalesce(nullif(p_outcome->>'infertile_count', '')::integer, 0),
    stopped_count = coalesce(nullif(p_outcome->>'stopped_count', '')::integer, 0),
    hatched_count = coalesce(nullif(p_outcome->>'hatched_count', '')::integer, 0),
    actual_hatch_date = nullif(p_outcome->>'actual_hatch_date', '')::date,
    outcome_closed = coalesce((p_outcome->>'outcome_closed')::boolean, false)
  where id = p_clutch_id and user_id = current_user_id;
  if not found then raise exception 'CARE_CLUTCH_OWNER_INVALID'; end if;
  return p_clutch_id;
end;
$$;
revoke all on function public.save_clutch_outcome(uuid,jsonb) from public, anon;
grant execute on function public.save_clutch_outcome(uuid,jsonb) to authenticated;

create or replace function public.my_clutch_offspring(p_clutch_ids uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.hatch_date, a.created_at), '[]'::jsonb)
    from public.animals a
   where a.user_id = (select auth.uid()) and a.clutch_id = any(coalesce(p_clutch_ids, '{}'::uuid[]));
$$;
revoke all on function public.my_clutch_offspring(uuid[]) from public, anon;
grant execute on function public.my_clutch_offspring(uuid[]) to authenticated;

create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  dev text;
  profile_row public.profiles;
  n_photo integer := 0;
  n_legacy_photo integer := 0;
  n_feed integer := 0;
  n_project integer := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;
  select * into profile_row from public.profiles where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'), profile_row.agree_terms,
       profile_row.agree_privacy, profile_row.agree_age14, profile_row.agree_third,
       profile_row.agree_mkt_email, profile_row.agree_mkt_sms,
       profile_row.consent_at, (now() + interval '5 years')::date);
  end if;
  delete from storage.objects where bucket_id = 'animal-photos'
    and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n_photo = row_count;
  delete from storage.objects where bucket_id = 'morph-images'
    and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n_legacy_photo = row_count;
  n_photo := n_photo + n_legacy_photo;
  delete from public.mating_events where user_id = uid;
  delete from public.animals where user_id = uid or device = dev;
  delete from public.clutches where user_id = uid or device = dev;
  delete from public.pairings where user_id = uid or device = dev;
  delete from public.mating_groups where user_id = uid;
  delete from public.feed_items where user_id = uid;
  get diagnostics n_feed = row_count;
  delete from public.breeding_projects where user_id = uid;
  get diagnostics n_project = row_count;
  update public.access_codes set revoked = true where redeemed_by = dev;
  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true, 'photos_deleted', n_photo,
    'feed_items_deleted', n_feed, 'breeding_projects_deleted', n_project);
end;
$$;
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
commit;
