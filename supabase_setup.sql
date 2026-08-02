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
  created_at timestamptz default now()
);

alter table public.animals
  add column if not exists user_id uuid,
  add column if not exists species text not null default 'leopard',
  add column if not exists line_trait_scores jsonb not null default '{}'::jsonb;
alter table public.pairings add column if not exists user_id uuid;
alter table public.clutches add column if not exists user_id uuid;

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

  delete from public.clutches where user_id = uid or device = dev;
  delete from public.pairings where user_id = uid or device = dev;
  delete from public.animals where user_id = uid or device = dev;

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

do $animal_photo_policies$
begin
  drop policy if exists ap_read on storage.objects;
  create policy ap_read on storage.objects
    for select to anon, authenticated
    using (
      bucket_id = 'animal-photos'
      and (
        owner_id = (select auth.uid()::text)
        or exists (
          select 1
            from public.animals a
           where a.is_public = true
             and a.user_id::text = storage.objects.owner_id
             and (
               split_part(split_part(a.photo_url, '/animal-photos/', 2), '?', 1)
                 = storage.objects.name
               or exists (
                 select 1
                   from unnest(coalesce(a.photos, '{}')) as photo_ref
                  where split_part(split_part(photo_ref, '/animal-photos/', 2), '?', 1)
                        = storage.objects.name
               )
             )
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
