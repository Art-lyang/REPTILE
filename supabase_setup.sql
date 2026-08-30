-- ============================================================
--  레오파드 모프 계산기 · Supabase 스키마 (처음 설치용 전체본)
-- ============================================================
--
--  🛑 이미 운영 중인 프로젝트에서는 이 파일을 실행하지 마세요.
--
--     아래 v1 구역은 "처음 설치"를 기준으로 쓰인 것이라,
--     그동안 별도로 개선된 함수(redeem_code 등)를 옛날 버전으로 되돌립니다.
--     실제로 다음 오류가 나며 스크립트 전체가 취소됩니다.
--
--       ERROR 42P13: cannot remove parameter defaults from existing function
--       HINT: Use DROP FUNCTION redeem_code(text,text) first.
--
--     운영 중인 DB 의 redeem_code 에는 기본값이 붙은 파라미터와
--     '로그인 필요(login_required)' 로직이 들어 있는데, 이 파일에는 없습니다.
--     덮어쓰면 로그인 없이도 코드를 쓸 수 있게 되어 보안이 약해집니다.
--
--  ✅ 기능을 추가하려면  supabase_v2.sql  을 실행하세요.
--     그 파일은 v1 을 건드리지 않고 새로 필요한 것만 추가합니다.
--
--  이 파일은 새 Supabase 프로젝트를 처음부터 만들 때만 쓰세요.
-- ============================================================

-- 1) 모프 (유전 모프 + 라인브리딩)  kind: rec / incdom / dom / poly
create table if not exists public.morphs (
  id         text primary key,
  kind       text not null default 'rec',
  family     text default 'albino',
  ko text, en text, zh text, ja text,
  super_ko text, super_en text, super_zh text, super_ja text,
  risk       boolean default false,
  color      text,          -- 칩 대표색 (#RRGGBB)
  image_url  text,          -- 업로드한 실물 이미지 (있으면 그림 대체)
  sort       int default 0,
  active     boolean default true,
  updated_at timestamptz default now()
);

-- 2) 콤보 (디자이너 명칭) — tokens 예: {super_macksnow,eclipse}
create table if not exists public.combos (
  id         uuid primary key default gen_random_uuid(),
  tokens     text[] not null default '{}',
  ko text, en text,
  vintage    boolean default false,   -- 추억의 모프(기본 숨김)
  sort       int default 0,
  updated_at timestamptz default now()
);
-- 이미 만들어 둔 경우를 위한 컬럼 추가 (없으면 추가)
alter table public.combos add column if not exists vintage boolean default false;
alter table public.combos add column if not exists risk    boolean default false;   -- 위험(⚠) 표시

-- 3) 접속 로그
create table if not exists public.visits (
  id     bigint generated always as identity primary key,
  ts     timestamptz default now(),
  day    date default ((now() at time zone 'utc')::date),
  device text,
  lang   text
);

-- 4) 조합 확인 로그 (자주 계산한 조합 통계용)
create table if not exists public.combo_queries (
  id    bigint generated always as identity primary key,
  ts    timestamptz default now(),
  ckey  text not null,      -- 정규화된 조합 키
  label text                -- 사람이 읽는 표기
);

-- 5) 발급 코드 (일회성 · 한 명당 1회 · 재사용 불가)
create table if not exists public.access_codes (
  code        text primary key,
  note        text,               -- 누구에게 발급했는지 메모
  created_at  timestamptz default now(),
  redeemed_by text,               -- 사용한 사용자(기기) 식별자
  redeemed_at timestamptz,
  revoked     boolean default false,
  kind        text default 'trial',   -- trial(체험판) | sub(구독)
  days        int  default 7,         -- 유효 기간(일). null 이면 무기한
  expires_at  timestamptz             -- 사용 시점에 자동 계산됨
);
-- 기존에 만든 경우를 위한 컬럼 추가
alter table public.access_codes add column if not exists kind       text default 'trial';
alter table public.access_codes add column if not exists days       int  default 7;
alter table public.access_codes add column if not exists expires_at timestamptz;

-- 사용자 데이터 (프리미엄 기능) --------------------------------
create table if not exists public.animals (
  id uuid primary key default gen_random_uuid(),
  device text not null,
  name text, sex text,                       -- male / female / unknown
  life_stage text not null default 'baby_unknown',
  hatch_date date,
  morphs text[] default '{}',                -- 비주얼 토큰
  hets   text[] default '{}',                -- het 보유 유전자 id
  color_grade int,                           -- 라인브리딩 색 강도 1~5
  parent_a uuid, parent_b uuid,              -- 혈통
  photo_url text, photos text[] not null default '{}', note text,
  created_at timestamptz default now()
);
create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  device text not null,
  name text, male uuid, female uuid, note text,
  species text not null default 'gecko'
    check (species in ('gecko', 'crested', 'fattail', 'ballpython')),
  target_morph text
    check (target_morph is null or char_length(target_morph) between 1 and 120),
  calculation jsonb,
  calculated_at timestamptz,
  created_at timestamptz default now(),
  constraint pairings_calculation_ck check (
    calculation is null
    or case
      when jsonb_typeof(calculation) = 'object'
       and jsonb_typeof(calculation->'parents') = 'object'
       and jsonb_typeof(calculation->'results') = 'array'
      then (calculation->>'version') = '1'
       and calculation->>'species' = species
       and jsonb_array_length(calculation->'results') between 1 and 128
       and octet_length(calculation::text) <= 65536
      else false
    end
  )
);
create table if not exists public.clutches (
  id uuid primary key default gen_random_uuid(),
  device text not null,
  pairing uuid, laid_date date, temp numeric,
  expected_hatch date, egg_count int, note text,
  species text not null default 'gecko',
  created_at timestamptz default now()
);

alter table public.animals
  add column if not exists user_id uuid,
  add column if not exists species text not null default 'leopard',
  add column if not exists line_trait_scores jsonb not null default '{}'::jsonb,
  add column if not exists life_stage text not null default 'baby_unknown',
  add column if not exists share_token text,
  add column if not exists is_public boolean not null default false,
  add column if not exists is_listed boolean not null default false,
  add column if not exists public_note text,
  add column if not exists public_breeder boolean not null default false,
  add column if not exists public_weight boolean not null default false,
  add column if not exists clutch_label text;
alter table public.animals drop constraint if exists animals_life_stage_ck;
alter table public.animals add constraint animals_life_stage_ck
  check (life_stage in ('baby_unknown','juvenile','subadult','adult'));
alter table public.animals drop constraint if exists animals_clutch_label_ck;
alter table public.animals add constraint animals_clutch_label_ck
  check (clutch_label is null or char_length(btrim(clutch_label)) between 1 and 80);

/* save_row의 jsonb_populate_record는 누락 키에 테이블 DEFAULT를 적용하지 않습니다.
   따라서 신규·구형 화면이 보내지 않은 NOT NULL 기본값은 INSERT 직전에 채웁니다. */
create or replace function public.animals_fill_species()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.species is null or btrim(new.species) = '' then
    new.species := 'leopard';
  end if;
  if new.is_public      is null then new.is_public      := false; end if;
  if new.is_listed      is null then new.is_listed      := false; end if;
  if new.public_breeder is null then new.public_breeder := false; end if;
  if new.public_weight  is null then new.public_weight  := false; end if;
  if new.line_trait_scores is null then new.line_trait_scores := '{}'::jsonb; end if;
  if new.life_stage is null then new.life_stage := 'baby_unknown'; end if;
  return new;
end $$;

drop trigger if exists animals_species_fill on public.animals;
create trigger animals_species_fill
  before insert or update on public.animals
  for each row execute function public.animals_fill_species();

create unique index if not exists animals_share_token_uidx
  on public.animals(share_token) where share_token is not null;
alter table public.pairings add column if not exists user_id uuid;
alter table public.clutches
  add column if not exists user_id uuid,
  add column if not exists species text;
update public.clutches as clutch
   set species = linked_pair.species
  from public.pairings as linked_pair
 where clutch.pairing = linked_pair.id
   and clutch.species is null;
update public.clutches set species = 'gecko' where species is null;
alter table public.clutches
  alter column species set default 'gecko',
  alter column species set not null;
alter table public.clutches drop constraint if exists clutches_species_ck;
alter table public.clutches add constraint clutches_species_ck
  check (species in ('gecko','crested','fattail','ballpython'));

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
  select count(*) into score_count from jsonb_object_keys(p_scores);
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

update public.animals
   set line_trait_scores = '{}'::jsonb
 where line_trait_scores is null;
alter table public.animals
  alter column line_trait_scores set default '{}'::jsonb,
  alter column line_trait_scores set not null;
alter table public.animals drop constraint if exists animals_line_trait_scores_ck;
alter table public.animals
  add constraint animals_line_trait_scores_ck
  check (public.valid_line_trait_scores(line_trait_scores));

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
drop trigger if exists breeding_projects_touch_updated_at on public.breeding_projects;
create trigger breeding_projects_touch_updated_at
  before update of user_id, species, name, target, status
  on public.breeding_projects
  for each row execute function public.breeding_projects_touch_updated_at();

alter table public.pairings
  add column if not exists project_id uuid,
  add column if not exists project_step smallint;
alter table public.pairings drop constraint if exists pairings_project_id_fkey;
alter table public.pairings
  add constraint pairings_project_id_fkey
  foreign key (project_id)
  references public.breeding_projects(id)
  on delete set null;
alter table public.pairings drop constraint if exists pairings_project_step_ck;
alter table public.pairings
  add constraint pairings_project_step_ck
  check (
    (project_id is null and project_step is null)
    or (project_id is not null and project_step between 1 and 3)
  );
create index if not exists pairings_project_id_idx on public.pairings(project_id);

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

create or replace function public.clutches_pairing_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_pair record;
begin
  if new.pairing is null then return new; end if;
  select pairing.user_id, pairing.species
    into linked_pair
    from public.pairings as pairing
   where pairing.id = new.pairing;
  if not found then raise exception 'pairing not found'; end if;
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

create table if not exists public.feed_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,
  kind         text not null default 'staple',
  brand        text,
  unit         text not null default 'g',
  per_use      numeric(10,2),
  amount_left  numeric(10,2),
  amount_full  numeric(10,2),
  opened_on    date,
  expires_on   date,
  buy_url      text,
  lead_days    int not null default 3,
  note         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.feed_items
  drop constraint if exists feed_items_kind_ck;
alter table public.feed_items
  add constraint feed_items_kind_ck
  check (kind in ('staple','treat','special','supplement','substrate','other'));
alter table public.feed_items
  drop constraint if exists feed_items_amount_ck;
alter table public.feed_items
  add constraint feed_items_amount_ck
  check ((amount_left is null or amount_left >= 0)
     and (amount_full is null or amount_full >= 0)
     and (per_use is null or per_use > 0));
alter table public.feed_items
  drop constraint if exists feed_items_lead_ck;
alter table public.feed_items
  add constraint feed_items_lead_ck
  check (lead_days between 0 and 90);
alter table public.feed_items
  drop constraint if exists feed_items_url_ck;
alter table public.feed_items
  add constraint feed_items_url_ck
  check (buy_url is null or buy_url ~* '^https?://');

create index if not exists feed_items_user_idx
  on public.feed_items(user_id, is_active);

create table if not exists public.care_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  animal_id      uuid references public.animals(id) on delete cascade,
  kind           text not null,
  title          text,
  detail         text,
  feed_item_id   uuid references public.feed_items(id) on delete set null,
  interval_days  int,
  weekdays       int[],
  weekly_target  smallint,
  start_date     date not null default current_date,
  time_of_day    time,
  is_active      boolean not null default true,
  last_done_date date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.care_plans
  add column if not exists feed_item_id uuid references public.feed_items(id) on delete set null;
alter table public.care_plans
  add column if not exists weekly_target smallint;

alter table public.care_plans
  drop constraint if exists care_plans_kind_ck;
alter table public.care_plans
  add constraint care_plans_kind_ck
  check (kind in ('feed','water','clean','bedding','supplement','weigh','health','custom'));

alter table public.care_plans
  drop constraint if exists care_plans_cycle_ck;
alter table public.care_plans
  add constraint care_plans_cycle_ck
  check (num_nonnulls(interval_days, weekdays, weekly_target) = 1);

alter table public.care_plans
  drop constraint if exists care_plans_interval_ck;
alter table public.care_plans
  add constraint care_plans_interval_ck
  check (interval_days is null or interval_days between 1 and 365);

alter table public.care_plans
  drop constraint if exists care_plans_weekdays_ck;
alter table public.care_plans
  add constraint care_plans_weekdays_ck
  check (
    weekdays is null
    or (
      cardinality(weekdays) between 1 and 7
      and weekdays <@ array[0,1,2,3,4,5,6]
    )
  );

alter table public.care_plans
  drop constraint if exists care_plans_weekly_target_ck;
alter table public.care_plans
  add constraint care_plans_weekly_target_ck
  check (weekly_target is null or weekly_target between 1 and 7);

create index if not exists care_plans_user_idx
  on public.care_plans(user_id, is_active);
create index if not exists care_plans_animal_idx
  on public.care_plans(animal_id);
create index if not exists care_plans_feed_idx
  on public.care_plans(feed_item_id);

create table if not exists public.care_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  animal_id  uuid references public.animals(id) on delete cascade,
  plan_id    uuid references public.care_plans(id) on delete set null,
  kind       text not null,
  done_date  date not null default current_date,
  title      text,
  detail     text,
  note       text,
  feed_item_id uuid references public.feed_items(id) on delete set null,
  feed_name text,
  feed_category text,
  feed_state text,
  offered_amount numeric(10,2),
  eaten_amount numeric(10,2),
  feed_unit text,
  feeding_result text,
  created_at timestamptz not null default now()
);

alter table public.care_records
  add column if not exists feed_item_id uuid references public.feed_items(id) on delete set null,
  add column if not exists feed_name text,
  add column if not exists feed_category text,
  add column if not exists feed_state text,
  add column if not exists offered_amount numeric(10,2),
  add column if not exists eaten_amount numeric(10,2),
  add column if not exists feed_unit text,
  add column if not exists feeding_result text;

alter table public.care_records
  drop constraint if exists care_records_kind_ck;
alter table public.care_records
  add constraint care_records_kind_ck
  check (kind in ('feed','water','clean','bedding','supplement','weigh','health',
                  'memo','behavior','custom','shed','poop','refusal','symptom'));

alter table public.care_records
  drop constraint if exists care_records_feed_category_ck;
alter table public.care_records
  add constraint care_records_feed_category_ck
  check (feed_category is null or feed_category in
    ('prepared','insect','whole_prey','plant','supplement','other'));
alter table public.care_records
  drop constraint if exists care_records_feed_state_ck;
alter table public.care_records
  add constraint care_records_feed_state_ck
  check (feed_state is null or feed_state in
    ('ready','live','frozen','thawed','powder','mixed','fresh','other'));
alter table public.care_records
  drop constraint if exists care_records_feed_unit_ck;
alter table public.care_records
  add constraint care_records_feed_unit_ck
  check (feed_unit is null or char_length(btrim(feed_unit)) between 1 and 24);
alter table public.care_records
  drop constraint if exists care_records_feeding_result_ck;
alter table public.care_records
  add constraint care_records_feeding_result_ck
  check (feeding_result is null or feeding_result in ('all','partial','refused','unknown'));
alter table public.care_records
  drop constraint if exists care_records_feed_amount_ck;
alter table public.care_records
  add constraint care_records_feed_amount_ck
  check (
    (offered_amount is null and eaten_amount is null)
    or (offered_amount > 0
      and (eaten_amount is null or (eaten_amount >= 0 and eaten_amount <= offered_amount)))
  );
alter table public.care_records
  drop constraint if exists care_records_feed_shape_ck;
alter table public.care_records
  add constraint care_records_feed_shape_ck
  check (
    (feed_name is null and feed_category is null and feed_state is null
      and offered_amount is null and eaten_amount is null and feed_unit is null
      and feeding_result is null)
    or (kind = 'feed' and char_length(btrim(feed_name)) between 1 and 120
      and feed_category is not null and feed_state is not null
      and offered_amount is not null and feed_unit is not null and feeding_result is not null
      and ((feeding_result = 'unknown' and eaten_amount is null)
        or (feeding_result = 'all' and eaten_amount = offered_amount)
        or (feeding_result = 'partial' and eaten_amount > 0 and eaten_amount < offered_amount)
        or (feeding_result = 'refused' and eaten_amount = 0)))
  );

create index if not exists care_records_user_date_idx
  on public.care_records(user_id, done_date desc);
create index if not exists care_records_animal_date_idx
  on public.care_records(animal_id, done_date desc);
create unique index if not exists care_records_plan_once_a_day
  on public.care_records(plan_id, done_date)
  where plan_id is not null;
create index if not exists care_records_feed_item_idx
  on public.care_records(feed_item_id)
  where feed_item_id is not null;

create table if not exists public.weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  animal_id   uuid not null references public.animals(id) on delete cascade,
  grams       numeric(8,2) not null check (grams > 0 and grams < 10000),
  measured_on date not null default current_date,
  measured_at timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists weight_logs_animal_measured_idx
  on public.weight_logs(animal_id, measured_on desc, measured_at desc);

revoke all on public.feed_items from anon;
revoke all on public.care_plans from anon;
revoke all on public.care_records from anon;
revoke all on public.weight_logs from anon;
grant select, insert, update, delete on public.feed_items to authenticated;
grant select, insert, update, delete on public.care_plans to authenticated;
grant select, insert, update, delete on public.care_records to authenticated;
grant select, insert, update, delete on public.weight_logs to authenticated;

alter table public.feed_items enable row level security;
alter table public.care_plans enable row level security;
alter table public.care_records enable row level security;
alter table public.weight_logs enable row level security;

drop policy if exists feed_items_own on public.feed_items;
create policy feed_items_own on public.feed_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists care_plans_own on public.care_plans;
create policy care_plans_own on public.care_plans
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (
      animal_id is null
      or exists (
        select 1 from public.animals a
         where a.id = care_plans.animal_id and a.user_id = (select auth.uid())
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_plans.feed_item_id and feed.user_id = (select auth.uid())
      )
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      animal_id is null
      or exists (
        select 1 from public.animals a
         where a.id = care_plans.animal_id and a.user_id = (select auth.uid())
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_plans.feed_item_id and feed.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists care_records_own on public.care_records;
create policy care_records_own on public.care_records
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (
      animal_id is null
      or exists (
        select 1 from public.animals a
         where a.id = care_records.animal_id and a.user_id = (select auth.uid())
      )
    )
    and (
      plan_id is null
      or exists (
        select 1 from public.care_plans p
         where p.id = care_records.plan_id and p.user_id = (select auth.uid())
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_records.feed_item_id and feed.user_id = (select auth.uid())
      )
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      animal_id is null
      or exists (
        select 1 from public.animals a
         where a.id = care_records.animal_id and a.user_id = (select auth.uid())
      )
    )
    and (
      plan_id is null
      or exists (
        select 1 from public.care_plans p
         where p.id = care_records.plan_id and p.user_id = (select auth.uid())
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_records.feed_item_id and feed.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists weight_logs_own on public.weight_logs;
create policy weight_logs_own on public.weight_logs
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.animals a
                 where a.id = weight_logs.animal_id and a.user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.animals a
                 where a.id = weight_logs.animal_id and a.user_id = auth.uid())
  );

create or replace function public.care_set_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception '로그인이 필요합니다';
  end if;
  return new;
end;
$$;
revoke all on function public.care_set_owner()
  from public, anon, authenticated;

drop trigger if exists feed_items_owner on public.feed_items;
create trigger feed_items_owner before insert on public.feed_items
  for each row execute function public.care_set_owner();
drop trigger if exists care_plans_owner on public.care_plans;
create trigger care_plans_owner before insert on public.care_plans
  for each row execute function public.care_set_owner();
drop trigger if exists care_records_owner on public.care_records;
create trigger care_records_owner before insert on public.care_records
  for each row execute function public.care_set_owner();
drop trigger if exists weight_logs_owner on public.weight_logs;
create trigger weight_logs_owner before insert on public.weight_logs
  for each row execute function public.care_set_owner();

create or replace function public.care_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.care_touch()
  from public, anon, authenticated;

drop trigger if exists feed_items_touch on public.feed_items;
create trigger feed_items_touch before update on public.feed_items
  for each row execute function public.care_touch();
drop trigger if exists care_plans_touch on public.care_plans;
create trigger care_plans_touch before update on public.care_plans
  for each row execute function public.care_touch();

create or replace function public.feed_apply_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.care_records%rowtype;
  fid uuid;
  amount numeric;
  owner_id uuid;
  feed_owner_id uuid;
begin
  rec := case when tg_op = 'DELETE' then old else new end;
  if rec.kind <> 'feed' then return rec; end if;

  if rec.feed_item_id is not null then
    select feed.id,
           case when rec.offered_amount is not null and rec.feed_unit = feed.unit
             then rec.offered_amount else feed.per_use end,
           rec.user_id, feed.user_id
      into fid, amount, owner_id, feed_owner_id
      from public.feed_items feed
     where feed.id = rec.feed_item_id;
  elsif rec.plan_id is not null then
    select plan.feed_item_id, feed.per_use, plan.user_id, feed.user_id
      into fid, amount, owner_id, feed_owner_id
      from public.care_plans plan
      join public.feed_items feed on feed.id = plan.feed_item_id
     where plan.id = rec.plan_id;
  else
    return rec;
  end if;

  if fid is null or amount is null
     or owner_id is distinct from rec.user_id
     or feed_owner_id is distinct from rec.user_id then
    return rec;
  end if;

  if tg_op = 'DELETE' then
    update public.feed_items
       set amount_left = least(coalesce(amount_left, 0) + amount,
                               coalesce(amount_full, coalesce(amount_left, 0) + amount))
     where id = fid and user_id = rec.user_id;
    return old;
  end if;

  update public.feed_items
     set amount_left = greatest(coalesce(amount_left, 0) - amount, 0)
   where id = fid and user_id = rec.user_id and amount_left is not null;
  return new;
end;
$$;
revoke all on function public.feed_apply_usage()
  from public, anon, authenticated;

drop trigger if exists care_records_feed_use on public.care_records;
create trigger care_records_feed_use
  after insert or delete on public.care_records
  for each row execute function public.feed_apply_usage();

drop function if exists public.care_routine_streak(date);
create or replace function public.care_routine_streak()
returns integer
language sql
stable
set search_path = ''
as $$
with params as (
  select auth.uid() as account_id, current_date as end_date
), bounds as (
  select params.*,
         greatest(coalesce((
           select min(plan.start_date)
             from public.care_plans plan
            where plan.user_id = params.account_id
              and plan.is_active = true
              and plan.weekly_target is null
         ), params.end_date), params.end_date - 3650) as first_date
    from params
), scheduled as (
  select calendar.day::date as day,
         count(plan.id)::integer as due_count,
         count(record.id)::integer as done_count,
         bounds.end_date
    from bounds
    cross join lateral generate_series(
      bounds.first_date, bounds.end_date, interval '1 day'
    ) as calendar(day)
    join public.care_plans plan
      on plan.user_id = bounds.account_id
     and plan.is_active = true
     and plan.weekly_target is null
     and plan.start_date <= calendar.day::date
     and (
       (plan.weekdays is not null
        and extract(dow from calendar.day)::integer = any(plan.weekdays))
       or
       (plan.interval_days is not null
        and mod(calendar.day::date - plan.start_date, plan.interval_days) = 0)
     )
    left join public.care_records record
      on record.user_id = bounds.account_id
     and record.plan_id = plan.id
     and record.done_date = calendar.day::date
   where bounds.account_id is not null
   group by calendar.day, bounds.end_date
), eligible as (
  select day,
         done_count = due_count as complete,
         row_number() over (order by day desc) as position
    from scheduled
   where not (day = end_date and done_count < due_count)
)
select coalesce(
  (min(position) filter (where not complete) - 1)::integer,
  count(*)::integer
)
from eligible;
$$;
revoke all on function public.care_routine_streak() from public, anon;
grant execute on function public.care_routine_streak() to authenticated;

-- ---------- Row Level Security ----------
alter table public.morphs        enable row level security;
alter table public.combos        enable row level security;
alter table public.visits        enable row level security;
alter table public.combo_queries enable row level security;
alter table public.access_codes  enable row level security;
alter table public.animals       enable row level security;
alter table public.pairings      enable row level security;
alter table public.clutches      enable row level security;
alter table public.breeding_projects enable row level security;

-- 모프/콤보: 읽기는 누구나, 쓰기는 로그인한 관리자만
drop policy if exists morphs_read  on public.morphs;
drop policy if exists morphs_admin on public.morphs;
create policy morphs_read  on public.morphs for select using (true);
create policy morphs_admin on public.morphs for all to authenticated using (true) with check (true);

drop policy if exists combos_read  on public.combos;
drop policy if exists combos_admin on public.combos;
create policy combos_read  on public.combos for select using (true);
create policy combos_admin on public.combos for all to authenticated using (true) with check (true);

-- 로그: 원본 표 직접 입력은 금지. v28의 검증 함수로만 기록
drop policy if exists visits_insert on public.visits;
drop policy if exists visits_read   on public.visits;
create policy visits_read   on public.visits for select to authenticated using (true);

drop policy if exists cq_insert on public.combo_queries;
drop policy if exists cq_read   on public.combo_queries;
create policy cq_read   on public.combo_queries for select to authenticated using (true);

-- 발급 코드: 관리자만 (익명은 아래 RPC 로만 접근)
drop policy if exists codes_admin on public.access_codes;
create policy codes_admin on public.access_codes for all to authenticated using (true) with check (true);

-- 사용자 데이터: 익명 직접 접근 금지 (아래 RPC 로만 접근 → 남의 데이터 조회 불가)
do $$ declare t text; begin
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format('create policy %I_admin on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- ---------- RPC (익명 사용자용, 보안 정의자) ----------
-- 코드 사용: 존재/미차단/미사용(또는 본인 재확인)일 때만 사용 처리
create or replace function public.redeem_code(p_code text, p_device text)
returns text language plpgsql security definer set search_path = public as $$
declare r public.access_codes;
begin
  select * into r from public.access_codes where code = p_code for update;
  if not found            then return 'not_found'; end if;
  if r.revoked            then return 'revoked';   end if;
  if r.redeemed_by is not null and r.redeemed_by <> p_device then return 'used'; end if;
  update public.access_codes
     set redeemed_by = p_device,
         redeemed_at = coalesce(redeemed_at, now()),
         expires_at  = coalesce(expires_at,
                        case when days is null then null else now() + (days || ' days')::interval end)
   where code = p_code;
  return 'ok';
end $$;

-- 프리미엄 여부 (호환용)
create or replace function public.is_premium(p_device text)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.access_codes
    where redeemed_by = p_device and revoked = false
      and (expires_at is null or expires_at > now())
  );
$$;

-- 등급 + 만료일: {active, kind, expires_at}
create or replace function public.premium_status(p_device text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('active', true, 'kind', kind, 'expires_at', expires_at)
       from public.access_codes
      where redeemed_by = p_device and revoked = false
        and (expires_at is null or expires_at > now())
      order by (kind='sub') desc, expires_at desc nulls first
      limit 1),
    jsonb_build_object('active', false, 'kind', null, 'expires_at', null));
$$;

revoke all on function public.redeem_code(text, text) from public, anon;
revoke all on function public.is_premium(text) from public, anon;
revoke all on function public.premium_status(text) from public, anon;
grant execute on function public.redeem_code(text, text)  to authenticated;
grant execute on function public.is_premium(text)         to authenticated;
grant execute on function public.premium_status(text)     to authenticated;

-- ---------- 사용자 데이터 RPC (본인 device 것만) ----------
create or replace function public.my_rows(p_device text, p_table text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j jsonb; u uuid := auth.uid();
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;
  if u is not null then
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb)
                      from public.%I t where t.user_id = $1', p_table)
      into j using u;
  else
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then return '[]'::jsonb; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb)
                      from public.%I t where t.user_id is null and t.device = $1', p_table)
      into j using p_device;
  end if;
  return j;
end $$;

create or replace function public.save_row(p_device text, p_table text, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare newid uuid; u uuid := auth.uid(); okey text; cur jsonb;
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;
  p_row := p_row - 'device' - 'user_id';
  if coalesce(p_row->>'id','') <> '' then
    if u is not null then
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.user_id = $2', p_table)
        into cur using (p_row->>'id')::uuid, u;
    else
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.device = $2 and t.user_id is null', p_table)
        into cur using (p_row->>'id')::uuid, p_device;
    end if;
    if cur is not null then p_row := cur || p_row; end if;
  end if;
  if u is not null then
    okey := 'u_' || u::text;
    p_row := p_row || jsonb_build_object('user_id', u::text, 'device', okey);
  else
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then raise exception '로그인이 필요합니다'; end if;
    p_row := p_row || jsonb_build_object('device', p_device);
  end if;
  if coalesce(p_row->>'id','') = '' then
    p_row := p_row || jsonb_build_object('id', gen_random_uuid()::text);
  else
    if u is not null then
      execute format('delete from public.%I where id = $1 and user_id = $2', p_table)
        using (p_row->>'id')::uuid, u;
    else
      execute format('delete from public.%I where id = $1 and device = $2 and user_id is null', p_table)
        using (p_row->>'id')::uuid, p_device;
    end if;
  end if;
  if coalesce(p_row->>'created_at','') = '' then
    p_row := p_row || jsonb_build_object('created_at', now());
  end if;
  begin
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) returning id', p_table, p_table)
      into newid using p_row;
  exception when unique_violation then
    raise exception '내 기록이 아닙니다';
  end;
  return newid;
end $$;

create or replace function public.delete_row(p_device text, p_table text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); n int;
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;
  if u is not null then
    execute format('delete from public.%I where id = $1 and user_id = $2', p_table) using p_id, u;
  else
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then return false; end if;
    execute format('delete from public.%I where id = $1 and device = $2 and user_id is null', p_table)
      using p_id, p_device;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- 로그인 시 기기에 있던 코드/데이터를 계정으로 이관
create or replace function public.claim_device(p_device text, p_user text)
returns boolean language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); okey text; t text;
begin
  if u is null then return false; end if;
  if coalesce(p_device,'') = '' or p_device like 'u\_%' then return false; end if;
  okey := 'u_' || u::text;
  update public.access_codes set redeemed_by = okey where redeemed_by = p_device;
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('update public.%I set user_id = $1, device = $2 where device = $3 and user_id is null', t)
      using u, okey, p_device;
  end loop;
  return true;
end $$;
revoke all on function public.claim_device(text,text) from public, anon;
revoke all on function public.my_rows(text,text) from public, anon;
revoke all on function public.save_row(text,text,jsonb) from public, anon;
revoke all on function public.delete_row(text,text,uuid) from public, anon;
grant execute on function public.claim_device(text,text)    to authenticated;
grant execute on function public.my_rows(text,text)          to authenticated;
grant execute on function public.save_row(text,text,jsonb)   to authenticated;
grant execute on function public.delete_row(text,text,uuid)  to authenticated;

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

-- ---------- 통계 뷰 (관리자) ----------
-- security_invoker = 조회하는 사람의 권한으로 실행 (관리자만 볼 수 있게)
create or replace view public.top_combos
  with (security_invoker = true) as
  select ckey, max(label) as label, count(*) as cnt
  from public.combo_queries
  group by ckey
  order by cnt desc;

-- ============================================================
--  v2 · 회원(동의/프로필) + 관리자 권한 체계
--  이 파일 전체를 다시 [Run] 하면 v2까지 한 번에 적용됩니다.
-- ============================================================

-- A) 관리자 명단 -----------------------------------------------
--    ※ 이미 admins 테이블이 있는 경우, 컬럼 구성이 다를 수 있으므로
--      없는 컬럼만 채워 넣습니다. (없으면 42703 오류로 전체가 취소됩니다)
create table if not exists public.admins (
  email      text primary key,
  note       text,
  created_at timestamptz default now()
);
alter table public.admins add column if not exists note       text;
alter table public.admins add column if not exists created_at timestamptz default now();
alter table public.admins enable row level security;

-- 본인 이메일을 관리자에 등록 (필요하면 아래에 추가)
insert into public.admins(email) values ('kmc612000@gmail.com')
  on conflict (email) do nothing;
update public.admins set note = coalesce(note, 'owner') where email = 'kmc612000@gmail.com';

-- 기존 함수를 반환형까지 포함해 통째로 정리합니다.
-- create or replace 는 반환형이 다르면 42P13 으로 실패하고,
-- SQL Editor 는 전체를 하나의 트랜잭션으로 돌리므로 스크립트가 통째로 취소됩니다.
do $drop_fns$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_admin','my_consent','my_identities','delete_my_account')
  loop
    execute format('drop function if exists %s cascade', r.sig);
    raise notice '기존 함수 제거: %', r.sig;
  end loop;
end
$drop_fns$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select to authenticated using (public.is_admin());

-- B) 회원 프로필 + 동의 기록 -----------------------------------
create table if not exists public.profiles (
  user_id         uuid primary key,        -- auth.users.id
  email           text,
  name            text,                    -- 이름 (선택 수집)
  nickname        text,                    -- 닉네임 (선택 수집)
  phone           text,                    -- 휴대전화 (선택 수집)
  agree_terms     boolean default false,   -- [필수] 이용약관
  agree_privacy   boolean default false,   -- [필수] 개인정보 수집·이용
  agree_age14     boolean default false,   -- [필수] 만 14세 이상
  agree_third     boolean default false,   -- [선택] 제3자 제공
  agree_mkt_email boolean default false,   -- [선택] 이메일 마케팅
  agree_mkt_sms   boolean default false,   -- [선택] 문자 마케팅
  consent_at      timestamptz,             -- 최종 동의 일시 (법정 기록)
  mkt_at          timestamptz,             -- 마케팅 최초 동의 일시
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
-- 이미 만들어 둔 경우를 위한 컬럼 보강
--   save_consent 가 건드리는 컬럼을 전부 나열합니다.
--   하나라도 없으면 42703 오류로 스크립트 전체가 취소되므로 빠짐없이 둡니다.
alter table public.profiles add column if not exists email           text;
alter table public.profiles add column if not exists name            text;
alter table public.profiles add column if not exists nickname        text;
alter table public.profiles add column if not exists phone           text;
alter table public.profiles add column if not exists agree_terms     boolean default false;
alter table public.profiles add column if not exists agree_privacy   boolean default false;
alter table public.profiles add column if not exists agree_age14     boolean default false;
alter table public.profiles add column if not exists agree_third     boolean default false;
alter table public.profiles add column if not exists agree_mkt_email boolean default false;
alter table public.profiles add column if not exists agree_mkt_sms   boolean default false;
alter table public.profiles add column if not exists consent_at      timestamptz;
alter table public.profiles add column if not exists mkt_at          timestamptz;
alter table public.profiles add column if not exists created_at      timestamptz default now();
alter table public.profiles add column if not exists updated_at      timestamptz default now();

-- save_consent 의 on conflict (user_id) 가 동작하려면 user_id 에 유일 제약이 있어야 합니다.
do $uq$
begin
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.profiles'::regclass
       and c.contype in ('p','u')
       and c.conkey = array[(select attnum from pg_attribute
                              where attrelid='public.profiles'::regclass and attname='user_id')]
  ) then
    alter table public.profiles add constraint profiles_user_id_key unique (user_id);
    raise notice 'profiles.user_id 유일 제약을 추가했습니다.';
  end if;
end
$uq$;

alter table public.profiles enable row level security;
-- 조회는 관리자만. 쓰기는 아래 save_consent RPC 로만 (직접 insert/update 불가)
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles for select to authenticated using (public.is_admin());

-- C) 동의 저장 / 조회 RPC --------------------------------------
-- 이전 버전 save_consent 를 시그니처와 무관하게 전부 제거합니다.
-- 남겨두면 새 버전(이름 포함)과 함께 둘 다 호출 후보가 되어
-- PostgREST 가 "함수가 모호하다(PGRST203)"며 거부합니다.
do $drop_sc$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_consent'
  loop
    execute format('drop function if exists %s', r.sig);
    raise notice '기존 save_consent 제거: %', r.sig;
  end loop;
end
$drop_sc$;

create or replace function public.save_consent(
  p_terms boolean, p_privacy boolean, p_age14 boolean,
  p_third boolean default false, p_mkt_email boolean default false, p_mkt_sms boolean default false,
  p_phone text default null, p_nickname text default null, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        em  text := coalesce(auth.jwt()->>'email','');
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.profiles as p
    (user_id, email, name, nickname, phone,
     agree_terms, agree_privacy, agree_age14, agree_third, agree_mkt_email, agree_mkt_sms,
     consent_at, mkt_at)
  values
    (uid, em,
     nullif(trim(coalesce(p_name,'')),''),
     nullif(trim(coalesce(p_nickname,'')),''),
     nullif(trim(coalesce(p_phone,'')),''),
     p_terms, p_privacy, p_age14, p_third, p_mkt_email, p_mkt_sms,
     now(), case when p_mkt_email or p_mkt_sms then now() end)
  on conflict (user_id) do update set
    email           = excluded.email,
    name            = coalesce(excluded.name,     p.name),      -- 빈 값이면 기존 유지
    nickname        = coalesce(excluded.nickname, p.nickname),
    phone           = coalesce(excluded.phone,    p.phone),
    agree_terms     = excluded.agree_terms,
    agree_privacy   = excluded.agree_privacy,
    agree_age14     = excluded.agree_age14,
    agree_third     = excluded.agree_third,
    agree_mkt_email = excluded.agree_mkt_email,
    agree_mkt_sms   = excluded.agree_mkt_sms,
    consent_at      = now(),
    mkt_at          = case when excluded.agree_mkt_email or excluded.agree_mkt_sms
                           then coalesce(p.mkt_at, now()) else null end,
    updated_at      = now();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.save_consent(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) to authenticated;

create or replace function public.my_consent()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    (select to_jsonb(p) from public.profiles p where p.user_id = auth.uid()),
    'null'::jsonb);
$$;
grant execute on function public.my_consent() to authenticated;

-- D) 로그 보강 ------------------------------------------------
--    device  : 검색(계산) 로그를 기기와 연결 — 동의 회원의 이용 기록 분석용
--    service : 어느 서비스에서 온 로그인지 구분 (gecko / crested / pygmy / studio)
--              량 스튜디오 안에서 여러 도구가 같은 DB 를 쓰기 때문에 필요합니다.
--              ※ 나중에 붙이면 그 전 데이터는 서비스를 구분할 수 없으니 지금 넣습니다.
--              기존 데이터는 전부 게코에서 온 것이므로 기본값을 'gecko' 로 둡니다.
do $cq$
begin
  if to_regclass('public.combo_queries') is not null then
    alter table public.combo_queries add column if not exists device  text;
    alter table public.combo_queries add column if not exists service text default 'gecko';
  else
    raise notice '[건너뜀] combo_queries 테이블이 없습니다.';
  end if;

  if to_regclass('public.visits') is not null then
    alter table public.visits add column if not exists service text default 'gecko';
  else
    raise notice '[건너뜀] visits 테이블이 없습니다.';
  end if;
end
$cq$;

-- E) [보안 강화] 관리자 전용 잠금 -------------------------------
--    기존에는 "로그인한 누구나" 모프 수정·코드 발급·로그 열람이 가능했음.
--    일반 회원가입이 열렸으므로 관리자(admins 등록 이메일)만 가능하도록 교체.
--    테이블이 없는 프로젝트에서도 멈추지 않도록 존재 여부를 먼저 확인합니다.
do $lock$
declare
  spec text[][] := array[
    ['morphs',        'morphs_admin', 'all',    'authenticated'],
    ['combos',        'combos_admin', 'all',    'authenticated'],
    ['access_codes',  'codes_admin',  'all',    'authenticated'],
    ['animals',       'animals_admin','all',    'authenticated'],
    ['pairings',      'pairings_admin','all',   'authenticated'],
    ['clutches',      'clutches_admin','all',   'authenticated'],
    ['visits',        'visits_read',  'select', 'authenticated'],
    ['combo_queries', 'cq_read',      'select', 'authenticated']
  ];
  i int;
  tbl text; pol text; act text; rol text;
begin
  for i in 1 .. array_length(spec, 1) loop
    tbl := spec[i][1]; pol := spec[i][2]; act := spec[i][3]; rol := spec[i][4];
    if to_regclass('public.' || tbl) is null then
      raise notice '[건너뜀] % 테이블이 없습니다.', tbl;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', pol, tbl);
    if act = 'all' then
      execute format('create policy %I on public.%I for all to %s using (public.is_admin()) with check (public.is_admin())', pol, tbl, rol);
    else
      execute format('create policy %I on public.%I for select to %s using (public.is_admin())', pol, tbl, rol);
    end if;
  end loop;
  raise notice '[완료] 관리자 전용 정책을 적용했습니다.';
end
$lock$;

-- F) Storage(사진 업로드) 정책 --------------------------------
--    증상: 사진 업로드 시 "new row violates row-level security policy"
--    원인: morph-images 버킷에 INSERT 정책이 없어서 업로드가 막힘.
--
--    ⚠️ 중요 — 이 구역은 storage 스키마를 건드리므로 프로젝트 설정에 따라
--       "must be owner of table objects" (42501) 오류가 날 수 있습니다.
--       SQL Editor 는 스크립트 전체를 하나의 트랜잭션으로 실행하기 때문에,
--       여기서 오류가 나면 앞뒤의 모든 작업이 통째로 취소됩니다.
--       그래서 실패해도 나머지가 살아남도록 예외를 삼키게 감싸 두었습니다.
--       실패 시에는 아래 [수동 대체 방법]을 따라 주세요.
do $storage$
begin
  -- 버킷 생성 (없을 때만)
  begin
    insert into storage.buckets
      (id, name, public, file_size_limit, allowed_mime_types)
      values
      ('morph-images','morph-images', true, 5242880,
       array['image/jpeg','image/png','image/webp'])
      on conflict (id) do update
        set public = true,
            file_size_limit = 5242880,
            allowed_mime_types = array['image/jpeg','image/png','image/webp'];
  exception when others then
    raise notice '[건너뜀] 버킷 생성 실패: % — Storage 화면에서 직접 만들어 주세요.', sqlerrm;
  end;

  -- 정책 4종
  begin
    drop policy if exists mi_read   on storage.objects;
    drop policy if exists mi_insert on storage.objects;
    drop policy if exists mi_update on storage.objects;
    drop policy if exists mi_delete on storage.objects;

    -- 공개 URL 읽기는 public 버킷 자체가 처리합니다. 목록·upsert 조회는 관리자만.
    create policy mi_read on storage.objects for select to authenticated
      using (bucket_id = 'morph-images' and public.is_admin());

    -- 업로드: 관리자만 모프 이미지 폴더(m/)에 올립니다.
    create policy mi_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'morph-images'
        and public.is_admin()
        and (storage.foldername(name))[1] = 'm'
      );

    -- 수정/삭제: 관리자만 (실수로 남의 사진을 지우지 못하게)
    create policy mi_update on storage.objects for update to authenticated
      using (bucket_id = 'morph-images' and public.is_admin())
      with check (
        bucket_id = 'morph-images'
        and public.is_admin()
        and (storage.foldername(name))[1] = 'm'
      );

    create policy mi_delete on storage.objects for delete to authenticated
      using (bucket_id = 'morph-images' and public.is_admin());

    raise notice '[완료] Storage 정책이 적용되었습니다.';
  exception when others then
    raise notice '[건너뜀] Storage 정책 적용 실패: % — 아래 수동 방법을 따라 주세요.', sqlerrm;
  end;
end
$storage$;

-- ── [수동 대체 방법] 위에서 "건너뜀" 메시지가 나왔다면 ──────────────
--  1. Supabase 좌측 메뉴 → Storage → New bucket
--       Name: morph-images   /   Public bucket: 켜기   → Save
--  2. Storage → morph-images → Policies → New policy → For full customization
--       ① 이름 mi_read / SELECT / authenticated
--          USING: bucket_id = 'morph-images' and public.is_admin()
--       ② 이름 mi_insert / INSERT / authenticated
--          WITH CHECK: bucket_id = 'morph-images' and public.is_admin()
--                      and (storage.foldername(name))[1] = 'm'
--  3. 저장 후 브리딩 관리에서 개체 사진 업로드가 되는지 확인하세요.
-- ──────────────────────────────────────────────────────────────

-- G) 회원탈퇴 -------------------------------------------------
--    개인정보처리방침과 일치하도록:
--      · 신원정보(이름/닉네임/전화/이메일) 및 개체·페어링·클러치 데이터 → 즉시 삭제
--      · 동의 기록(동의 여부·일시) → 신원정보를 지운 채 5년 보존 (전자상거래법)
--      · 접속 기록(visits) → 이미 개인 식별 불가, 1년 후 자동 정리 대상
create table if not exists public.consent_archive (
  id           bigint generated always as identity primary key,
  user_ref     text,                    -- 원 계정 식별용 해시 (복원 불가)
  agree_terms  boolean,
  agree_privacy boolean,
  agree_age14  boolean,
  agree_third  boolean,
  agree_mkt_email boolean,
  agree_mkt_sms   boolean,
  consent_at   timestamptz,
  withdrawn_at timestamptz default now(),
  purge_after  date                     -- 이 날짜 이후 삭제 가능 (탈퇴 + 5년)
);
alter table public.consent_archive enable row level security;
drop policy if exists ca_admin on public.consent_archive;
create policy ca_admin on public.consent_archive for select to authenticated using (public.is_admin());

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

-- H) 로그인 수단(identity) 조회 ---------------------------------
--    docs/AUTH.md 참고. auth.identities 는 클라이언트가 직접 못 읽으므로
--    "내 것만" 안전하게 돌려주는 RPC 를 둡니다.
--    has_password: 이메일 identity 가 있어도 비밀번호가 없으면 로그인 수단이 아님.
--                  마지막 로그인 수단 판정에 반드시 필요합니다.
create or replace function public.my_identities()
returns jsonb language sql security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',   i.provider,
        'email',      i.identity_data->>'email',
        'created_at', i.created_at
      ) order by i.created_at)
      from auth.identities i where i.user_id = auth.uid()
    ), '[]'::jsonb),
    'has_password', exists(
      select 1 from auth.users u
      where u.id = auth.uid()
        and coalesce(u.encrypted_password, '') <> ''
    )
  );
$$;
grant execute on function public.my_identities() to authenticated;

-- 탈퇴 시 provider 연결 해제 실패분 기록 (나중에 재시도/수동 처리)
create table if not exists public.unlink_pending (
  id         bigint generated always as identity primary key,
  provider   text not null,
  ref        text,                     -- provider 측 사용자 식별자
  reason     text,
  created_at timestamptz default now(),
  resolved   boolean default false
);
alter table public.unlink_pending enable row level security;
drop policy if exists ul_admin on public.unlink_pending;
create policy ul_admin on public.unlink_pending for select to authenticated using (public.is_admin());

create or replace function public.new_share_token()
returns text language sql volatile set search_path = public, extensions as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

create or replace function public.set_animal_share(
  p_id uuid,
  p_public boolean,
  p_note text default null,
  p_breeder boolean default false,
  p_rotate boolean default false,
  p_listed boolean default false,
  p_weight boolean default false
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.animals;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update public.animals
     set is_public      = coalesce(p_public, false),
         is_listed      = coalesce(p_public, false) and coalesce(p_listed, false),
         public_note    = nullif(btrim(coalesce(p_note, '')), ''),
         public_breeder = coalesce(p_breeder, false),
         public_weight  = coalesce(p_public, false) and coalesce(p_weight, false),
         share_token    = case
                            when p_rotate or share_token is null then public.new_share_token()
                            else share_token
                          end
   where id = p_id and user_id = auth.uid()
   returning * into a;
  if not found then raise exception 'not your animal'; end if;
  return jsonb_build_object('ok', true, 'token', a.share_token,
    'is_public', a.is_public, 'is_listed', a.is_listed, 'public_weight', a.public_weight);
end $$;
revoke all on function public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean,boolean) from public;
grant execute on function public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.care_animal_hatch_date_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.hatch_date is not null and new.hatch_date > current_date then
    raise exception 'hatch_date cannot be in the future';
  end if;
  return new;
end $$;
revoke all on function public.care_animal_hatch_date_guard() from public, anon, authenticated;
drop trigger if exists care_animal_hatch_date_guard on public.animals;
create trigger care_animal_hatch_date_guard
  before insert or update of hatch_date on public.animals
  for each row execute function public.care_animal_hatch_date_guard();

create or replace function public.care_animal_parent_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.parent_a is not null and new.parent_a = new.parent_b then
    raise exception 'CARE_PARENT_DUPLICATE';
  end if;
  if new.parent_a = new.id or new.parent_b = new.id then
    raise exception 'CARE_PARENT_SELF';
  end if;
  if new.parent_a is not null and not exists (
    select 1 from public.animals p
     where p.id = new.parent_a and p.sex = 'male' and p.life_stage = 'adult'
       and (case when p.species = 'leopard' then 'gecko' else p.species end)
           = (case when new.species = 'leopard' then 'gecko' else new.species end)
       and p.user_id is not distinct from new.user_id
       and (new.user_id is not null or p.device = new.device)
  ) then
    raise exception 'CARE_SIRE_INVALID';
  end if;
  if new.parent_b is not null and not exists (
    select 1 from public.animals p
     where p.id = new.parent_b and p.sex = 'female' and p.life_stage = 'adult'
       and (case when p.species = 'leopard' then 'gecko' else p.species end)
           = (case when new.species = 'leopard' then 'gecko' else new.species end)
       and p.user_id is not distinct from new.user_id
       and (new.user_id is not null or p.device = new.device)
  ) then
    raise exception 'CARE_DAM_INVALID';
  end if;
  return new;
end $$;
revoke all on function public.care_animal_parent_guard() from public, anon, authenticated;
drop trigger if exists care_animal_parent_guard on public.animals;
create trigger care_animal_parent_guard
  before insert or update of parent_a, parent_b, user_id, device, species on public.animals
  for each row execute function public.care_animal_parent_guard();

create or replace function public.care_pairing_parent_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
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
  return new;
end $$;
revoke all on function public.care_pairing_parent_guard() from public, anon, authenticated;
drop trigger if exists care_pairing_parent_guard on public.pairings;
create trigger care_pairing_parent_guard
  before insert or update of male, female, user_id, device, species on public.pairings
  for each row execute function public.care_pairing_parent_guard();

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

create or replace function public.public_animal(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.animals;
        nick text;
        parent jsonb;
        latest_weight jsonb;
        weight_history jsonb := '[]'::jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then return null; end if;
  select * into a from public.animals
   where share_token = p_token and is_public = true;
  if not found then return null; end if;

  if a.public_breeder then
    select nullif(btrim(coalesce(p.nickname, '')), '') into nick
      from public.profiles p where p.user_id = a.user_id;
  end if;

  select coalesce(jsonb_object_agg(side, info), '{}'::jsonb) into parent
    from (
      select s.side, jsonb_build_object(
        'name', p.name, 'morphs', p.morphs, 'hets', p.hets,
        'token', case when p.is_public then p.share_token else null end,
        'photo', case when p.is_public then coalesce(p.photo_url, (p.photos)[1]) else null end
      ) as info
      from (values ('a', a.parent_a), ('b', a.parent_b)) as s(side, pid)
      join public.animals p on p.id = s.pid and p.user_id = a.user_id
    ) q;

  if a.public_weight then
    select coalesce(jsonb_agg(jsonb_build_object(
      'grams', w.grams, 'measured_on', w.measured_on
    ) order by w.measured_on, w.measured_at), '[]'::jsonb)
      into weight_history
      from (
        select grams, measured_on, measured_at
          from public.weight_logs
         where animal_id = a.id and user_id = a.user_id
         order by measured_on desc, measured_at desc
         limit 30
      ) w;
    if jsonb_array_length(weight_history) > 0 then
      latest_weight := weight_history -> (jsonb_array_length(weight_history) - 1);
    end if;
  end if;

  return jsonb_build_object(
    'name', a.name, 'species', a.species, 'sex', a.sex,
    'life_stage', a.life_stage, 'hatch_date', a.hatch_date,
    'morphs', coalesce(a.morphs, '{}'), 'hets', coalesce(a.hets, '{}'),
    'photo_url', a.photo_url, 'photos', coalesce(a.photos, '{}'),
    'note', a.public_note, 'breeder', nick,
    'parents', coalesce(parent, '{}'::jsonb), 'clutch', a.clutch_label,
    'latest_weight', latest_weight, 'weight_history', weight_history
  );
end $$;
revoke all on function public.public_animal(text) from public;
grant execute on function public.public_animal(text) to anon, authenticated;

create or replace function public.public_breeder_profile(
  p_token text,
  p_species text default null,
  p_limit integer default 36,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare owner_id uuid;
        nick text;
        total_count integer;
        animal_rows jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then return null; end if;
  select a.user_id, nullif(btrim(coalesce(p.nickname, '')), '')
    into owner_id, nick
    from public.animals a
    join public.profiles p on p.user_id = a.user_id
   where a.share_token = p_token and a.is_public = true and a.public_breeder = true;
  if not found or nick is null then return null; end if;

  select count(*)::integer into total_count
    from public.animals a
   where a.user_id = owner_id and a.is_public = true and a.is_listed = true
     and a.share_token is not null
     and (nullif(btrim(coalesce(p_species, '')), '') is null or a.species = p_species);

  select coalesce(jsonb_agg(item), '[]'::jsonb) into animal_rows from (
    select jsonb_build_object(
      'token', a.share_token, 'name', a.name, 'species', a.species,
      'sex', a.sex, 'life_stage', a.life_stage,
      'morphs', coalesce(a.morphs, '{}'), 'hets', coalesce(a.hets, '{}'),
      'photo', coalesce(a.photo_url, (a.photos)[1])
    ) as item
      from public.animals a
     where a.user_id = owner_id and a.is_public = true and a.is_listed = true
       and a.share_token is not null
       and (nullif(btrim(coalesce(p_species, '')), '') is null or a.species = p_species)
     order by a.created_at desc, a.id
     limit greatest(1, least(coalesce(p_limit, 36), 60))
     offset greatest(0, coalesce(p_offset, 0))
  ) q;

  return jsonb_build_object('breeder', nick, 'total', total_count, 'animals', animal_rows);
end $$;
revoke all on function public.public_breeder_profile(text,text,integer,integer) from public;
grant execute on function public.public_breeder_profile(text,text,integer,integer) to anon, authenticated;

drop function if exists public.public_breeder_animals(text, integer);

create or replace function public.public_animals(
  p_species text default null,
  p_limit integer default 24,
  p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(item), '[]'::jsonb) from (
    select jsonb_build_object(
      'token', a.share_token, 'name', a.name, 'species', a.species,
      'sex', a.sex, 'life_stage', a.life_stage,
      'morphs', coalesce(a.morphs, '{}'), 'hets', coalesce(a.hets, '{}'),
      'photo', coalesce(a.photo_url, (a.photos)[1])
    ) as item
      from public.animals a
     where a.is_public = true and a.is_listed = true and a.share_token is not null
       and (nullif(btrim(coalesce(p_species, '')), '') is null or a.species = p_species)
     order by a.created_at desc, a.id
     limit greatest(1, least(coalesce(p_limit, 24), 60))
     offset greatest(0, coalesce(p_offset, 0))
  ) q;
$$;
revoke all on function public.public_animals(text,integer,integer) from public;
grant execute on function public.public_animals(text,integer,integer) to anon, authenticated;

-- Current public animal card and parent eligibility contract (v34-v38).
create or replace function public.new_share_token()
returns text language sql volatile set search_path = public, extensions as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

create or replace function public.set_animal_share(
  p_id uuid,
  p_public boolean,
  p_note text default null,
  p_breeder boolean default false,
  p_rotate boolean default false,
  p_listed boolean default false,
  p_weight boolean default false
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.animals;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update public.animals
     set is_public      = coalesce(p_public, false),
         is_listed      = coalesce(p_public, false) and coalesce(p_listed, false),
         public_note    = nullif(btrim(coalesce(p_note, '')), ''),
         public_breeder = coalesce(p_breeder, false),
         public_weight  = coalesce(p_public, false) and coalesce(p_weight, false),
         share_token    = case
                            when p_rotate or share_token is null then public.new_share_token()
                            else share_token
                          end
   where id = p_id and user_id = auth.uid()
   returning * into a;
  if not found then raise exception 'not your animal'; end if;
  return jsonb_build_object('ok', true, 'token', a.share_token,
    'is_public', a.is_public, 'is_listed', a.is_listed, 'public_weight', a.public_weight);
end $$;
revoke all on function public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean,boolean) from public;
grant execute on function public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.care_animal_hatch_date_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.hatch_date is not null and new.hatch_date > current_date then
    raise exception 'hatch_date cannot be in the future';
  end if;
  return new;
end $$;
revoke all on function public.care_animal_hatch_date_guard() from public, anon, authenticated;
drop trigger if exists care_animal_hatch_date_guard on public.animals;
create trigger care_animal_hatch_date_guard
  before insert or update of hatch_date on public.animals
  for each row execute function public.care_animal_hatch_date_guard();

create or replace function public.care_animal_parent_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.parent_a is not null and new.parent_a = new.parent_b then
    raise exception 'CARE_PARENT_DUPLICATE';
  end if;
  if new.parent_a = new.id or new.parent_b = new.id then
    raise exception 'CARE_PARENT_SELF';
  end if;
  if new.parent_a is not null and not exists (
    select 1 from public.animals p
     where p.id = new.parent_a and p.sex = 'male' and p.life_stage = 'adult'
       and (case when p.species = 'leopard' then 'gecko' else p.species end)
           = (case when new.species = 'leopard' then 'gecko' else new.species end)
       and p.user_id is not distinct from new.user_id
       and (new.user_id is not null or p.device = new.device)
  ) then
    raise exception 'CARE_SIRE_INVALID';
  end if;
  if new.parent_b is not null and not exists (
    select 1 from public.animals p
     where p.id = new.parent_b and p.sex = 'female' and p.life_stage = 'adult'
       and (case when p.species = 'leopard' then 'gecko' else p.species end)
           = (case when new.species = 'leopard' then 'gecko' else new.species end)
       and p.user_id is not distinct from new.user_id
       and (new.user_id is not null or p.device = new.device)
  ) then
    raise exception 'CARE_DAM_INVALID';
  end if;
  return new;
end $$;
revoke all on function public.care_animal_parent_guard() from public, anon, authenticated;
drop trigger if exists care_animal_parent_guard on public.animals;
create trigger care_animal_parent_guard
  before insert or update of parent_a, parent_b, user_id, device, species on public.animals
  for each row execute function public.care_animal_parent_guard();

create or replace function public.care_pairing_parent_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
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
  return new;
end $$;
revoke all on function public.care_pairing_parent_guard() from public, anon, authenticated;
drop trigger if exists care_pairing_parent_guard on public.pairings;
create trigger care_pairing_parent_guard
  before insert or update of male, female, user_id, device, species on public.pairings
  for each row execute function public.care_pairing_parent_guard();

alter table public.animals
  add column if not exists photos text[];
update public.animals
   set photos = '{}'
 where photos is null;
alter table public.animals
  alter column photos set default '{}',
  alter column photos set not null;

alter table public.animals
  drop constraint if exists animals_photos_shape_ck;
alter table public.animals
  add constraint animals_photos_shape_ck
  check (
    cardinality(photos) <= 3
    and array_position(photos, null) is null
  );

create or replace function public.care_animal_photos_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  photo_ref text;
  object_path text;
  total_count int;
  unique_count int;
begin
  new.photo_url := nullif(btrim(coalesce(new.photo_url, '')), '');
  new.photos := coalesce(new.photos, '{}');

  if cardinality(new.photos) > 3 then
    raise exception 'additional photos are limited to three';
  end if;

  select count(*), count(distinct value)
    into total_count, unique_count
    from unnest(new.photos) as value;

  if total_count <> unique_count
     or exists (select 1 from unnest(new.photos) value where btrim(value) = '') then
    raise exception 'photo references must be non-empty and unique';
  end if;

  if new.photo_url is not null and new.photo_url = any(new.photos) then
    raise exception 'profile photo cannot be duplicated in additional photos';
  end if;

  foreach photo_ref in array array_cat(
    case when new.photo_url is null then '{}'::text[] else array[new.photo_url] end,
    new.photos
  )
  loop
    if position('/animal-photos/' in photo_ref) > 0 then
      object_path := split_part(split_part(photo_ref, '/animal-photos/', 2), '?', 1);
      if new.user_id is null
         or not starts_with(object_path, 'a/u_' || new.user_id::text || '_') then
        raise exception 'animal photo does not belong to this account';
      end if;
    elsif photo_ref !~ '^https?://' and not starts_with(photo_ref, '/') then
      raise exception 'unsupported animal photo reference';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.care_animal_photos_guard() from public, anon, authenticated;
drop trigger if exists care_animal_photos_guard on public.animals;
create trigger care_animal_photos_guard
  before insert or update
  on public.animals
  for each row execute function public.care_animal_photos_guard();

do $animal_photo_bucket$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'animal-photos',
    'animal-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $animal_photo_bucket$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.care_is_public_animal_photo(
  p_object_name text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_object_name, '') <> ''
    and coalesce(p_owner_id, '') <> ''
    and exists (
      select 1
        from public.animals a
       where a.is_public = true
         and a.user_id::text = p_owner_id
         and (
           split_part(split_part(coalesce(a.photo_url, ''), '/animal-photos/', 2), '?', 1)
             = p_object_name
           or exists (
             select 1
               from unnest(coalesce(a.photos, '{}'::text[])) as photo_ref
              where split_part(split_part(photo_ref, '/animal-photos/', 2), '?', 1)
                    = p_object_name
           )
         )
    )
$$;

revoke all on function private.care_is_public_animal_photo(text,text) from public;
grant execute on function private.care_is_public_animal_photo(text,text) to anon, authenticated;

do $animal_photo_policies$
begin
  drop policy if exists ap_read on storage.objects;
  create policy ap_read on storage.objects
    for select to anon, authenticated
    using (
      bucket_id = 'animal-photos'
      and (
        owner_id = (select auth.uid()::text)
        or private.care_is_public_animal_photo(
          storage.objects.name,
          storage.objects.owner_id
        )
      )
    );

  drop policy if exists ap_insert on storage.objects;
  create policy ap_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'animal-photos'
      and starts_with(name, 'a/u_' || (select auth.uid())::text || '_')
    );

  drop policy if exists ap_update on storage.objects;
  create policy ap_update on storage.objects
    for update to authenticated
    using (
      bucket_id = 'animal-photos'
      and owner_id = (select auth.uid()::text)
    )
    with check (
      bucket_id = 'animal-photos'
      and owner_id = (select auth.uid()::text)
      and starts_with(name, 'a/u_' || (select auth.uid())::text || '_')
    );

  drop policy if exists ap_delete on storage.objects;
  create policy ap_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'animal-photos'
      and owner_id = (select auth.uid()::text)
    );
end $animal_photo_policies$;

-- ============================================================
--  적용 확인 — 이 파일을 Run 하면 마지막에 아래 표가 나옵니다.
--  모든 줄이 '✅ 있음' 이어야 정상입니다.
-- ============================================================
select 항목, 상태 from (
  values
    ('is_admin() 함수',        case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='is_admin')            then '✅ 있음' else '❌ 없음' end),
    ('admins 테이블',          case when to_regclass('public.admins')          is not null then '✅ 있음' else '❌ 없음' end),
    ('profiles 테이블',        case when to_regclass('public.profiles')        is not null then '✅ 있음' else '❌ 없음' end),
    ('profiles.name 컬럼',     case when exists(select 1 from information_schema.columns
                                    where table_schema='public' and table_name='profiles' and column_name='name')
                                                                               then '✅ 있음' else '❌ 없음' end),
    ('save_consent(이름포함)', case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='save_consent' and p.pronargs=9)
                                                                               then '✅ 있음' else '❌ 없음' end),
    ('my_consent()',           case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='my_consent')          then '✅ 있음' else '❌ 없음' end),
    ('my_identities()',        case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='my_identities')       then '✅ 있음' else '❌ 없음' end),
    ('delete_my_account()',    case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='delete_my_account')   then '✅ 있음' else '❌ 없음' end),
    ('consent_archive 테이블', case when to_regclass('public.consent_archive') is not null then '✅ 있음' else '❌ 없음' end),
    ('unlink_pending 테이블',  case when to_regclass('public.unlink_pending')  is not null then '✅ 있음' else '❌ 없음' end),
    ('morph-images 버킷',      coalesce((select case when exists(select 1 from storage.buckets where id='morph-images')
                                                    then '✅ 있음' else '❌ 없음 (수동 생성 필요)' end), '❔ 확인 불가')),
    ('Storage 업로드 정책',    case when exists(select 1 from pg_policies where schemaname='storage' and policyname='mi_insert')
                                                                               then '✅ 있음' else '❌ 없음 (수동 생성 필요)' end)
) as t(항목, 상태);

-- 확인 순서
--   ① 위 표가 전부 ✅ 인지 확인 (Storage 두 줄만 ❌ 라면 F) 구역의 수동 방법 사용)
--   ② #admin 접속 → [한눈에] 탭이 열리는지 (admins 에 등록된 이메일로 로그인)
--   ③ 계정 화면에 '로그인 수단' 목록과 '회원탈퇴' 가 보이는지
--   ④ 브리딩 관리에서 개체 사진 업로드가 되는지

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

alter table public.clutches
  add column if not exists fertile_count integer not null default 0,
  add column if not exists infertile_count integer not null default 0,
  add column if not exists stopped_count integer not null default 0,
  add column if not exists hatched_count integer not null default 0,
  add column if not exists actual_hatch_date date,
  add column if not exists outcome_closed boolean not null default false;
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
create index if not exists animals_clutch_id_idx on public.animals(clutch_id) where clutch_id is not null;
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
create trigger clutches_00_owner_fill before insert or update on public.clutches
  for each row execute function public.clutches_owner_fill();

create or replace function public.clutches_outcome_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare registered_count integer;
begin
  if new.actual_hatch_date is not null and (new.actual_hatch_date > current_date
     or (new.laid_date is not null and new.actual_hatch_date < new.laid_date)) then
    raise exception 'CARE_CLUTCH_HATCH_DATE_INVALID';
  end if;
  select count(*) into registered_count from public.animals a where a.clutch_id = new.id;
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
    stopped_count, hatched_count, actual_hatch_date, outcome_closed on public.clutches
  for each row execute function public.clutches_outcome_guard();

create or replace function public.care_animal_clutch_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare linked_clutch record; registered_count integer;
begin
  if new.clutch_id is null then return new; end if;
  select c.user_id, c.device, c.species, c.laid_date, c.actual_hatch_date, c.hatched_count,
         p.male, p.female, p.project_id, p.project_step, p.name
    into linked_clutch from public.clutches c join public.pairings p on p.id = c.pairing
   where c.id = new.clutch_id;
  if not found then raise exception 'CARE_CLUTCH_LINK_INVALID'; end if;
  if linked_clutch.user_id is distinct from new.user_id
     or (new.user_id is null and linked_clutch.device is distinct from new.device) then
    raise exception 'CARE_CLUTCH_OWNER_INVALID';
  end if;
  if (case when new.species = 'leopard' then 'gecko' else new.species end)
     is distinct from linked_clutch.species then raise exception 'CARE_CLUTCH_SPECIES_INVALID'; end if;
  if new.parent_a is not null and new.parent_a is distinct from linked_clutch.male then
    raise exception 'CARE_CLUTCH_SIRE_INVALID'; end if;
  if new.parent_b is not null and new.parent_b is distinct from linked_clutch.female then
    raise exception 'CARE_CLUTCH_DAM_INVALID'; end if;
  select count(*) into registered_count from public.animals a
   where a.clutch_id = new.clutch_id and a.id is distinct from new.id;
  if registered_count >= linked_clutch.hatched_count then raise exception 'CARE_CLUTCH_OFFSPRING_LIMIT'; end if;
  new.parent_a := linked_clutch.male;
  new.parent_b := linked_clutch.female;
  new.hatch_date := coalesce(new.hatch_date, linked_clutch.actual_hatch_date);
  if new.hatch_date is null or new.hatch_date < linked_clutch.laid_date or new.hatch_date > current_date then
    raise exception 'CARE_CLUTCH_HATCH_DATE_INVALID'; end if;
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
  on public.animals for each row execute function public.care_animal_clutch_guard();

create or replace function public.save_clutch_v48(p_row jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); clutch_id_value uuid := nullif(p_row->>'id', '')::uuid;
begin
  if current_user_id is null then raise exception 'CARE_CLUTCH_LOGIN_REQUIRED'; end if;
  if clutch_id_value is null then
    insert into public.clutches (user_id, device, pairing, laid_date, temp, expected_hatch, egg_count, note, species)
    values (current_user_id, 'u_' || current_user_id::text, nullif(p_row->>'pairing', '')::uuid,
      nullif(p_row->>'laid_date', '')::date, nullif(p_row->>'temp', '')::numeric,
      nullif(p_row->>'expected_hatch', '')::date, nullif(p_row->>'egg_count', '')::integer,
      nullif(btrim(p_row->>'note'), ''), coalesce(nullif(p_row->>'species', ''), 'gecko'))
    returning id into clutch_id_value;
  else
    update public.clutches set pairing = nullif(p_row->>'pairing', '')::uuid,
      laid_date = nullif(p_row->>'laid_date', '')::date, temp = nullif(p_row->>'temp', '')::numeric,
      expected_hatch = nullif(p_row->>'expected_hatch', '')::date,
      egg_count = nullif(p_row->>'egg_count', '')::integer, note = nullif(btrim(p_row->>'note'), ''),
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
  update public.clutches set fertile_count = coalesce(nullif(p_outcome->>'fertile_count', '')::integer, 0),
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
    from public.animals a where a.user_id = (select auth.uid())
     and a.clutch_id = any(coalesce(p_clutch_ids, '{}'::uuid[]));
$$;
revoke all on function public.my_clutch_offspring(uuid[]) from public, anon;
grant execute on function public.my_clutch_offspring(uuid[]) to authenticated;

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

do $guard$
begin
  if to_regclass('public.access_codes') is null then
    raise exception 'v49 requires the access_codes schema';
  end if;
end
$guard$;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.billing_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name_i18n jsonb not null default '{}'::jsonb
    check (jsonb_typeof(name_i18n) = 'object'),
  description_i18n jsonb not null default '{}'::jsonb
    check (jsonb_typeof(description_i18n) = 'object'),
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.billing_products(id) on delete restrict,
  code text not null unique
    check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  currency text not null default 'KRW'
    check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor >= 0),
  interval_unit text not null default 'one_time'
    check (interval_unit in ('one_time', 'month', 'year')),
  interval_count smallint not null default 1
    check (interval_count between 1 and 24),
  access_days integer
    check (access_days is null or access_days between 1 and 3660),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  price_id uuid not null references public.billing_prices(id) on delete restrict,
  idempotency_key text not null
    check (char_length(idempotency_key) between 8 and 128),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded', 'expired')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  product_code text not null
    check (product_code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  interval_unit text not null
    check (interval_unit in ('one_time', 'month', 'year')),
  interval_count smallint not null check (interval_count between 1 and 24),
  access_days integer check (access_days is null or access_days between 1 and 3660),
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_orders_user_id_idempotency_key_key
    unique (user_id, idempotency_key)
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid not null references public.billing_orders(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  provider_transaction_id text not null
    check (char_length(provider_transaction_id) between 1 and 160),
  status text not null
    check (status in ('captured', 'cancelled', 'partially_refunded', 'refunded', 'failed')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  approved_at timestamptz,
  cancelled_at timestamptz,
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_provider_transaction_key
    unique (provider, provider_transaction_id)
);

create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  payment_id uuid not null references public.billing_payments(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  provider_refund_id text
    check (provider_refund_id is null or char_length(provider_refund_id) <= 160),
  status text not null default 'requested'
    check (status in ('requested', 'succeeded', 'failed', 'cancelled')),
  amount_minor bigint not null check (amount_minor > 0),
  reason_code text check (reason_code is null or char_length(reason_code) <= 80),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_refunds_provider_refund_key
    unique (provider, provider_refund_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  product_id uuid not null references public.billing_products(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  provider_subscription_id text not null
    check (char_length(provider_subscription_id) between 1 and 160),
  status text not null
    check (status in ('pending', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_provider_key
    unique (provider, provider_subscription_id),
  constraint billing_subscriptions_period_ck check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  source_type text not null
    check (source_type in ('premium_code', 'payment', 'subscription', 'admin')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_source_key
    unique (source_type, source_id, entitlement_key),
  constraint user_entitlements_window_ck
    check (ends_at is null or ends_at > starts_at)
);

create table if not exists private.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  event_id text not null check (char_length(event_id) between 1 and 180),
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 1000),
  processing_started_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  created_at timestamptz not null default now(),
  constraint billing_webhook_events_provider_event_key unique (provider, event_id)
);

alter table public.billing_payments
  add column if not exists webhook_event_id uuid;
do $payment_event_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_payments_webhook_event_fkey'
      and conrelid = 'public.billing_payments'::regclass
  ) then
    alter table public.billing_payments
      add constraint billing_payments_webhook_event_fkey
      foreign key (webhook_event_id) references private.billing_webhook_events(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_payments_webhook_event_key'
      and conrelid = 'public.billing_payments'::regclass
  ) then
    alter table public.billing_payments
      add constraint billing_payments_webhook_event_key unique (webhook_event_id);
  end if;
end
$payment_event_constraints$;

create index if not exists billing_prices_product_id_idx
  on public.billing_prices(product_id);
create index if not exists billing_orders_user_created_idx
  on public.billing_orders(user_id, created_at desc);
create index if not exists billing_orders_price_id_idx
  on public.billing_orders(price_id);
create index if not exists billing_orders_pending_idx
  on public.billing_orders(status, expires_at) where status = 'pending';
create index if not exists billing_payments_user_created_idx
  on public.billing_payments(user_id, created_at desc);
create index if not exists billing_payments_order_id_idx
  on public.billing_payments(order_id);
create index if not exists billing_refunds_user_created_idx
  on public.billing_refunds(user_id, created_at desc);
create index if not exists billing_refunds_payment_id_idx
  on public.billing_refunds(payment_id);
create index if not exists billing_subscriptions_user_status_idx
  on public.billing_subscriptions(user_id, status, current_period_end desc);
create index if not exists billing_subscriptions_product_id_idx
  on public.billing_subscriptions(product_id);
create index if not exists user_entitlements_user_active_idx
  on public.user_entitlements(user_id, entitlement_key, ends_at desc)
  where status = 'active' and revoked_at is null;
create index if not exists billing_webhook_events_status_idx
  on private.billing_webhook_events(status, processing_started_at);

alter table public.billing_products enable row level security;
alter table public.billing_prices enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.user_entitlements enable row level security;
alter table private.billing_webhook_events enable row level security;

drop policy if exists billing_products_catalog_select on public.billing_products;
create policy billing_products_catalog_select on public.billing_products
  for select to authenticated using (active = true);
drop policy if exists billing_prices_catalog_select on public.billing_prices;
create policy billing_prices_catalog_select on public.billing_prices
  for select to authenticated using (
    active = true and exists (
      select 1 from public.billing_products product
      where product.id = product_id and product.active = true
    )
  );
drop policy if exists billing_orders_own_select on public.billing_orders;
create policy billing_orders_own_select on public.billing_orders
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists billing_payments_own_select on public.billing_payments;
create policy billing_payments_own_select on public.billing_payments
  for select to authenticated using (
    exists (
      select 1 from public.billing_orders own_order
      where own_order.id = order_id
        and own_order.user_id = (select auth.uid())
    )
  );
drop policy if exists billing_refunds_own_select on public.billing_refunds;
create policy billing_refunds_own_select on public.billing_refunds
  for select to authenticated using (
    exists (
      select 1
      from public.billing_payments own_payment
      join public.billing_orders own_order on own_order.id = own_payment.order_id
      where own_payment.id = payment_id
        and own_order.user_id = (select auth.uid())
    )
  );
drop policy if exists billing_subscriptions_own_select on public.billing_subscriptions;
create policy billing_subscriptions_own_select on public.billing_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_entitlements_own_select on public.user_entitlements;
create policy user_entitlements_own_select on public.user_entitlements
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.billing_products from public, anon, authenticated;
revoke all on public.billing_prices from public, anon, authenticated;
revoke all on public.billing_orders from public, anon, authenticated;
revoke all on public.billing_payments from public, anon, authenticated;
revoke all on public.billing_refunds from public, anon, authenticated;
revoke all on public.billing_subscriptions from public, anon, authenticated;
revoke all on public.user_entitlements from public, anon, authenticated;
revoke all on private.billing_webhook_events from public, anon, authenticated;

grant select on public.billing_products to authenticated;
grant select on public.billing_prices to authenticated;
grant select on public.billing_orders to authenticated;
grant select on public.billing_payments to authenticated;
grant select on public.billing_refunds to authenticated;
grant select on public.billing_subscriptions to authenticated;
grant select on public.user_entitlements to authenticated;
grant usage on schema private to anon, authenticated, service_role;
grant select, insert, update on private.billing_webhook_events to service_role;

create or replace function private.billing_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.billing_touch_updated_at() from public, anon, authenticated;

do $triggers$
declare table_name text;
begin
  foreach table_name in array array[
    'billing_products', 'billing_prices', 'billing_orders', 'billing_payments',
    'billing_refunds', 'billing_subscriptions', 'user_entitlements'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.billing_touch_updated_at()',
      table_name || '_touch_updated_at', table_name
    );
  end loop;
end
$triggers$;

create or replace function private.create_billing_order(
  p_user_id uuid,
  p_price_code text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  price_row record;
  order_row public.billing_orders;
  recent_count integer;
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then
    raise exception 'BILLING_LOGIN_REQUIRED';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'BILLING_IDEMPOTENCY_KEY_INVALID';
  end if;

  select
    price.id, price.amount_minor, price.currency,
    price.access_days, price.interval_unit, price.interval_count,
    product.entitlement_key, product.code as product_code
    into price_row
    from public.billing_prices price
    join public.billing_products product on product.id = price.product_id
   where price.code = lower(btrim(p_price_code))
     and price.active = true and product.active = true;
  if not found then raise exception 'BILLING_PRICE_NOT_FOUND'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('billing-order:' || p_user_id::text, 0)
  );

  select * into order_row
    from public.billing_orders
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if order_row.price_id <> price_row.id then
      raise exception 'BILLING_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', order_row.id, 'status', order_row.status,
      'amount_minor', order_row.amount_minor, 'currency', order_row.currency,
      'expires_at', order_row.expires_at
    );
  end if;

  select count(*) into recent_count
    from public.billing_orders
   where user_id = p_user_id and created_at > now() - interval '1 hour';
  if recent_count >= 20 then
    raise exception 'BILLING_ORDER_RATE_LIMIT';
  end if;

  insert into public.billing_orders(
    user_id, price_id, idempotency_key, status,
    amount_minor, currency, entitlement_key, product_code,
    access_days, interval_unit, interval_count, expires_at
  ) values (
    p_user_id, price_row.id, p_idempotency_key, 'pending',
    price_row.amount_minor, price_row.currency,
    price_row.entitlement_key, price_row.product_code,
    price_row.access_days, price_row.interval_unit, price_row.interval_count,
    now() + interval '15 minutes'
  )
  on conflict on constraint billing_orders_user_id_idempotency_key_key do nothing
  returning * into order_row;

  if not found then
    select * into order_row from public.billing_orders
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
  end if;
  return jsonb_build_object(
    'id', order_row.id, 'status', order_row.status,
    'amount_minor', order_row.amount_minor, 'currency', order_row.currency,
    'expires_at', order_row.expires_at
  );
end;
$$;

create or replace function public.create_billing_order(
  p_price_code text,
  p_idempotency_key text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_billing_order((select auth.uid()), p_price_code, p_idempotency_key);
$$;

create or replace function private.redeem_code_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code_row public.access_codes;
  owner_key text;
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then
    return 'login_required';
  end if;
  owner_key := 'u_' || p_user_id::text;

  select * into code_row
    from public.access_codes
   where code = btrim(p_code)
   for update;
  if not found then return 'not_found'; end if;
  if code_row.revoked then return 'revoked'; end if;
  if code_row.redeemed_by is not null and code_row.redeemed_by <> owner_key then
    return 'used';
  end if;

  update public.access_codes set
    redeemed_by = owner_key,
    redeemed_at = coalesce(redeemed_at, now()),
    expires_at = coalesce(
      expires_at,
      case when days is null then null else now() + make_interval(days => greatest(days, 1)) end
    )
  where code = code_row.code
  returning * into code_row;
  return 'ok';
end;
$$;

insert into public.user_entitlements(
  user_id, entitlement_key, source_type, source_id, status,
  starts_at, ends_at, revoked_at, metadata
)
select
  auth_user.id, 'premium', 'premium_code', code.code,
  case when code.revoked then 'revoked' else 'active' end,
  case
    when code.expires_at is not null
      and code.expires_at <= coalesce(code.redeemed_at, code.created_at, now())
      then code.expires_at - interval '1 second'
    else coalesce(code.redeemed_at, code.created_at, now())
  end,
  code.expires_at,
  case when code.revoked then now() else null end,
  jsonb_build_object('kind', coalesce(code.kind, 'trial'))
from public.access_codes code
join auth.users auth_user
  on code.redeemed_by = 'u_' || auth_user.id::text
where code.redeemed_by is not null
on conflict on constraint user_entitlements_source_key do update set
  user_id = excluded.user_id,
  status = excluded.status,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  revoked_at = excluded.revoked_at,
  metadata = excluded.metadata,
  updated_at = now();

create or replace function private.sync_access_code_entitlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  entitlement_user_id uuid;
  entitlement_start timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.user_entitlements set
      status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
    where source_type = 'premium_code'
      and source_id = old.code
      and entitlement_key = 'premium';
    return old;
  end if;

  if new.redeemed_by is null
     or new.redeemed_by !~ '^u_[0-9a-fA-F-]{36}$' then
    update public.user_entitlements set
      status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where source_type = 'premium_code'
      and source_id = new.code
      and entitlement_key = 'premium';
    return new;
  end if;

  entitlement_user_id := substring(new.redeemed_by from 3)::uuid;
  if not exists (select 1 from auth.users where id = entitlement_user_id) then
    return new;
  end if;
  entitlement_start := coalesce(new.redeemed_at, new.created_at, now());
  if new.expires_at is not null and new.expires_at <= entitlement_start then
    entitlement_start := new.expires_at - interval '1 second';
  end if;

  insert into public.user_entitlements(
    user_id, entitlement_key, source_type, source_id, status,
    starts_at, ends_at, revoked_at, metadata
  ) values (
    entitlement_user_id, 'premium', 'premium_code', new.code,
    case when new.revoked then 'revoked' else 'active' end,
    entitlement_start, new.expires_at,
    case when new.revoked then now() else null end,
    jsonb_build_object('kind', coalesce(new.kind, 'trial'))
  )
  on conflict on constraint user_entitlements_source_key do update set
    user_id = excluded.user_id,
    status = excluded.status,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    revoked_at = excluded.revoked_at,
    metadata = excluded.metadata,
    updated_at = now();
  return new;
end;
$$;
revoke all on function private.sync_access_code_entitlement() from public, anon, authenticated;
drop trigger if exists access_codes_sync_entitlement on public.access_codes;
drop trigger if exists access_codes_sync_entitlement_write on public.access_codes;
drop trigger if exists access_codes_sync_entitlement_delete on public.access_codes;
create trigger access_codes_sync_entitlement_write
  after insert or update of redeemed_by, redeemed_at, revoked, kind, expires_at
  on public.access_codes
  for each row execute function private.sync_access_code_entitlement();
create trigger access_codes_sync_entitlement_delete
  after delete on public.access_codes
  for each row execute function private.sync_access_code_entitlement();

create or replace function public.redeem_code(p_code text, p_device text)
returns text language sql security invoker set search_path = '' as $$
  select private.redeem_code_for_user((select auth.uid()), p_code);
$$;

create or replace function public.premium_status(p_device text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (
      select jsonb_build_object(
        'active', true,
        'kind', coalesce(
          entitlement.metadata->>'kind',
          case when entitlement.source_type in ('payment', 'subscription') then 'sub' else 'trial' end
        ),
        'expires_at', entitlement.ends_at,
        'source', entitlement.source_type
      )
      from public.user_entitlements entitlement
      where entitlement.user_id = (select auth.uid())
        and entitlement.entitlement_key = 'premium'
        and entitlement.status = 'active'
        and entitlement.revoked_at is null
        and entitlement.starts_at <= now()
        and (entitlement.ends_at is null or entitlement.ends_at > now())
      order by
        (
          coalesce(
            entitlement.metadata->>'kind',
            case when entitlement.source_type in ('payment', 'subscription') then 'sub' else 'trial' end
          ) = 'sub'
        ) desc,
        entitlement.ends_at desc nulls first,
        entitlement.created_at desc
      limit 1
    ),
    jsonb_build_object(
      'active', false, 'kind', null, 'expires_at', null, 'source', null
    )
  );
$$;

create or replace function public.is_premium(p_device text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((public.premium_status(p_device)->>'active')::boolean, false);
$$;

create or replace function private.claim_billing_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload_sha256 text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare event_row private.billing_webhook_events;
begin
  if p_provider is null or p_provider !~ '^[a-z0-9_]{2,32}$'
     or p_event_id is null or char_length(p_event_id) not between 1 and 180
     or p_event_type is null or char_length(p_event_type) not between 1 and 100
     or p_payload_sha256 is null
     or lower(p_payload_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception 'BILLING_WEBHOOK_INVALID';
  end if;

  insert into private.billing_webhook_events(
    provider, event_id, event_type, payload_sha256,
    signature_verified, status, processing_started_at
  ) values (
    p_provider, p_event_id, p_event_type, lower(p_payload_sha256),
    true, 'processing', now()
  )
  on conflict on constraint billing_webhook_events_provider_event_key do nothing
  returning * into event_row;
  if found then
    return true;
  end if;

  select * into event_row
    from private.billing_webhook_events
   where provider = p_provider and event_id = p_event_id
   for update;
  if not found then raise exception 'BILLING_WEBHOOK_CLAIM_FAILED'; end if;

  if event_row.payload_sha256 <> lower(p_payload_sha256)
     or event_row.event_type <> p_event_type then
    raise exception 'BILLING_WEBHOOK_REPLAY_MISMATCH';
  end if;

  if event_row.status = 'processed' then return false; end if;
  if event_row.status = 'processing'
     and event_row.processing_started_at > now() - interval '5 minutes' then
    return false;
  end if;

  update private.billing_webhook_events set
    signature_verified = true,
    status = 'processing',
    attempt_count = attempt_count + 1,
    processing_started_at = now(),
    last_received_at = now(),
    processed_at = null,
    error_code = null
  where id = event_row.id;
  return true;
end;
$$;

create or replace function private.finish_billing_webhook(
  p_provider text,
  p_event_id text,
  p_success boolean,
  p_error_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.billing_webhook_events set
    status = case when p_success then 'processed' else 'failed' end,
    processed_at = case when p_success then now() else null end,
    error_code = case when p_success then null else left(coalesce(p_error_code, 'BILLING_WEBHOOK_FAILED'), 100) end
  where provider = p_provider and event_id = p_event_id;
  if not found then raise exception 'BILLING_WEBHOOK_NOT_FOUND'; end if;
  return true;
end;
$$;

create or replace function private.capture_billing_order(
  p_provider text,
  p_event_id text,
  p_order_id uuid,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_approved_at timestamptz default now()
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  event_row private.billing_webhook_events;
  order_row public.billing_orders;
  payment_row public.billing_payments;
  entitlement_end timestamptz;
begin
  if p_provider is null or p_provider !~ '^[a-z0-9_]{2,32}$'
     or p_provider_transaction_id is null
     or char_length(p_provider_transaction_id) not between 1 and 160
     or p_amount_minor is null or p_amount_minor < 0
     or p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$'
     or p_order_id is null then
    raise exception 'BILLING_CAPTURE_INPUT_INVALID';
  end if;
  select * into event_row
    from private.billing_webhook_events
   where provider = p_provider and event_id = p_event_id
     and signature_verified = true
   for update;
  if not found then raise exception 'BILLING_WEBHOOK_UNVERIFIED'; end if;
  if event_row.status <> 'processing' then
    select * into payment_row
      from public.billing_payments payment
     where payment.webhook_event_id = event_row.id;
    if found
       and payment_row.provider_transaction_id = p_provider_transaction_id
       and payment_row.order_id = p_order_id
       and payment_row.amount_minor = p_amount_minor
       and payment_row.currency = upper(p_currency) then
      return jsonb_build_object('status', 'duplicate', 'payment_id', payment_row.id);
    end if;
    raise exception 'BILLING_WEBHOOK_STATE_INVALID';
  end if;

  select * into order_row
    from public.billing_orders
   where id = p_order_id
   for update;
  if not found then raise exception 'BILLING_ORDER_NOT_FOUND'; end if;
  if order_row.user_id is null then raise exception 'BILLING_ORDER_OWNER_MISSING'; end if;

  select payment.* into payment_row
    from public.billing_payments payment
   where payment.provider = p_provider
     and payment.provider_transaction_id = p_provider_transaction_id;
  if found then
    if payment_row.order_id <> order_row.id
       or payment_row.amount_minor <> p_amount_minor
       or payment_row.currency <> upper(p_currency) then
      raise exception 'BILLING_TRANSACTION_CONFLICT';
    end if;
    perform private.finish_billing_webhook(p_provider, p_event_id, true, null);
    return jsonb_build_object('status', 'duplicate', 'payment_id', payment_row.id);
  end if;

  if order_row.status <> 'pending' then raise exception 'BILLING_ORDER_STATE_INVALID'; end if;
  if order_row.expires_at <= now() then
    update public.billing_orders set status = 'expired' where id = order_row.id;
    perform private.finish_billing_webhook(
      p_provider, p_event_id, false, 'BILLING_ORDER_EXPIRED'
    );
    return jsonb_build_object(
      'status', 'expired', 'error', 'BILLING_ORDER_EXPIRED', 'order_id', order_row.id
    );
  end if;
  if order_row.amount_minor <> p_amount_minor then raise exception 'BILLING_AMOUNT_MISMATCH'; end if;
  if order_row.currency <> upper(p_currency) then raise exception 'BILLING_CURRENCY_MISMATCH'; end if;

  insert into public.billing_payments(
    user_id, order_id, webhook_event_id, provider, provider_transaction_id, status,
    amount_minor, currency, approved_at
  ) values (
    order_row.user_id, order_row.id, event_row.id,
    p_provider, p_provider_transaction_id, 'captured',
    p_amount_minor, upper(p_currency), coalesce(p_approved_at, now())
  )
  on conflict on constraint billing_payments_provider_transaction_key do nothing
  returning * into payment_row;
  if not found then
    raise exception 'BILLING_TRANSACTION_CONFLICT';
  end if;

  update public.billing_orders set
    status = 'paid', paid_at = coalesce(p_approved_at, now())
  where id = order_row.id;

  entitlement_end := case
    when order_row.access_days is not null
      then coalesce(p_approved_at, now()) + make_interval(days => order_row.access_days)
    when order_row.interval_unit = 'month'
      then coalesce(p_approved_at, now()) + (order_row.interval_count || ' months')::interval
    when order_row.interval_unit = 'year'
      then coalesce(p_approved_at, now()) + (order_row.interval_count || ' years')::interval
    else null
  end;

  insert into public.user_entitlements(
    user_id, entitlement_key, source_type, source_id, status,
    starts_at, ends_at, metadata
  ) values (
    order_row.user_id, order_row.entitlement_key, 'payment', payment_row.id::text, 'active',
    coalesce(p_approved_at, now()), entitlement_end,
    jsonb_build_object(
      'kind', 'sub', 'provider', p_provider,
      'order_id', order_row.id, 'product_code', order_row.product_code
    )
  )
  on conflict on constraint user_entitlements_source_key do update set
    status = 'active',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    revoked_at = null,
    metadata = excluded.metadata,
    updated_at = now();

  perform private.finish_billing_webhook(p_provider, p_event_id, true, null);
  return jsonb_build_object(
    'status', 'captured', 'payment_id', payment_row.id,
    'order_id', order_row.id, 'entitlement_key', order_row.entitlement_key,
    'entitlement_ends_at', entitlement_end
  );
end;
$$;

create or replace function public.billing_claim_webhook(
  p_provider text, p_event_id text, p_event_type text, p_payload_sha256 text
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.claim_billing_webhook(p_provider, p_event_id, p_event_type, p_payload_sha256);
$$;

create or replace function public.billing_finish_webhook(
  p_provider text, p_event_id text, p_success boolean, p_error_code text default null
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.finish_billing_webhook(p_provider, p_event_id, p_success, p_error_code);
$$;

create or replace function public.billing_capture_order(
  p_provider text,
  p_event_id text,
  p_order_id uuid,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_approved_at timestamptz default now()
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.capture_billing_order(
    p_provider, p_event_id, p_order_id, p_provider_transaction_id,
    p_amount_minor, p_currency, p_approved_at
  );
$$;

revoke all on function private.create_billing_order(uuid,text,text) from public, anon;
revoke all on function private.redeem_code_for_user(uuid,text) from public, anon;
revoke all on function private.claim_billing_webhook(text,text,text,text) from public, anon, authenticated;
revoke all on function private.finish_billing_webhook(text,text,boolean,text) from public, anon, authenticated;
revoke all on function private.capture_billing_order(text,text,uuid,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function private.create_billing_order(uuid,text,text) to authenticated;
grant execute on function private.redeem_code_for_user(uuid,text) to authenticated;
grant execute on function private.claim_billing_webhook(text,text,text,text) to service_role;
grant execute on function private.finish_billing_webhook(text,text,boolean,text) to service_role;
grant execute on function private.capture_billing_order(text,text,uuid,text,bigint,text,timestamptz) to service_role;

revoke all on function public.create_billing_order(text,text) from public, anon;
revoke all on function public.redeem_code(text,text) from public, anon;
revoke all on function public.premium_status(text) from public, anon;
revoke all on function public.is_premium(text) from public, anon;
revoke all on function public.billing_claim_webhook(text,text,text,text) from public, anon, authenticated;
revoke all on function public.billing_finish_webhook(text,text,boolean,text) from public, anon, authenticated;
revoke all on function public.billing_capture_order(text,text,uuid,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_billing_order(text,text) to authenticated;
grant execute on function public.redeem_code(text,text) to authenticated;
grant execute on function public.premium_status(text) to authenticated;
grant execute on function public.is_premium(text) to authenticated;
grant execute on function public.billing_claim_webhook(text,text,text,text) to service_role;
grant execute on function public.billing_finish_webhook(text,text,boolean,text) to service_role;
grant execute on function public.billing_capture_order(text,text,uuid,text,bigint,text,timestamptz) to service_role;

notify pgrst, 'reload schema';

begin;

do $guard$
begin
  if to_regclass('public.user_entitlements') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.admins') is null then
    raise exception 'v50 requires the v49 schema';
  end if;
end
$guard$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists private.admin_member_actions (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in (
    'restrict', 'restore', 'set_tier', 'delete_prepare', 'delete', 'delete_failed'
  )),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  status text not null default 'success' check (status in ('success', 'failed')),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  created_at timestamptz not null default now()
);
create index if not exists admin_member_actions_target_idx
  on private.admin_member_actions(target_user_id, created_at desc);
create index if not exists admin_member_actions_actor_idx
  on private.admin_member_actions(actor_user_id, created_at desc);
revoke all on table private.admin_member_actions from public, anon, authenticated;

create or replace function public.is_owner_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
      from auth.users u
      join public.admins a on lower(a.email) = lower(u.email)
     where u.id = p_user_id and a.role = 'owner' and u.deleted_at is null
  );
$$;
revoke all on function public.is_owner_user(uuid) from public, anon, authenticated;
grant execute on function public.is_owner_user(uuid) to service_role;

create or replace function private.assert_admin_member_target(
  p_actor uuid,
  p_target uuid
)
returns table(user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_actor = p_target then
    raise exception 'ADMIN_MEMBER_SELF_ACTION_FORBIDDEN' using errcode = '22023';
  end if;
  if exists(
    select 1 from auth.users u
    join public.admins a on lower(a.email) = lower(u.email)
    where u.id = p_target
  ) then
    raise exception 'ADMIN_MEMBER_ADMIN_ACTION_FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text from auth.users u
     where u.id = p_target and u.deleted_at is null;
  if not found then
    raise exception 'ADMIN_MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function private.assert_admin_member_target(uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.assert_admin_member_target(uuid,uuid)
  to service_role;

create or replace function private.admin_list_members(p_actor uuid)
returns table(
  user_id uuid,
  email text,
  name text,
  nickname text,
  phone text,
  providers text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  account_status text,
  tier text,
  premium_until timestamptz,
  premium_source text,
  is_admin boolean,
  admin_role text,
  agree_mkt_email boolean,
  agree_mkt_sms boolean,
  agree_third boolean,
  consent_at timestamptz,
  mkt_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    coalesce(p.email, u.email)::text,
    p.name::text,
    p.nickname::text,
    p.phone::text,
    coalesce((
      select array_agg(distinct i.provider::text order by i.provider::text)
        from auth.identities i where i.user_id = u.id
    ), '{}'::text[]),
    coalesce(p.created_at, u.created_at),
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    case
      when u.deleted_at is not null then 'deleted'
      when u.banned_until is not null and u.banned_until > now() then 'restricted'
      else 'active'
    end::text,
    case when premium.entitlement_key is null then 'general' else 'premium' end::text,
    premium.ends_at,
    premium.source_type::text,
    (admin_row.email is not null),
    admin_row.role::text,
    coalesce(p.agree_mkt_email, false),
    coalesce(p.agree_mkt_sms, false),
    coalesce(p.agree_third, false),
    p.consent_at,
    p.mkt_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.admins admin_row on lower(admin_row.email) = lower(u.email)
  left join lateral (
    select e.entitlement_key, e.ends_at, e.source_type
      from public.user_entitlements e
     where e.user_id = u.id
       and e.entitlement_key = 'premium'
       and e.status = 'active'
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.ends_at is null or e.ends_at > now())
     order by (e.ends_at is null) desc, e.ends_at desc
     limit 1
  ) premium on true
  where u.deleted_at is null
  order by coalesce(p.created_at, u.created_at) desc;
end;
$$;
revoke all on function private.admin_list_members(uuid) from public, anon;
grant execute on function private.admin_list_members(uuid) to authenticated, service_role;

create or replace function public.admin_list_members()
returns table(
  user_id uuid, email text, name text, nickname text, phone text,
  providers text[], created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, banned_until timestamptz, account_status text,
  tier text, premium_until timestamptz, premium_source text,
  is_admin boolean, admin_role text,
  agree_mkt_email boolean, agree_mkt_sms boolean, agree_third boolean,
  consent_at timestamptz, mkt_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from private.admin_list_members((select auth.uid()));
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

create or replace function private.record_admin_member_action(
  p_actor uuid,
  p_target uuid,
  p_action text,
  p_reason text,
  p_status text default 'success',
  p_details jsonb default '{}'::jsonb
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare action_id bigint;
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_action not in ('restrict','restore','set_tier','delete_prepare','delete','delete_failed')
     or p_status not in ('success','failed')
     or char_length(btrim(coalesce(p_reason,''))) not between 2 and 500
     or jsonb_typeof(coalesce(p_details,'{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_details,'{}'::jsonb)::text) > 4096 then
    raise exception 'ADMIN_MEMBER_ACTION_INVALID' using errcode = '22023';
  end if;
  insert into private.admin_member_actions(
    actor_user_id, target_user_id, action, reason, status, details
  ) values (
    p_actor, p_target, p_action, btrim(p_reason), p_status, coalesce(p_details,'{}'::jsonb)
  ) returning id into action_id;
  return action_id;
end;
$$;
revoke all on function private.record_admin_member_action(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function private.record_admin_member_action(uuid,uuid,text,text,text,jsonb)
  to service_role;

create or replace function private.set_admin_member_tier(
  p_actor uuid,
  p_target uuid,
  p_tier text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_row record;
begin
  select * into target_row
    from private.assert_admin_member_target(p_actor, p_target);
  if p_tier not in ('general','premium')
     or char_length(btrim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception 'ADMIN_MEMBER_TIER_INVALID' using errcode = '22023';
  end if;

  if p_tier = 'premium' then
    insert into public.user_entitlements(
      user_id, entitlement_key, source_type, source_id, status,
      starts_at, ends_at, revoked_at, metadata
    ) values (
      p_target, 'premium', 'admin', 'manual:' || p_target::text, 'active',
      now(), null, null, jsonb_build_object('granted_by', p_actor)
    )
    on conflict (source_type, source_id, entitlement_key) do update set
      status = 'active', starts_at = now(), ends_at = null, revoked_at = null,
      metadata = jsonb_build_object('granted_by', p_actor), updated_at = now();
  else
    update public.user_entitlements set
      status = 'revoked', revoked_at = now(), updated_at = now(),
      metadata = metadata || jsonb_build_object('revoked_by', p_actor)
     where user_id = p_target
       and entitlement_key = 'premium'
       and source_type = 'admin'
       and source_id = 'manual:' || p_target::text
       and status = 'active';
  end if;

  perform private.record_admin_member_action(
    p_actor, p_target, 'set_tier', p_reason, 'success', jsonb_build_object('tier', p_tier)
  );
  return jsonb_build_object('ok', true, 'tier', p_tier, 'email', target_row.email);
end;
$$;
revoke all on function private.set_admin_member_tier(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function private.set_admin_member_tier(uuid,uuid,text,text)
  to service_role;

create or replace function private.admin_prepare_member_deletion(
  p_actor uuid,
  p_target uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_row record;
  profile_row public.profiles;
  dev text := 'u_' || p_target::text;
  n_photo integer := 0;
  n_legacy_photo integer := 0;
begin
  select * into target_row
    from private.assert_admin_member_target(p_actor, p_target);
  if char_length(btrim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception 'ADMIN_MEMBER_REASON_INVALID' using errcode = '22023';
  end if;

  select * into profile_row from public.profiles where user_id = p_target;
  if found then
    insert into public.consent_archive(
      user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
      agree_mkt_email, agree_mkt_sms, consent_at, purge_after
    ) values (
      md5(p_target::text || '|reptile-withdrawn'), profile_row.agree_terms,
      profile_row.agree_privacy, profile_row.agree_age14, profile_row.agree_third,
      profile_row.agree_mkt_email, profile_row.agree_mkt_sms,
      profile_row.consent_at, (now() + interval '5 years')::date
    );
  end if;

  delete from storage.objects where bucket_id = 'animal-photos'
    and name like 'a/u\_' || p_target::text || '\_%';
  get diagnostics n_photo = row_count;
  delete from storage.objects where bucket_id = 'morph-images'
    and name like 'a/u\_' || p_target::text || '\_%';
  get diagnostics n_legacy_photo = row_count;
  n_photo := n_photo + n_legacy_photo;


  update public.animals set clutch_id = null, breeding_project_id = null,
    breeding_project_step = null
    where user_id = p_target or device = dev;
  delete from public.mating_events where user_id = p_target;
  delete from public.care_records where user_id = p_target;
  delete from public.care_plans where user_id = p_target;
  delete from public.clutches where user_id = p_target or device = dev;
  delete from public.pairings where user_id = p_target or device = dev;
  delete from public.mating_groups where user_id = p_target;
  delete from public.animals where user_id = p_target or device = dev;
  delete from public.feed_items where user_id = p_target;
  delete from public.breeding_projects where user_id = p_target;
  update public.access_codes set revoked = true where redeemed_by = dev;
  delete from public.profiles where user_id = p_target;

  perform private.record_admin_member_action(
    p_actor, p_target, 'delete_prepare', p_reason, 'success',
    jsonb_build_object('photos_deleted', n_photo)
  );
  return jsonb_build_object(
    'ok', true, 'email', target_row.email, 'photos_deleted', n_photo
  );
end;
$$;
revoke all on function private.admin_prepare_member_deletion(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function private.admin_prepare_member_deletion(uuid,uuid,text)
  to service_role;

create or replace function public.admin_assert_member_target_service(
  p_actor uuid, p_target uuid
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(target_row)
    from private.assert_admin_member_target(p_actor, p_target) target_row;
$$;

create or replace function public.admin_set_member_tier_service(
  p_actor uuid, p_target uuid, p_tier text, p_reason text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_admin_member_tier(p_actor, p_target, p_tier, p_reason);
$$;

create or replace function public.admin_prepare_member_deletion_service(
  p_actor uuid, p_target uuid, p_reason text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_prepare_member_deletion(p_actor, p_target, p_reason);
$$;

create or replace function public.admin_record_member_action_service(
  p_actor uuid, p_target uuid, p_action text, p_reason text,
  p_status text default 'success', p_details jsonb default '{}'::jsonb
)
returns bigint language sql security invoker set search_path = '' as $$
  select private.record_admin_member_action(
    p_actor, p_target, p_action, p_reason, p_status, p_details
  );
$$;

revoke all on function public.admin_assert_member_target_service(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.admin_set_member_tier_service(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_prepare_member_deletion_service(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.admin_record_member_action_service(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_assert_member_target_service(uuid,uuid)
  to service_role;
grant execute on function public.admin_set_member_tier_service(uuid,uuid,text,text)
  to service_role;
grant execute on function public.admin_prepare_member_deletion_service(uuid,uuid,text)
  to service_role;
grant execute on function public.admin_record_member_action_service(uuid,uuid,text,text,text,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;

-- v52: 관리자 수동 프리미엄의 체험판·기간제·무기한 부여 창
begin;

do $guard$
begin
  if to_regclass('public.user_entitlements') is null
     or to_regclass('private.admin_member_actions') is null
     or to_regprocedure('private.assert_admin_member_target(uuid,uuid)') is null then
    raise exception 'v52 requires the v50 member management schema';
  end if;
end
$guard$;

drop function if exists public.admin_set_member_tier_service(uuid,uuid,text,text);
drop function if exists private.set_admin_member_tier(uuid,uuid,text,text);

create or replace function private.set_admin_member_tier(
  p_actor uuid,
  p_target uuid,
  p_tier text,
  p_reason text,
  p_grant_type text,
  p_duration_days integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_row record;
  grant_started timestamptz := now();
  grant_ends timestamptz;
  entitlement_kind text;
  action_details jsonb;
begin
  select * into target_row
    from private.assert_admin_member_target(p_actor, p_target);

  if p_tier not in ('general','premium')
     or char_length(btrim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception 'ADMIN_MEMBER_TIER_INVALID' using errcode = '22023';
  end if;

  if p_tier = 'premium' then
    if p_grant_type not in ('trial','timed','permanent') then
      raise exception 'ADMIN_MEMBER_GRANT_TYPE_INVALID' using errcode = '22023';
    end if;
    if p_grant_type = 'permanent' then
      if p_duration_days is not null then
        raise exception 'ADMIN_MEMBER_DURATION_INVALID' using errcode = '22023';
      end if;
      grant_ends := null;
    else
      if p_duration_days is null or p_duration_days not between 1 and 3650 then
        raise exception 'ADMIN_MEMBER_DURATION_INVALID' using errcode = '22023';
      end if;
      grant_ends := grant_started + make_interval(days => p_duration_days);
    end if;

    entitlement_kind := case when p_grant_type = 'trial' then 'trial' else 'premium' end;
    action_details := jsonb_strip_nulls(jsonb_build_object(
      'tier', p_tier,
      'grant_type', p_grant_type,
      'duration_days', p_duration_days,
      'starts_at', grant_started,
      'ends_at', grant_ends
    ));

    insert into public.user_entitlements(
      user_id, entitlement_key, source_type, source_id, status,
      starts_at, ends_at, revoked_at, metadata
    ) values (
      p_target, 'premium', 'admin', 'manual:' || p_target::text, 'active',
      grant_started, grant_ends, null,
      jsonb_strip_nulls(jsonb_build_object(
        'granted_by', p_actor,
        'kind', entitlement_kind,
        'grant_type', p_grant_type,
        'duration_days', p_duration_days
      ))
    )
    on conflict (source_type, source_id, entitlement_key) do update set
      status = 'active',
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      revoked_at = null,
      metadata = excluded.metadata,
      updated_at = now();
  else
    action_details := jsonb_build_object('tier', p_tier);
    update public.user_entitlements set
      status = 'revoked', revoked_at = now(), updated_at = now(),
      metadata = metadata || jsonb_build_object('revoked_by', p_actor)
     where user_id = p_target
       and entitlement_key = 'premium'
       and source_type = 'admin'
       and source_id = 'manual:' || p_target::text
       and status = 'active';
  end if;

  perform private.record_admin_member_action(
    p_actor, p_target, 'set_tier', p_reason, 'success', action_details
  );
  return action_details || jsonb_build_object('ok', true, 'email', target_row.email);
end;
$$;
revoke all on function private.set_admin_member_tier(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function private.set_admin_member_tier(uuid,uuid,text,text,text,integer)
  to service_role;

create or replace function public.admin_set_member_tier_service(
  p_actor uuid,
  p_target uuid,
  p_tier text,
  p_reason text,
  p_grant_type text,
  p_duration_days integer
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_admin_member_tier(
    p_actor, p_target, p_tier, p_reason, p_grant_type, p_duration_days
  );
$$;
revoke all on function public.admin_set_member_tier_service(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_member_tier_service(uuid,uuid,text,text,text,integer)
  to service_role;

create or replace function private.admin_list_members(p_actor uuid)
returns table(
  user_id uuid,
  email text,
  name text,
  nickname text,
  phone text,
  providers text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  account_status text,
  tier text,
  premium_until timestamptz,
  premium_source text,
  is_admin boolean,
  admin_role text,
  agree_mkt_email boolean,
  agree_mkt_sms boolean,
  agree_third boolean,
  consent_at timestamptz,
  mkt_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    coalesce(p.email, u.email)::text,
    p.name::text,
    p.nickname::text,
    p.phone::text,
    coalesce((
      select array_agg(distinct i.provider::text order by i.provider::text)
        from auth.identities i where i.user_id = u.id
    ), '{}'::text[]),
    coalesce(p.created_at, u.created_at),
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    case
      when u.deleted_at is not null then 'deleted'
      when u.banned_until is not null and u.banned_until > now() then 'restricted'
      else 'active'
    end::text,
    case when premium.entitlement_key is null then 'general' else 'premium' end::text,
    premium.ends_at,
    case
      when premium.source_type = 'admin'
        then ('admin_' || coalesce(premium.metadata->>'grant_type', 'legacy'))::text
      else premium.source_type::text
    end,
    (admin_row.email is not null),
    admin_row.role::text,
    coalesce(p.agree_mkt_email, false),
    coalesce(p.agree_mkt_sms, false),
    coalesce(p.agree_third, false),
    p.consent_at,
    p.mkt_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.admins admin_row on lower(admin_row.email) = lower(u.email)
  left join lateral (
    select e.entitlement_key, e.ends_at, e.source_type, e.metadata
      from public.user_entitlements e
     where e.user_id = u.id
       and e.entitlement_key = 'premium'
       and e.status = 'active'
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.ends_at is null or e.ends_at > now())
     order by (e.ends_at is null) desc, e.ends_at desc
     limit 1
  ) premium on true
  where u.deleted_at is null
  order by coalesce(p.created_at, u.created_at) desc;
end;
$$;
revoke all on function private.admin_list_members(uuid) from public, anon;
grant execute on function private.admin_list_members(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- v51: 폐쇄 베타 신규 가입 차단과 일회성 테스트 계정 허용
begin;

create table if not exists private.auth_user_creation_permits (
  email text primary key,
  purpose text not null default 'closed_beta_test',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint auth_user_creation_permits_email_normalized
    check (email = lower(btrim(email))),
  constraint auth_user_creation_permits_future_expiry
    check (expires_at > created_at)
);

revoke all on table private.auth_user_creation_permits from public, anon, authenticated;
grant select, insert, update, delete on table private.auth_user_creation_permits to service_role;

create or replace function public.block_new_auth_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitted_email text;
begin
  delete from private.auth_user_creation_permits
   where lower(email) = lower(new.email)
     and expires_at > now()
  returning email into permitted_email;

  if permitted_email is not null then
    return new;
  end if;

  raise exception 'signups temporarily disabled'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.block_new_auth_users() from public, anon, authenticated;
grant execute on function public.block_new_auth_users() to supabase_auth_admin;

drop trigger if exists block_new_auth_users on auth.users;
create trigger block_new_auth_users
  before insert on auth.users
  for each row execute function public.block_new_auth_users();

notify pgrst, 'reload schema';
commit;
