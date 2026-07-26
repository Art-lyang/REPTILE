-- ============================================================
--  레오파드 모프 계산기 · Supabase 스키마
--  Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 [Run] 하세요.
--  (여러 번 실행해도 안전하도록 작성됨)
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
  photo_url text, note text,
  created_at timestamptz default now()
);
create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  device text not null,
  name text, male uuid, female uuid, note text,
  created_at timestamptz default now()
);
create table if not exists public.clutches (
  id uuid primary key default gen_random_uuid(),
  device text not null,
  pairing uuid, laid_date date, temp numeric,
  expected_hatch date, egg_count int, note text,
  created_at timestamptz default now()
);

-- ---------- Row Level Security ----------
alter table public.morphs        enable row level security;
alter table public.combos        enable row level security;
alter table public.visits        enable row level security;
alter table public.combo_queries enable row level security;
alter table public.access_codes  enable row level security;
alter table public.animals       enable row level security;
alter table public.pairings      enable row level security;
alter table public.clutches      enable row level security;

-- 모프/콤보: 읽기는 누구나, 쓰기는 로그인한 관리자만
drop policy if exists morphs_read  on public.morphs;
drop policy if exists morphs_admin on public.morphs;
create policy morphs_read  on public.morphs for select using (true);
create policy morphs_admin on public.morphs for all to authenticated using (true) with check (true);

drop policy if exists combos_read  on public.combos;
drop policy if exists combos_admin on public.combos;
create policy combos_read  on public.combos for select using (true);
create policy combos_admin on public.combos for all to authenticated using (true) with check (true);

-- 로그: 익명 INSERT 허용, 조회는 관리자만
drop policy if exists visits_insert on public.visits;
drop policy if exists visits_read   on public.visits;
create policy visits_insert on public.visits for insert to anon, authenticated with check (true);
create policy visits_read   on public.visits for select to authenticated using (true);

drop policy if exists cq_insert on public.combo_queries;
drop policy if exists cq_read   on public.combo_queries;
create policy cq_insert on public.combo_queries for insert to anon, authenticated with check (true);
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

grant execute on function public.redeem_code(text, text)  to anon, authenticated;
grant execute on function public.is_premium(text)         to anon, authenticated;
grant execute on function public.premium_status(text)     to anon, authenticated;

-- ---------- 사용자 데이터 RPC (본인 device 것만) ----------
create or replace function public.my_rows(p_device text, p_table text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if p_table not in ('animals','pairings','clutches') then raise exception 'bad table'; end if;
  if coalesce(p_device,'') = '' then return '[]'::jsonb; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb) from public.%I t where t.device = $1', p_table)
    into j using p_device;
  return j;
end $$;

create or replace function public.save_row(p_device text, p_table text, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare newid uuid;
begin
  if p_table not in ('animals','pairings','clutches') then raise exception 'bad table'; end if;
  if coalesce(p_device,'') = '' then raise exception 'no device'; end if;
  p_row := p_row - 'device' || jsonb_build_object('device', p_device);
  if coalesce(p_row->>'id','') = '' then
    p_row := p_row || jsonb_build_object('id', gen_random_uuid()::text);
  else
    execute format('delete from public.%I where id = $1 and device = $2', p_table)
      using (p_row->>'id')::uuid, p_device;
  end if;
  if coalesce(p_row->>'created_at','') = '' then
    p_row := p_row || jsonb_build_object('created_at', now());
  end if;
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) returning id', p_table, p_table)
    into newid using p_row;
  return newid;
end $$;

create or replace function public.delete_row(p_device text, p_table text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_table not in ('animals','pairings','clutches') then raise exception 'bad table'; end if;
  execute format('delete from public.%I where id = $1 and device = $2', p_table) using p_id, p_device;
  return true;
end $$;

-- 로그인 시 기기에 있던 코드/데이터를 계정으로 이관
create or replace function public.claim_device(p_device text, p_user text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_device,'')='' or coalesce(p_user,'')='' then return false; end if;
  update public.access_codes set redeemed_by = p_user where redeemed_by = p_device;
  update public.animals  set device = p_user where device = p_device;
  update public.pairings set device = p_user where device = p_device;
  update public.clutches set device = p_user where device = p_device;
  return true;
end $$;
grant execute on function public.claim_device(text,text)    to anon, authenticated;

grant execute on function public.my_rows(text,text)          to anon, authenticated;
grant execute on function public.save_row(text,text,jsonb)   to anon, authenticated;
grant execute on function public.delete_row(text,text,uuid)  to anon, authenticated;

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
create table if not exists public.admins (
  email      text primary key,
  note       text,
  created_at timestamptz default now()
);
alter table public.admins enable row level security;

-- 본인 이메일을 관리자에 등록 (필요하면 아래에 추가)
insert into public.admins(email, note) values ('kmc612000@gmail.com', 'owner')
  on conflict (email) do nothing;

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
alter table public.profiles add column if not exists name       text;
alter table public.profiles add column if not exists nickname   text;
alter table public.profiles add column if not exists consent_at timestamptz;
alter table public.profiles add column if not exists mkt_at     timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.profiles enable row level security;
-- 조회는 관리자만. 쓰기는 아래 save_consent RPC 로만 (직접 insert/update 불가)
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles for select to authenticated using (public.is_admin());

-- C) 동의 저장 / 조회 RPC --------------------------------------
-- 이전 버전(이름 파라미터 없던 시그니처)이 있으면 제거 → 호출 모호성 방지
drop function if exists public.save_consent(boolean,boolean,boolean,boolean,boolean,boolean,text,text);

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

-- D) 검색(계산) 로그를 기기와 연결 — 동의 회원의 이용 기록 분석용
alter table public.combo_queries add column if not exists device text;

-- E) [보안 강화] 관리자 전용 잠금 -------------------------------
--    기존에는 "로그인한 누구나" 모프 수정·코드 발급·로그 열람이 가능했음.
--    일반 회원가입이 열렸으므로 관리자(admins 등록 이메일)만 가능하도록 교체.
drop policy if exists morphs_admin on public.morphs;
create policy morphs_admin on public.morphs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists combos_admin on public.combos;
create policy combos_admin on public.combos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists visits_read on public.visits;
create policy visits_read on public.visits for select to authenticated using (public.is_admin());

drop policy if exists cq_read on public.combo_queries;
create policy cq_read on public.combo_queries for select to authenticated using (public.is_admin());

drop policy if exists codes_admin on public.access_codes;
create policy codes_admin on public.access_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$ declare t text; begin
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format('create policy %I_admin on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- F) Storage(사진 업로드) 정책 --------------------------------
--    증상: 사진 업로드 시 "new row violates row-level security policy"
--    원인: morph-images 버킷에 INSERT 정책이 없어서 업로드가 막힘.
--    (버킷이 없으면 자동 생성 · Public 읽기)
insert into storage.buckets (id, name, public)
  values ('morph-images','morph-images', true)
  on conflict (id) do update set public = true;

-- 누구나 읽기 (이미지가 사이트에 표시되어야 하므로)
drop policy if exists mi_read on storage.objects;
create policy mi_read on storage.objects for select
  using (bucket_id = 'morph-images');

-- 업로드: 관리자는 모프 이미지(m/), 로그인 회원은 개체 사진(a/)
drop policy if exists mi_insert on storage.objects;
create policy mi_insert on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'morph-images'
    and ( public.is_admin()                                   -- 관리자: 전체 허용
       or (auth.uid() is not null and name like 'a/%')        -- 회원: 개체 사진만
       or name like 'a/%' )                                   -- 비로그인 기기(device) 사용자
  );

-- 수정/삭제: 관리자만 (실수로 남의 사진을 지우지 못하게)
drop policy if exists mi_update on storage.objects;
create policy mi_update on storage.objects for update to authenticated
  using (bucket_id = 'morph-images' and public.is_admin())
  with check (bucket_id = 'morph-images' and public.is_admin());

drop policy if exists mi_delete on storage.objects;
create policy mi_delete on storage.objects for delete to authenticated
  using (bucket_id = 'morph-images' and public.is_admin());

-- 완료. Storage 버킷은 위 F) 에서 자동 생성됩니다.
-- v2 적용 후 확인: ① Supabase SQL Editor에서 이 파일 전체 Run
--                ② #admin 접속 → 회원 탭이 열리는지 확인 (admins에 등록된 이메일로 로그인)
--                ③ 브리딩 관리에서 개체 사진 업로드가 되는지 확인
