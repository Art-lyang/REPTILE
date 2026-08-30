create table if not exists public.mating_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  species text not null,
  name text not null,
  male uuid not null references public.animals(id) on delete restrict,
  status text not null default 'active',
  start_date date,
  end_date date,
  target_morph text,
  project_id uuid references public.breeding_projects(id) on delete set null,
  project_step smallint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mating_groups_species_ck check (species in ('gecko','crested','fattail','ballpython')),
  constraint mating_groups_name_ck check (char_length(btrim(name)) between 1 and 120),
  constraint mating_groups_status_ck check (status in ('planning','active','paused','closed')),
  constraint mating_groups_dates_ck check (end_date is null or start_date is null or end_date >= start_date),
  constraint mating_groups_target_ck check (target_morph is null or char_length(btrim(target_morph)) between 1 and 120),
  constraint mating_groups_note_ck check (note is null or char_length(note) <= 1000),
  constraint mating_groups_project_step_ck check (
    (project_id is null and project_step is null)
    or (project_id is not null and project_step between 1 and 12)
  )
);
create index if not exists mating_groups_user_species_updated_idx
  on public.mating_groups(user_id, species, updated_at desc);
create index if not exists mating_groups_male_idx on public.mating_groups(male);
create index if not exists mating_groups_project_idx on public.mating_groups(project_id)
  where project_id is not null;

alter table public.pairings
  add column if not exists group_id uuid;
alter table public.pairings
  drop constraint if exists pairings_group_id_fkey;
alter table public.pairings
  add constraint pairings_group_id_fkey foreign key (group_id)
  references public.mating_groups(id) on delete set null;
create unique index if not exists pairings_group_female_uidx
  on public.pairings(group_id, female) where group_id is not null;
create index if not exists pairings_group_id_idx on public.pairings(group_id)
  where group_id is not null;

create table if not exists public.mating_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.mating_groups(id) on delete restrict,
  pairing_id uuid not null references public.pairings(id) on delete restrict,
  occurred_on date not null,
  result text not null default 'introduced',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mating_events_result_ck check (
    result in ('introduced','courtship','copulation','no_copulation','separated','unknown')
  ),
  constraint mating_events_note_ck check (note is null or char_length(note) <= 1000),
  constraint mating_events_date_ck check (occurred_on <= current_date)
);
create index if not exists mating_events_group_date_idx
  on public.mating_events(group_id, occurred_on desc, created_at desc);
create index if not exists mating_events_pairing_date_idx
  on public.mating_events(pairing_id, occurred_on desc, created_at desc);
create index if not exists mating_events_user_date_idx
  on public.mating_events(user_id, occurred_on desc, created_at desc);

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

create or replace function public.mating_group_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.male is distinct from new.male
     and exists (select 1 from public.pairings p where p.group_id = old.id) then
    raise exception 'CARE_MATING_GROUP_MALE_LOCKED';
  end if;
  if not exists (
    select 1 from public.animals a
     where a.id = new.male
       and a.user_id = new.user_id
       and a.sex = 'male'
       and a.life_stage = 'adult'
       and (case when a.species = 'leopard' then 'gecko' else a.species end) = new.species
  ) then
    raise exception 'CARE_MATING_GROUP_MALE_INVALID';
  end if;
  if new.project_id is not null and not exists (
    select 1 from public.breeding_projects p
     where p.id = new.project_id and p.user_id = new.user_id and p.species = new.species
  ) then
    raise exception 'CARE_MATING_GROUP_PROJECT_INVALID';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.mating_group_guard() from public, anon, authenticated;
drop trigger if exists mating_group_guard on public.mating_groups;
create trigger mating_group_guard
  before insert or update on public.mating_groups
  for each row execute function public.mating_group_guard();

create or replace function public.care_pairing_parent_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.male is not null and new.male = new.female then
    raise exception 'CARE_PAIRING_DUPLICATE';
  end if;
  if new.male is not null and not exists (
    select 1 from public.animals a
     where a.id = new.male and a.sex = 'male' and a.life_stage = 'adult'
       and (case when a.species = 'leopard' then 'gecko' else a.species end) = new.species
       and a.user_id is not distinct from new.user_id
       and (new.user_id is not null or a.device = new.device)
  ) then
    raise exception 'CARE_PAIRING_MALE_INVALID';
  end if;
  if new.female is not null and not exists (
    select 1 from public.animals a
     where a.id = new.female and a.sex = 'female' and a.life_stage = 'adult'
       and (case when a.species = 'leopard' then 'gecko' else a.species end) = new.species
       and a.user_id is not distinct from new.user_id
       and (new.user_id is not null or a.device = new.device)
  ) then
    raise exception 'CARE_PAIRING_FEMALE_INVALID';
  end if;
  if new.group_id is not null and not exists (
    select 1 from public.mating_groups g
     where g.id = new.group_id and g.user_id = new.user_id
       and g.species = new.species and g.male = new.male
  ) then
    raise exception 'CARE_MATING_GROUP_LINK_INVALID';
  end if;
  return new;
end;
$$;
revoke all on function public.care_pairing_parent_guard() from public, anon, authenticated;
drop trigger if exists care_pairing_parent_guard on public.pairings;
create trigger care_pairing_parent_guard
  before insert or update of male, female, user_id, device, species, group_id on public.pairings
  for each row execute function public.care_pairing_parent_guard();

create or replace function public.mating_event_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'LOGIN_REQUIRED'; end if;
  if new.user_id is null then new.user_id := current_user_id; end if;
  if new.user_id <> current_user_id then raise exception 'CARE_MATING_EVENT_OWNER_INVALID'; end if;
  if not exists (
    select 1
      from public.mating_groups g
      join public.pairings p on p.group_id = g.id
     where g.id = new.group_id and p.id = new.pairing_id
       and g.user_id = current_user_id and p.user_id = current_user_id
       and g.male = p.male
  ) then
    raise exception 'CARE_MATING_GROUP_LINK_INVALID';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.mating_event_guard() from public, anon, authenticated;
drop trigger if exists mating_event_guard on public.mating_events;
create trigger mating_event_guard
  before insert or update on public.mating_events
  for each row execute function public.mating_event_guard();

alter table public.mating_groups enable row level security;
alter table public.mating_events enable row level security;
drop policy if exists mating_groups_own on public.mating_groups;
create policy mating_groups_own on public.mating_groups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists mating_events_own on public.mating_events;
create policy mating_events_own on public.mating_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.mating_groups from public, anon;
revoke all on public.mating_events from public, anon;
grant select, insert, update, delete on public.mating_groups to authenticated;
grant select, insert, update, delete on public.mating_events to authenticated;

create or replace function public.save_mating_group(p_group jsonb, p_female_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  group_id_value uuid;
  male_id_value uuid;
  female_id_value uuid;
  pair_id_value uuid;
  species_value text;
  name_value text;
  status_value text;
  project_id_value uuid;
  project_step_value smallint;
  female_count integer;
  device_value text;
begin
  if current_user_id is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_group is null or jsonb_typeof(p_group) <> 'object' then raise exception 'CARE_MATING_GROUP_INVALID'; end if;
  if cardinality(p_female_ids) is null or cardinality(p_female_ids) < 1 or cardinality(p_female_ids) > 12 then
    raise exception 'CARE_MATING_GROUP_FEMALE_INVALID';
  end if;
  if (select count(distinct female_id) from unnest(p_female_ids) female_id) <> cardinality(p_female_ids) then
    raise exception 'CARE_MATING_GROUP_FEMALE_INVALID';
  end if;

  group_id_value := nullif(p_group->>'id', '')::uuid;
  male_id_value := nullif(p_group->>'male', '')::uuid;
  species_value := case when p_group->>'species' = 'leopard' then 'gecko' else p_group->>'species' end;
  name_value := btrim(coalesce(p_group->>'name', ''));
  status_value := coalesce(nullif(p_group->>'status', ''), 'active');
  project_id_value := nullif(p_group->>'project_id', '')::uuid;
  project_step_value := nullif(p_group->>'project_step', '')::smallint;
  device_value := 'u_' || current_user_id::text;

  if name_value = '' or char_length(name_value) > 120 then raise exception 'CARE_MATING_GROUP_INVALID'; end if;
  if species_value not in ('gecko','crested','fattail','ballpython') then raise exception 'CARE_MATING_GROUP_INVALID'; end if;
  if status_value not in ('planning','active','paused','closed') then raise exception 'CARE_MATING_GROUP_INVALID'; end if;
  if not exists (
    select 1 from public.animals a
     where a.id = male_id_value and a.user_id = current_user_id
       and a.sex = 'male' and a.life_stage = 'adult'
       and (case when a.species = 'leopard' then 'gecko' else a.species end) = species_value
  ) then raise exception 'CARE_MATING_GROUP_MALE_INVALID'; end if;
  select count(*) into female_count
    from public.animals a
   where a.id = any(p_female_ids) and a.user_id = current_user_id
     and a.sex = 'female' and a.life_stage = 'adult'
     and (case when a.species = 'leopard' then 'gecko' else a.species end) = species_value;
  if female_count <> cardinality(p_female_ids) then raise exception 'CARE_MATING_GROUP_FEMALE_INVALID'; end if;

  if group_id_value is null then
    insert into public.mating_groups (
      user_id, species, name, male, status, start_date, end_date,
      target_morph, project_id, project_step, note
    ) values (
      current_user_id, species_value, name_value, male_id_value, status_value,
      nullif(p_group->>'start_date', '')::date, nullif(p_group->>'end_date', '')::date,
      nullif(btrim(p_group->>'target_morph'), ''), project_id_value, project_step_value,
      nullif(btrim(p_group->>'note'), '')
    ) returning id into group_id_value;
  else
    update public.mating_groups set
      name = name_value, status = status_value,
      start_date = nullif(p_group->>'start_date', '')::date,
      end_date = nullif(p_group->>'end_date', '')::date,
      target_morph = nullif(btrim(p_group->>'target_morph'), ''),
      project_id = project_id_value, project_step = project_step_value,
      note = nullif(btrim(p_group->>'note'), '')
    where id = group_id_value and user_id = current_user_id and species = species_value
      and male = male_id_value;
    if not found then raise exception 'CARE_MATING_GROUP_OWNER_INVALID'; end if;
  end if;

  update public.pairings set group_id = null
   where group_id = group_id_value and user_id = current_user_id
     and not (female = any(p_female_ids));

  foreach female_id_value in array p_female_ids loop
    select id into pair_id_value from public.pairings
     where group_id = group_id_value and female = female_id_value and user_id = current_user_id
     limit 1;
    if pair_id_value is null then
      insert into public.pairings (
        device, user_id, name, male, female, species, target_morph,
        project_id, project_step, group_id, note
      ) select
        device_value, current_user_id,
        left(name_value || ' · ' || coalesce(a.name, 'Female'), 120),
        male_id_value, female_id_value, species_value,
        nullif(btrim(p_group->>'target_morph'), ''), project_id_value,
        project_step_value, group_id_value, nullif(btrim(p_group->>'note'), '')
      from public.animals a where a.id = female_id_value;
    else
      update public.pairings set
        name = left(name_value || ' · ' || coalesce((select a.name from public.animals a where a.id = female_id_value), 'Female'), 120),
        target_morph = nullif(btrim(p_group->>'target_morph'), ''),
        project_id = project_id_value, project_step = project_step_value
      where id = pair_id_value and user_id = current_user_id;
    end if;
    pair_id_value := null;
  end loop;
  return group_id_value;
end;
$$;
revoke all on function public.save_mating_group(jsonb, uuid[]) from public, anon;
grant execute on function public.save_mating_group(jsonb, uuid[]) to authenticated;
notify pgrst, 'reload schema';
