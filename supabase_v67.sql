-- =============================================================================
-- v67 · 동의한 '판' 을 기록합니다
-- -----------------------------------------------------------------------------
-- 무엇이 빠져 있었나
--   v14 가 동의 항목(agree_terms · agree_privacy · agree_ai_train …)과 동의
--   시각(consent_at · mkt_at · ai_at)은 남기고 있습니다. 없는 것은 **어느 문구에**
--   동의했는지입니다.
--
--     지금:  agree_ai_train = true, ai_at = 2026-08-09
--     빠짐:  그때 화면에 떠 있던 약관이 몇 판이었는가
--
--   약관을 한 번이라도 고치면 이 구분이 필요해집니다. 판을 안 남기면
--     · 재동의를 받아야 할 사람을 고를 수 없고,
--     · 분쟁이 났을 때 '이 회원은 이 문구에 동의했다' 를 보일 수 없습니다.
--
--   '추후 방침이 변경될 수 있음' 같은 포괄 조항보다 이쪽이 훨씬 강한 안전망입니다.
--   포괄 조항은 이용 목적을 넓히는 데는 효력이 없고, 지나치면 불공정 조항으로
--   무효가 되어 동의 전체의 신뢰성을 떨어뜨립니다.
--
-- 왜 지금인가
--   가입이 아직 막혀 있습니다. 판 번호 없이 받은 동의가 쌓이기 전에 넣어야
--   합니다. 오픈 뒤에는 '판을 모르는 동의' 를 어떻게 처리할지부터 정해야 합니다.
--
-- 판 번호를 어디에 두는가
--   코드에 상수로 두지 않고 표에 둡니다(consent_versions). 약관을 고칠 때
--   배포 없이 한 줄 넣으면 되고, 언제 어떤 판이 살아 있었는지가 남습니다.
-- =============================================================================

do $guard$
begin
  if to_regclass('public.profiles') is null then
    raise exception E'profiles 표가 없습니다.\nsupabase_v2.sql 을 먼저 실행하세요.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='profiles'
                    and column_name='agree_ai_train') then
    raise exception E'supabase_v14.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

-- 1) 살아 있는 판 -----------------------------------------------------------------
/* 문서마다 따로 셉니다. 약관만 고치고 처리방침은 그대로인 경우가 흔한데,
   하나로 묶어 두면 안 바뀐 문서까지 재동의를 받게 됩니다. */
create table if not exists public.consent_versions (
  doc        text not null,
  version    text not null,
  effective  date not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  primary key (doc, version),
  constraint consent_versions_doc_ck check (doc in ('terms', 'privacy', 'ai_train')),
  constraint consent_versions_note_ck check (note is null or char_length(note) <= 300)
);

alter table public.consent_versions enable row level security;

/* 누구나 읽습니다 — 가입 화면이 로그인 전에 '지금 몇 판인지' 를 알아야 합니다.
   쓰기 정책은 두지 않습니다. 판을 늘리는 것은 SQL 로만 합니다. */
drop policy if exists consent_versions_read on public.consent_versions;
create policy consent_versions_read on public.consent_versions
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.consent_versions from anon, authenticated, service_role;
grant select on public.consent_versions to anon, authenticated;

/* 첫 판. 가입 오픈에 맞춰 문구를 확정한 뒤 effective 를 조정하세요. */
insert into public.consent_versions (doc, version, note) values
  ('terms',    'v1', '가입 오픈 시점 약관'),
  ('privacy',  'v1', '가입 오픈 시점 개인정보처리방침'),
  ('ai_train', 'v1', '개체 사진 AI 학습 — 서비스 내부 예시 이미지 생성 목적')
on conflict (doc, version) do nothing;


-- 2) 회원이 동의한 판 --------------------------------------------------------------
alter table public.profiles
  add column if not exists terms_version    text,
  add column if not exists privacy_version  text,
  add column if not exists ai_train_version text;


-- 3) 지금 살아 있는 판을 돌려주는 창구 -------------------------------------------------
/* 가입 화면이 로그인 전에 부릅니다. 문서마다 effective 가 오늘 이하인 것 중
   가장 최근 것입니다. */
create or replace function public.current_consent_versions()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(doc, version), '{}'::jsonb)
    from (
      select distinct on (doc) doc, version
        from public.consent_versions
       where effective <= current_date
       order by doc, effective desc, created_at desc
    ) t;
$$;

revoke all on function public.current_consent_versions() from public;
grant execute on function public.current_consent_versions() to anon, authenticated;


-- 4) save_consent 가 판을 함께 남기게 ---------------------------------------------
/* v14 의 함수를 갈아끼우지 않고 인자를 더한 새 이름으로 둡니다. 인자를 더하면
   서명이 바뀌어 기존 화면이 PGRST202 로 깨집니다 — 배포와 마이그레이션이 동시에
   맞아떨어져야 하는 상황을 만들지 않습니다.

   판을 안 넘기면 지금 살아 있는 판으로 채웁니다. 화면이 잊어도 기록은 남습니다. */
create or replace function public.save_consent_versioned(
  p_terms boolean, p_privacy boolean, p_age14 boolean,
  p_third boolean default false, p_mkt_email boolean default false, p_mkt_sms boolean default false,
  p_phone text default null, p_nickname text default null, p_name text default null,
  p_ai_train boolean default false, p_versions jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        cur jsonb := public.current_consent_versions();
        v   jsonb := coalesce(p_versions, '{}'::jsonb);
        out jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;

  out := public.save_consent(p_terms, p_privacy, p_age14, p_third,
                             p_mkt_email, p_mkt_sms, p_phone, p_nickname, p_name, p_ai_train);

  perform set_config('app.consent_write', '1', true);
  update public.profiles p
     set terms_version    = case when p_terms    then coalesce(v->>'terms',    cur->>'terms')    else p.terms_version end,
         privacy_version  = case when p_privacy  then coalesce(v->>'privacy',  cur->>'privacy')  else p.privacy_version end,
         /* 동의를 껐으면 판도 지웁니다 — 껐는데 판이 남아 있으면 '동의한 것' 으로
            읽힙니다. */
         ai_train_version = case when p_ai_train then coalesce(v->>'ai_train', cur->>'ai_train') else null end
   where p.user_id = uid;

  return coalesce(out, '{}'::jsonb) || jsonb_build_object('versions', cur);
end $$;

revoke all on function public.save_consent_versioned(
  boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,boolean,jsonb) from public, anon;
grant execute on function public.save_consent_versioned(
  boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,boolean,jsonb) to authenticated;


-- 5) 재동의를 받아야 할 사람 (관리자) ---------------------------------------------------
/* 약관을 고치면 여기서 대상이 나옵니다. 이게 판을 남기는 이유입니다. */
create or replace function public.admin_consent_stale()
returns table (user_id uuid, email text, doc text, agreed_version text, current_version text)
language sql stable security definer set search_path = '' as $$
  with cur as (select * from jsonb_each_text(public.current_consent_versions()))
  select p.user_id, p.email, c.key,
         case c.key when 'terms' then p.terms_version
                    when 'privacy' then p.privacy_version
                    else p.ai_train_version end,
         c.value
    from public.profiles p
    cross join cur c
   where case c.key when 'terms'    then p.agree_terms
                    when 'privacy'  then p.agree_privacy
                    else p.agree_ai_train end
     and coalesce(case c.key when 'terms' then p.terms_version
                             when 'privacy' then p.privacy_version
                             else p.ai_train_version end, '') <> c.value
   order by p.email, c.key;
$$;

revoke all on function public.admin_consent_stale() from public, anon, authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select '살아 있는 판' as 검사, public.current_consent_versions()::text as 값
union all
select '판 없이 동의한 회원',
       count(*)::text || '명'
  from public.profiles
 where (agree_terms and terms_version is null)
    or (agree_privacy and privacy_version is null)
    or (agree_ai_train and ai_train_version is null);

-- 두 번째 줄이 0 이 아니어도 지금은 정상입니다 — v67 이전에 동의한 사람들입니다.
-- 가입을 열기 전에 아래로 한 번 채워 두면 이후로는 깨끗해집니다.
--
--   update public.profiles set
--     terms_version    = case when agree_terms    then 'v1' else null end,
--     privacy_version  = case when agree_privacy  then 'v1' else null end,
--     ai_train_version = case when agree_ai_train then 'v1' else null end
--    where terms_version is null;
--
-- ⚠️ 이건 '지금 회원이 사실상 운영자뿐' 이라서 쓸 수 있는 방법입니다. 회원이
--    있는 상태에서 하면 동의하지 않은 문구에 동의한 것으로 만들게 됩니다.
