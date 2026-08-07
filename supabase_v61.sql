-- =============================================================================
-- v61 — 이름·닉네임에서 이모지 막기 · 가입 때부터 사업자 갈래
-- -----------------------------------------------------------------------------
-- 1) 이모지
--   닉네임은 공개 화면에 그대로 나갑니다. 그림문자가 섞이면 검색도, 문의 응대도,
--   QR 이미지 글자 폭 계산도 다 어긋납니다. 무엇을 막을지 나열하는 대신 무엇을
--   허용할지 적었습니다 — 이모지는 해마다 늘어서, 막을 것을 세는 쪽은 반드시
--   뒤처집니다.
--
--   허용: 글자(한글·로마자·가나·한자)·숫자·공백과 붙임표 - _ .
--   그래서 ^^ 나 :) 같은 글자 이모티콘도 함께 막힙니다. 이름 자리에 쓰라고
--   만든 칸이니 그게 맞습니다.
--
-- 2) 가입 갈래
--   사업자는 가입할 때부터 상호명과 등록번호를 냅니다. 계정은 바로 만들어지고
--   무료 회원으로 쓸 수 있으며, 관리자가 승인해야 인증 표시와 로고가 붙습니다.
--
--   v60 은 신청에 프리미엄을 요구했습니다. 갓 가입한 사람은 프리미엄이 아니라
--   그대로 두면 가입 화면에서 낸 신청이 그 자리에서 막힙니다. 그 조건을 뗍니다 —
--   신청은 누구나 낼 수 있고, 승인은 어차피 사람이 합니다. 프리미엄이 필요한
--   것은 '인증 표시를 다는 것' 이 아니라 그 위의 기능들입니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v60 다음입니다.
-- =============================================================================

begin;

-- 1) 허용 글자 -----------------------------------------------------------------
/* 붙임표는 대괄호 맨 끝에 둡니다. 가운데 두면 범위 기호로 읽힙니다.
   빈 값은 여기서 판단하지 않습니다 — 비었을 때 무엇을 할지는 부르는 쪽이
   정합니다(닉네임은 새로 짓고, 이름은 그냥 비웁니다). */
create or replace function private.is_plain_name(p_value text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(btrim(coalesce(p_value, '')), '') = ''
      or btrim(p_value) ~ '^[A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣぁ-ゖァ-ヺー一-鿿 ._-]+$';
$$;

-- 2) 닉네임 트리거에 검사 추가 ------------------------------------------------
create or replace function public.profiles_nickname_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cleaned text := nullif(btrim(coalesce(new.nickname, '')), '');
  previous text := nullif(btrim(coalesce(case when tg_op = 'UPDATE' then old.nickname end, '')), '');
  used integer;
  bypass boolean := coalesce(current_setting('app.nickname_bypass', true), '') = '1';
begin
  /* 비면 지어 줍니다. 새로 가입한 경우도, 이미 있던 이름을 지우고 저장한
     경우도 여기로 옵니다.

     지운 경우를 'user' 로 세지 않는 것은 일부러입니다. 지웠다 저장하기를
     반복하면 원하는 이름이 나올 때까지 돌릴 수 있는데, 그건 '직접 바꾸기'
     2회 제한을 우회하는 길이 됩니다. 대신 지은 이름이 마음에 안 들면
     직접 바꾸면 되고, 그건 정상적으로 횟수를 씁니다. */
  if cleaned is null then
    new.nickname := private.generate_nickname();
    insert into public.nickname_changes(user_id, old_value, new_value, kind)
    values (new.user_id, previous, new.nickname, 'auto');
    return new;
  end if;

  /* 그림문자는 여기서 걸러냅니다. 관리자 우회(bypass)도 예외로 두지 않습니다 —
     관리자가 넣어 준 이모지도 공개 화면에서는 똑같이 깨집니다. */
  if not private.is_plain_name(cleaned) then
    raise exception 'NICKNAME_CHARSET' using errcode = '22023';
  end if;

  new.nickname := cleaned;

  if tg_op = 'INSERT' then
    insert into public.nickname_changes(user_id, old_value, new_value, kind)
    values (new.user_id, null, new.nickname, 'auto');
    return new;
  end if;

  if previous is not distinct from cleaned then
    return new;                                  -- 안 바뀌었으면 아무 일도 없습니다
  end if;

  /* 이름이 없던 계정에 처음 붙는 것은 '변경' 이 아닙니다. 아래 5)번 채우기와,
     닉네임이 비어 있던 기존 계정이 여기로 옵니다 — 이것도 횟수를 쓰게 하면
     첫 이름을 받자마자 2번 중 1번을 잃습니다. */
  if previous is null then
    insert into public.nickname_changes(user_id, old_value, new_value, kind)
    values (new.user_id, null, new.nickname, 'auto');
    return new;
  end if;

  if bypass then
    insert into public.nickname_changes(user_id, old_value, new_value, kind)
    values (new.user_id, previous, new.nickname, 'admin');
    return new;
  end if;

  /* 이미 쓰는 이름이면 막습니다. 같은 이름이 둘이면 분양 글에서 누가 누구인지
     알 수 없습니다. */
  if exists (
    select 1 from public.profiles p
     where lower(p.nickname) = lower(cleaned) and p.user_id <> new.user_id
  ) then
    raise exception 'NICKNAME_TAKEN' using errcode = '23505';
  end if;

  select count(*) into used
    from public.nickname_changes c
   where c.user_id = new.user_id
     and c.kind = 'user'
     and c.created_at > coalesce(new.nickname_reset_at, '-infinity'::timestamptz);

  if used >= 2 then
    raise exception 'NICKNAME_CHANGE_LIMIT' using errcode = '42501';
  end if;

  insert into public.nickname_changes(user_id, old_value, new_value, kind)
  values (new.user_id, previous, new.nickname, 'user');
  return new;
end;
$$;

-- 3) 이름에도 같은 검사 --------------------------------------------------------
/* 닉네임 트리거에 얹지 않고 따로 둡니다. 닉네임 트리거는 'nickname 이 바뀔 때'
   만 돕니다. 거기에 이름까지 넣으면, 이름만 고치는 저장에서는 트리거가 아예
   돌지 않아 검사가 새어 나갑니다. */
create or replace function public.profiles_name_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_plain_name(new.name) then
    raise exception 'NAME_CHARSET' using errcode = '22023';
  end if;
  new.name := nullif(btrim(coalesce(new.name, '')), '');
  return new;
end;
$$;

drop trigger if exists profiles_name_guard on public.profiles;
create trigger profiles_name_guard
  before insert or update of name on public.profiles
  for each row execute function public.profiles_name_guard();

-- 4) 이미 들어와 있는 이모지 정리 -------------------------------------------------
/* 지금까지는 막지 않았으니 남아 있을 수 있습니다. 그대로 두면 앞으로 그 회원이
   다른 항목을 고칠 때마다 트리거가 막아 세웁니다 — 본인은 왜 막히는지 모릅니다.

   이름은 허용되지 않는 글자만 지웁니다. 닉네임은 지우고 나면 빈 값이 될 수
   있어서, 그때는 새로 지어 줍니다. */
do $cleanup$
declare r record; fixed text;
begin
  perform set_config('app.nickname_bypass', '1', true);

  for r in select user_id, name from public.profiles
            where name is not null and not private.is_plain_name(name)
  loop
    fixed := nullif(btrim(regexp_replace(r.name, '[^A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣぁ-ゖァ-ヺー一-鿿 ._-]', '', 'g')), '');
    update public.profiles set name = fixed where user_id = r.user_id;
  end loop;

  for r in select user_id, nickname from public.profiles
            where nickname is not null and not private.is_plain_name(nickname)
  loop
    fixed := nullif(btrim(regexp_replace(r.nickname, '[^A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣぁ-ゖァ-ヺー一-鿿 ._-]', '', 'g')), '');
    /* 남은 글자가 없거나 이미 남이 쓰는 이름이면 새로 짓습니다. */
    if fixed is null or exists (
      select 1 from public.profiles p
       where lower(p.nickname) = lower(fixed) and p.user_id <> r.user_id
    ) then
      fixed := private.generate_nickname();
    end if;
    update public.profiles set nickname = fixed where user_id = r.user_id;
  end loop;

  perform set_config('app.nickname_bypass', '0', true);
end $cleanup$;

-- 5) 가입 때부터 사업자 갈래 ------------------------------------------------------
/* v60 은 신청에 프리미엄을 요구했습니다. 이제 가입 화면에서 바로 신청하므로
   그 조건이 맞지 않습니다 — 갓 만든 계정은 프리미엄일 수가 없습니다.

   대신 '승인' 은 그대로 사람이 합니다. 신청을 누구나 낼 수 있게 여는 것과,
   인증 표시가 아무에게나 붙는 것은 다른 이야기입니다. */
create or replace function public.apply_business_verification(
  p_name text, p_number text, p_logo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor  uuid := (select auth.uid());
  name   text := nullif(btrim(coalesce(p_name, '')), '');
  digits text := private.biz_digits(p_number);
  cur    text;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if name is null then
    raise exception 'BIZ_NAME_REQUIRED' using errcode = '22023';
  end if;
  /* 사업자등록번호는 10자리입니다. 자릿수를 안 보면 오타가 그대로 들어와
     관리자가 조회했을 때 없는 번호가 나옵니다. */
  if digits is null or length(digits) <> 10 then
    raise exception 'BIZ_NUMBER_INVALID' using errcode = '22023';
  end if;
  if not private.is_our_logo(p_logo) then
    raise exception 'BIZ_LOGO_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.business_verifications b
     where b.biz_number = digits and b.user_id <> actor and b.status = 'approved'
  ) then
    raise exception 'BIZ_NUMBER_TAKEN' using errcode = '23505';
  end if;

  select b.status into cur from public.business_verifications b where b.user_id = actor;
  /* 이미 승인된 사람이 신청서를 다시 내면 승인이 풀립니다. 상호명이 바뀌면
     다시 확인해야 하니 그게 맞습니다. 로고만 바꿀 때는 set_my_breeder_logo
     를 쓰면 승인이 유지됩니다. */
  insert into public.business_verifications(user_id, status, biz_name, biz_number, logo_url, applied_at)
  values (actor, 'pending', name, digits, nullif(btrim(coalesce(p_logo, '')), ''), now())
  on conflict (user_id) do update
    set status = 'pending', biz_name = excluded.biz_name, biz_number = excluded.biz_number,
        logo_url = excluded.logo_url, note = null,
        applied_at = now(), decided_at = null, decided_by = null;

  return jsonb_build_object('status', 'pending', 'was', cur);
end;
$$;

-- 6) 권한 (서명이 그대로라 다시 부여할 필요는 없지만, 한 번에 읽히도록 남깁니다)
revoke all on function public.apply_business_verification(text,text,text) from public, anon;
grant execute on function public.apply_business_verification(text,text,text) to authenticated;

commit;
