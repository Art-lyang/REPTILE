/* =============================================================================
   supabase_v14.sql — AI 학습 이용 동의 항목 추가
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v2.sql (profiles, save_consent) 이 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   왜 별도 항목인가
   ---------------------------------------------------------------------------
   회원이 등록한 사진을 인공지능 모델 학습에 쓰는 것은, 계산기를 고치려고
   들여다보는 것과 성격이 다릅니다. 학습이 끝난 모델에서 특정 사진의 영향만
   골라내어 되돌리는 것은 기술적으로 불가능합니다.

   되돌릴 수 없는 처리는 약관 한 줄의 포괄 동의로 받으면 안 됩니다.
   그래서 마케팅 수신 동의와 같은 층위의 별도 체크 항목으로 뺐습니다.

   ---------------------------------------------------------------------------
   기록하는 것
   ---------------------------------------------------------------------------
     agree_ai_train   동의 여부 (기본 false)
     ai_at            최초 동의 일시. 철회하면 비웁니다.

   '언제 동의했는지' 를 남기는 이유 — 나중에 "동의한 적 없다" 는 문의가
   오면 이 값이 유일한 근거입니다. mkt_at 과 같은 방식입니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'profiles 표가 없습니다. supabase_v2.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 칼럼 추가 ────────────────────────────────────────────────────────
   기본값 false 입니다. 이미 가입한 회원(현재 0명)은 동의하지 않은 것으로
   시작합니다. 기본값을 true 로 두면 동의를 받은 적 없는 사람이 동의한
   것으로 잡힙니다. */
alter table public.profiles add column if not exists agree_ai_train boolean default false;
alter table public.profiles add column if not exists ai_at          timestamptz;


/* ── 1-2. 회원이 자발적으로 알려주는 정보 ────────────────────────────────
   전부 선택입니다. 비워 두어도 가입과 이용에 아무 지장이 없습니다.

   왜 이것만 받나 — 개인정보는 '있으면 좋겠다' 로 모으면 안 됩니다. 쓸 데가
   정해진 것만 받습니다.

     keep_species  주로 키우는 종. 계산기 첫 화면을 그 종으로 열어 줍니다.
     experience    사육 경력 구간. 안내 문구의 자세함을 조절합니다.
     region        시·도 단위만. 상세 주소는 받지 않습니다.
     purpose       취미 / 브리더 / 분양샵. 기능 우선순위 판단에 씁니다.
     note          하고 싶은 말. 자유 입력.

   region 을 시·도까지만 받는 것은 의도한 제한입니다. 상세 주소는 이
   서비스가 쓸 데가 없고, 받는 순간 유출 시 피해만 커집니다. */
alter table public.profiles add column if not exists keep_species text[];
alter table public.profiles add column if not exists experience   text;
alter table public.profiles add column if not exists region       text;
alter table public.profiles add column if not exists purpose      text;
alter table public.profiles add column if not exists note         text;


/* ── 2. save_consent 교체 ────────────────────────────────────────────────
   인자를 하나 늘립니다. 기본값 false 를 줘서, 아직 새 화면이 배포되지 않은
   상태에서 예전 화면이 이 인자 없이 불러도 그대로 동작합니다.

   ⚠️ create or replace 는 인자 목록이 바뀌면 통과하지 못합니다(42P13).
      v7 에서 같은 오류를 겪었으므로 먼저 지우고 새로 만듭니다.
      지우면 grant 도 날아가므로 아래에서 다시 답니다. */
drop function if exists public.save_consent(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text);
drop function if exists public.save_consent(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,boolean);

create or replace function public.save_consent(
  p_terms boolean, p_privacy boolean, p_age14 boolean,
  p_third boolean default false, p_mkt_email boolean default false, p_mkt_sms boolean default false,
  p_phone text default null, p_nickname text default null, p_name text default null,
  p_ai_train boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        em  text := coalesce(auth.jwt()->>'email','');
begin
  if uid is null then raise exception 'not signed in'; end if;

  /* 아래 트리거(profiles_guard)가 동의 칼럼 직접 수정을 막습니다.
     이 함수는 정당한 경로이므로 표시를 남겨 통과시킵니다.
     세 번째 인자 true = 이 트랜잭션에서만 유효 (다음 요청으로 새지 않습니다). */
  perform set_config('app.consent_write', '1', true);

  insert into public.profiles as p
    (user_id, email, name, nickname, phone,
     agree_terms, agree_privacy, agree_age14, agree_third,
     agree_mkt_email, agree_mkt_sms, agree_ai_train,
     consent_at, mkt_at, ai_at)
  values
    (uid, em,
     nullif(trim(coalesce(p_name,'')),''),
     nullif(trim(coalesce(p_nickname,'')),''),
     nullif(trim(coalesce(p_phone,'')),''),
     p_terms, p_privacy, p_age14, p_third,
     p_mkt_email, p_mkt_sms, p_ai_train,
     now(),
     case when p_mkt_email or p_mkt_sms then now() end,
     case when p_ai_train then now() end)
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
    agree_ai_train  = excluded.agree_ai_train,
    consent_at      = now(),
    mkt_at          = case when excluded.agree_mkt_email or excluded.agree_mkt_sms
                           then coalesce(p.mkt_at, now()) else null end,
    /* 최초 동의 시각을 유지합니다. 철회하면 비우고, 다시 동의하면 그때가 최초입니다. */
    ai_at           = case when excluded.agree_ai_train
                           then coalesce(p.ai_at, now()) else null end,
    updated_at      = now();

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.save_consent(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,boolean) from public;
grant execute on function public.save_consent(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,boolean) to authenticated;


/* ── 3. 탈퇴 시 동의 보존에 AI 항목 포함 ─────────────────────────────────
   consent_archive 는 '무엇에 동의했었는지' 를 5년 보존합니다. AI 학습
   동의는 분쟁 가능성이 가장 큰 항목이라 빠지면 안 됩니다. */
alter table public.consent_archive add column if not exists agree_ai_train boolean;

create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        dev text;
        p   public.profiles;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;

  select * into p from public.profiles where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, agree_ai_train, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'),
       p.agree_terms, p.agree_privacy, p.agree_age14, p.agree_third,
       p.agree_mkt_email, p.agree_mkt_sms, p.agree_ai_train, p.consent_at,
       (now() + interval '5 years')::date);
  end if;

  delete from public.clutches where user_id = uid or device = dev;
  delete from public.pairings where user_id = uid or device = dev;
  delete from public.animals  where user_id = uid or device = dev;

  update public.access_codes set revoked = true where redeemed_by = dev;

  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


/* ── 3-2. 본인 프로필 수정 허용 ─────────────────────────────────────────
   선택 정보(키우는 종·경력·지역 등)는 화면에서 profiles 를 직접 고칩니다.
   지금은 v8 이 profiles 를 최고관리자 전용으로 잠가 두어 본인도 못 고칩니다.

   동의 항목은 계속 save_consent 로만 바꿉니다. 그쪽에는 동의 시각을 남기는
   규칙이 들어 있어서, 표를 직접 고치게 두면 그 규칙을 건너뛸 수 있습니다.
   그래서 아래 정책은 '동의 칼럼을 건드리지 않는 수정' 만 허용합니다. */
drop policy if exists profiles_self_read  on public.profiles;
drop policy if exists profiles_self_write on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

create policy profiles_self_write on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* 동의 칼럼을 표에서 직접 바꾸지 못하게 막습니다.
   막지 않으면 화면에서 agree_ai_train 을 true 로 적어 넣을 수 있고,
   그러면 '언제 동의했는지' 기록 없이 동의 상태만 생깁니다. */
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  /* save_consent() 가 세운 표시. 동의 시각까지 함께 기록하는 정당한 경로입니다. */
  if coalesce(current_setting('app.consent_write', true), '') = '1' then
    return new;
  end if;
  if public.is_owner() then return new; end if;
  if new.agree_terms     is distinct from old.agree_terms
     or new.agree_privacy   is distinct from old.agree_privacy
     or new.agree_age14     is distinct from old.agree_age14
     or new.agree_third     is distinct from old.agree_third
     or new.agree_mkt_email is distinct from old.agree_mkt_email
     or new.agree_mkt_sms   is distinct from old.agree_mkt_sms
     or new.agree_ai_train  is distinct from old.agree_ai_train
     or new.consent_at      is distinct from old.consent_at
     or new.mkt_at          is distinct from old.mkt_at
     or new.ai_at           is distinct from old.ai_at
     or new.user_id         is distinct from old.user_id
     or new.email           is distinct from old.email then
    raise exception '동의 항목은 save_consent() 로만 변경할 수 있습니다';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();


/* ── 4. 확인 ─────────────────────────────────────────────────────────── */
select column_name as 칼럼, data_type as 자료형, column_default as 기본값
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name in ('agree_ai_train','ai_at','agree_mkt_email','mkt_at')
 order by column_name;

select count(*) filter (where agree_ai_train) as AI학습_동의,
       count(*) filter (where not coalesce(agree_ai_train,false)) as 미동의,
       count(*) as 전체회원
  from public.profiles;
