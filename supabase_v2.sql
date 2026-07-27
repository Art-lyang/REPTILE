-- ============================================================
--  레오파드 모프 계산기 · v2 추가분만 담은 스크립트
--  Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 [Run] 하세요.
--  (여러 번 실행해도 안전합니다)
--
--  ⚠️ supabase_setup.sql 전체를 다시 실행하지 마세요.
--     그 파일에는 처음 설치용 v1 스키마가 함께 들어 있는데,
--     현재 운영 중인 DB 의 redeem_code 등은 그보다 새 버전입니다.
--     전체를 다시 실행하면 새 버전이 옛날 것으로 덮여
--     "로그인해야 코드 사용 가능" 같은 로직이 사라집니다.
--     (실제로 42P13 오류가 난 이유이기도 합니다)
--
--     이 파일은 v1 을 건드리지 않고 새 기능만 추가합니다.
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
    insert into storage.buckets (id, name, public)
      values ('morph-images','morph-images', true)
      on conflict (id) do update set public = true;
  exception when others then
    raise notice '[건너뜀] 버킷 생성 실패: % — Storage 화면에서 직접 만들어 주세요.', sqlerrm;
  end;

  -- 정책 4종
  begin
    drop policy if exists mi_read   on storage.objects;
    drop policy if exists mi_insert on storage.objects;
    drop policy if exists mi_update on storage.objects;
    drop policy if exists mi_delete on storage.objects;

    -- 누구나 읽기 (이미지가 사이트에 표시되어야 하므로)
    create policy mi_read on storage.objects for select
      using (bucket_id = 'morph-images');

    -- 업로드: 관리자는 모프 이미지(m/), 그 외에는 개체 사진(a/) 만
    create policy mi_insert on storage.objects for insert to anon, authenticated
      with check (
        bucket_id = 'morph-images'
        and ( public.is_admin() or name like 'a/%' )
      );

    -- 수정/삭제: 관리자만 (실수로 남의 사진을 지우지 못하게)
    create policy mi_update on storage.objects for update to authenticated
      using      (bucket_id = 'morph-images' and public.is_admin())
      with check (bucket_id = 'morph-images' and public.is_admin());

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
--       ① 이름 mi_read    / SELECT / Target roles 비움  / USING:  bucket_id = 'morph-images'
--       ② 이름 mi_insert  / INSERT / anon, authenticated
--          WITH CHECK:  bucket_id = 'morph-images' and ( public.is_admin() or name like 'a/%' )
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
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        dev text;
        p   public.profiles;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;

  -- 1) 동의 기록을 익명화해 보존 (법정 5년)
  select * into p from public.profiles where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'),       -- 되돌릴 수 없는 해시 (내장 md5)
       p.agree_terms, p.agree_privacy, p.agree_age14, p.agree_third,
       p.agree_mkt_email, p.agree_mkt_sms, p.consent_at,
       (now() + interval '5 years')::date);
  end if;

  -- 2) 사용자 데이터 삭제
  delete from public.clutches where device = dev;
  delete from public.pairings where device = dev;
  delete from public.animals  where device = dev;

  -- 3) 프리미엄 코드 연결 해제 (코드 자체는 재사용 불가로 남김)
  update public.access_codes set revoked = true where redeemed_by = dev;

  -- 4) 프로필(신원정보) 삭제
  delete from public.profiles where user_id = uid;

  -- 5) 인증 계정 삭제
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.delete_my_account() to authenticated;

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
    ('morph-images 버킷',      case when exists(select 1 from storage.buckets where id='morph-images')
                                                                               then '✅ 있음' else '❌ 없음 (수동 생성 필요)' end),
    ('Storage 업로드 정책',    case when exists(select 1 from pg_policies where schemaname='storage' and policyname='mi_insert')
                                                                               then '✅ 있음' else '❌ 없음 (수동 생성 필요)' end)
) as t(항목, 상태);

-- 확인 순서
--   ① 위 표가 전부 ✅ 인지 확인 (Storage 두 줄만 ❌ 라면 F) 구역의 수동 방법 사용)
--   ② #admin 접속 → [한눈에] 탭이 열리는지 (admins 에 등록된 이메일로 로그인)
--   ③ 계정 화면에 '로그인 수단' 목록과 '회원탈퇴' 가 보이는지
--   ④ 브리딩 관리에서 개체 사진 업로드가 되는지
