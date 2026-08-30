/* =============================================================================
   v31 - line-trait scores and authenticated breeding projects

   Apply after v30. This migration is intentionally idempotent: helpers,
   constraints, policies, and triggers are replaced by name on every run.
   ============================================================================= */

/* -- 0. Prerequisites ------------------------------------------------------- */
do $guard$
begin
  if to_regclass('public.animals') is null
     or to_regclass('public.pairings') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.consent_archive') is null
     or to_regclass('public.feed_items') is null
     or to_regclass('storage.objects') is null then
    raise exception 'v31 requires the v30 schema; apply the earlier migrations first';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'animals'
       and column_name = 'user_id'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'animals'
       and column_name = 'species'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pairings'
       and column_name = 'user_id'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pairings'
       and column_name = 'species'
  ) then
    raise exception 'v31 requires the ownership and species columns from earlier migrations';
  end if;

  if to_regprocedure('public.save_row(text,text,jsonb)') is null then
    raise exception 'v31 requires public.save_row(text,text,jsonb)';
  end if;
end
$guard$;


/* -- 1. Per-animal line-trait scores --------------------------------------- */
create or replace function public.valid_line_trait_scores(p_scores jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  score_count integer;
  score_entry record;
begin
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    return false;
  end if;

  if octet_length(p_scores::text) > 4096 then
    return false;
  end if;

  select count(*) into score_count
    from jsonb_object_keys(p_scores);
  if score_count > 32 then
    return false;
  end if;

  for score_entry in select key, value from jsonb_each(p_scores)
  loop
    if score_entry.key !~ '^[a-z0-9_-]{1,64}$'
       or jsonb_typeof(score_entry.value) <> 'number'
       or score_entry.value::text !~ '^[1-5]$' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.valid_line_trait_scores(jsonb)
  from public, anon, authenticated;

alter table public.animals
  add column if not exists line_trait_scores jsonb not null default '{}'::jsonb;

update public.animals
   set line_trait_scores = '{}'::jsonb
 where line_trait_scores is null;

alter table public.animals
  alter column line_trait_scores set default '{}'::jsonb,
  alter column line_trait_scores set not null;

alter table public.animals
  drop constraint if exists animals_line_trait_scores_ck;
alter table public.animals
  add constraint animals_line_trait_scores_ck
  check (public.valid_line_trait_scores(line_trait_scores));


/* -- 2. Versioned breeding-project targets -------------------------------- */
create or replace function public.valid_breeding_project_target_v1(p_target jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  target_mode text;
  trait_count integer;
  distinct_trait_count integer;
  target_trait jsonb;
begin
  if p_target is null or jsonb_typeof(p_target) <> 'object' then
    return false;
  end if;

  if octet_length(p_target::text) > 4096 then
    return false;
  end if;

  if p_target->>'version' <> '1' then
    return false;
  end if;
  if jsonb_typeof(p_target->'version') <> 'number'
     or jsonb_typeof(p_target->'mode') <> 'string'
     or jsonb_typeof(p_target->'traits') <> 'array' then
    return false;
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_target) as target_key
     where target_key not in ('version', 'mode', 'traits')
  ) or (select count(*) from jsonb_object_keys(p_target)) <> 3 then
    return false;
  end if;

  target_mode := p_target->>'mode';
  if target_mode not in ('line_fix', 'cross') then
    return false;
  end if;

  if target_mode = 'line_fix'
     and jsonb_array_length(p_target->'traits') <> 1 then
    return false;
  end if;
  if target_mode = 'cross'
     and jsonb_array_length(p_target->'traits') <> 2 then
    return false;
  end if;

  select count(*), count(distinct trait->>'id')
    into trait_count, distinct_trait_count
    from jsonb_array_elements(p_target->'traits') as trait;
  if trait_count <> distinct_trait_count then
    return false;
  end if;

  for target_trait in select value from jsonb_array_elements(p_target->'traits')
  loop
    if jsonb_typeof(target_trait) <> 'object'
       or not (target_trait ? 'id')
       or not (target_trait ? 'targetScore')
       or (select count(*) from jsonb_object_keys(target_trait)) <> 2 then
      return false;
    end if;
    if jsonb_typeof(target_trait->'id') <> 'string'
       or (target_trait->>'id') !~ '^[a-z0-9_-]{1,64}$' then
      return false;
    end if;
    if jsonb_typeof(target_trait->'targetScore') <> 'number'
       or (target_trait->>'targetScore') !~ '^[1-5]$' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.valid_breeding_project_target_v1(jsonb)
  from public, anon;
grant execute on function public.valid_breeding_project_target_v1(jsonb)
  to authenticated;

create table if not exists public.breeding_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  species text not null
    constraint breeding_projects_species_ck
    check (species in ('gecko', 'crested', 'fattail', 'ballpython')),
  name text not null
    constraint breeding_projects_name_ck
    check (char_length(btrim(name)) between 1 and 120),
  target jsonb not null
    constraint breeding_projects_target_ck
    check (public.valid_breeding_project_target_v1(target)),
  status text not null default 'draft'
    constraint breeding_projects_status_ck
    check (status in ('draft', 'active', 'complete', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists breeding_projects_user_id_idx
  on public.breeding_projects(user_id);


/* -- 3. Project RLS and explicit Data API grants --------------------------- */
alter table public.breeding_projects enable row level security;

drop policy if exists breeding_projects_select on public.breeding_projects;
create policy breeding_projects_select on public.breeding_projects
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists breeding_projects_insert on public.breeding_projects;
create policy breeding_projects_insert on public.breeding_projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists breeding_projects_update on public.breeding_projects;
create policy breeding_projects_update on public.breeding_projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists breeding_projects_delete on public.breeding_projects;
create policy breeding_projects_delete on public.breeding_projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.breeding_projects from public;
revoke all on table public.breeding_projects from anon;
revoke all on table public.breeding_projects from authenticated;
grant select, insert, update, delete on table public.breeding_projects
  to authenticated;


/* -- 4. updated_at and pairing/project integrity --------------------------- */
create or replace function public.breeding_projects_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.breeding_projects_touch_updated_at()
  from public, anon, authenticated;

drop trigger if exists breeding_projects_touch_updated_at
  on public.breeding_projects;
create trigger breeding_projects_touch_updated_at
  before update of user_id, species, name, target, status
  on public.breeding_projects
  for each row execute function public.breeding_projects_touch_updated_at();

alter table public.pairings
  add column if not exists project_id uuid,
  add column if not exists project_step smallint;

alter table public.pairings
  drop constraint if exists pairings_project_id_fkey;
alter table public.pairings
  add constraint pairings_project_id_fkey
  foreign key (project_id)
  references public.breeding_projects(id)
  on delete set null;

alter table public.pairings
  drop constraint if exists pairings_project_step_ck;
alter table public.pairings
  add constraint pairings_project_step_ck
  check (
    (project_id is null and project_step is null)
    or (project_id is not null and project_step between 1 and 3)
  );

create index if not exists pairings_project_id_idx
  on public.pairings(project_id);

create or replace function public.pairings_breeding_project_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_project record;
begin
  if new.project_id is null then
    new.project_step := null;
    return new;
  end if;

  if new.project_step is null then
    raise exception 'project_step is required for a project-linked pairing';
  end if;

  select project.user_id, project.species
    into linked_project
    from public.breeding_projects as project
   where project.id = new.project_id;

  if not found then
    raise exception 'breeding project not found';
  end if;
  if linked_project.user_id is distinct from new.user_id then
    raise exception 'pairing and breeding project owners must match';
  end if;
  if linked_project.species is distinct from new.species then
    raise exception 'pairing and breeding project species must match';
  end if;
  if (select auth.uid()) is null
     or linked_project.user_id is distinct from (select auth.uid()) then
    raise exception 'breeding project does not belong to the authenticated user';
  end if;

  return new;
end;
$$;

revoke all on function public.pairings_breeding_project_guard()
  from public, anon, authenticated;

drop trigger if exists pairings_breeding_project_guard on public.pairings;
create trigger pairings_breeding_project_guard
  before insert or update of project_id, project_step, user_id, species
  on public.pairings
  for each row execute function public.pairings_breeding_project_guard();


/* -- 5. Account deletion keeps every v24/v25/v30 cleanup path -------------- */
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  dev text;
  profile_row public.profiles;
  n_photo integer := 0;
  n_legacy_photo integer := 0;
  n_feed integer := 0;
  n_project integer := 0;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  dev := 'u_' || uid::text;

  select * into profile_row
    from public.profiles
   where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'),
       profile_row.agree_terms, profile_row.agree_privacy,
       profile_row.agree_age14, profile_row.agree_third,
       profile_row.agree_mkt_email, profile_row.agree_mkt_sms,
       profile_row.consent_at, (now() + interval '5 years')::date);
  end if;

  delete from storage.objects
   where bucket_id = 'animal-photos'
     and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n_photo = row_count;

  delete from storage.objects
   where bucket_id = 'morph-images'
     and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n_legacy_photo = row_count;
  n_photo := n_photo + n_legacy_photo;

  delete from public.clutches where user_id = uid or device = dev;
  delete from public.pairings where user_id = uid or device = dev;
  delete from public.animals where user_id = uid or device = dev;

  delete from public.feed_items where user_id = uid;
  get diagnostics n_feed = row_count;

  delete from public.breeding_projects where user_id = uid;
  get diagnostics n_project = row_count;

  update public.access_codes
     set revoked = true
   where redeemed_by = dev;
  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;

  return jsonb_build_object(
    'ok', true,
    'photos_deleted', n_photo,
    'feed_items_deleted', n_feed,
    'breeding_projects_deleted', n_project
  );
end;
$$;

revoke all on function public.delete_my_account()
  from public, anon, authenticated;
grant execute on function public.delete_my_account()
  to authenticated;
