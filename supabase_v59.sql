-- =============================================================================
-- v59 — 닉네임 필수화 · 자동 부여 · 변경 이력
-- -----------------------------------------------------------------------------
-- 왜
--   닉네임이 선택이라 비어 있는 계정이 많고, 그러면 공개 개체에 브리더명이
--   조용히 안 나옵니다. 화면은 '브리더로 표시' 를 켰다고만 알려 주고 왜 안
--   나오는지는 말하지 않습니다. 이름이 없으면 개체를 공개해도 누가 올린
--   것인지 알 수 없어서, 최소한의 신원 표시가 되기도 합니다.
--
-- 왜 트리거인가
--   닉네임이 들어오는 길이 여럿입니다 — save_consent, profiles 직접 수정,
--   앞으로 생길 화면. 각 길목에서 검사하면 하나를 빠뜨리는 순간 빈 닉네임이
--   다시 생깁니다. 표에 트리거를 걸면 어디로 들어와도 같은 규칙을 지납니다.
--
-- 정한 것
--   · 비면 자동으로 지어 줍니다.        예) 행복한 집사 001
--   · 사용자가 지우고 저장해도 자동 생성 — 빈 채로 둘 수 없습니다.
--   · 사용자가 직접 바꾸는 것은 2번까지. 그 뒤에는 문의로 안내합니다.
--   · 관리자가 그 횟수를 초기화할 수 있습니다.
--   · 바뀐 이력은 남깁니다. 관리자는 전부, 일반 이용자는 공개된 브리더의
--     이력만 볼 수 있습니다 — 분양받는 쪽이 '이 사람이 이름을 자주 바꾸는지'
--     를 확인할 수 있어야 합니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v58 다음입니다.
-- =============================================================================

begin;

-- 1) 이름 재료 ----------------------------------------------------------------
-- 무작위로 배정되는 이름이라, 놀리는 느낌이거나 스스로를 낮추는 말은 넣지
-- 않았습니다. 받아 본 사람이 기분 나쁘지 않아야 바꾸지 않고 그냥 씁니다.
create or replace function private.nickname_adjectives()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    '행복한','느긋한','심심한','거북한','반듯한',
    '다정한','상냥한','씩씩한','든든한','정갈한',
    '소박한','성실한','부지런한','조용한','차분한',
    '온화한','너그러운','잔잔한','포근한','정다운',
    '야무진','슬기로운','꼼꼼한','산뜻한','새로운',
    '맑은','고운','푸른','따뜻한','싱그러운'
  ]::text[];
$$;

-- 2) 이름 짓기 ----------------------------------------------------------------
-- 형용사를 무작위로 고르고, 그 형용사에서 비어 있는 가장 작은 번호를 붙입니다.
-- (행복한 집사 001, 행복한 집사 002 …) 형용사마다 번호가 따로 도니 번호가
-- 빨리 커지지 않습니다.
create or replace function private.generate_nickname()
returns text language plpgsql security definer set search_path = '' as $$
declare adjectives text[] := private.nickname_adjectives();
        word text; candidate text; n integer;
begin
  for attempt in 1..40 loop
    word := adjectives[1 + floor(random() * array_length(adjectives, 1))::int];
    select coalesce(max(substring(p.nickname from '([0-9]+)$')::int), 0) + 1
      into n
      from public.profiles p
     where p.nickname like word || ' 집사 %'
       and p.nickname ~ ('^' || word || ' 집사 [0-9]+$');
    candidate := word || ' 집사 ' || lpad(n::text, 3, '0');
    if not exists (select 1 from public.profiles p where lower(p.nickname) = lower(candidate)) then
      return candidate;
    end if;
  end loop;
  /* 40번을 시도해도 겹치면(동시에 여러 명이 가입) 시각을 붙여 확실히 비웁니다.
     보기에 예쁘지는 않지만, 이름이 없어서 저장이 실패하는 것보다 낫습니다. */
  return word || ' 집사 ' || to_char(clock_timestamp(), 'SSMSUS');
end;
$$;

-- 3) 변경 이력 ----------------------------------------------------------------
create table if not exists public.nickname_changes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  old_value  text,
  new_value  text not null,
  kind       text not null check (kind in ('auto', 'user', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists nickname_changes_user_idx
  on public.nickname_changes(user_id, created_at desc);

alter table public.nickname_changes enable row level security;
revoke all on public.nickname_changes from anon, authenticated;

-- 관리자가 횟수를 초기화한 시점. 이 뒤의 'user' 변경만 셉니다.
-- 이력 자체는 지우지 않습니다 — 지우면 왜 초기화했는지도 사라집니다.
alter table public.profiles
  add column if not exists nickname_reset_at timestamptz;

-- 4) 규칙을 지키는 트리거 -------------------------------------------------------
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

drop trigger if exists profiles_nickname_guard on public.profiles;
create trigger profiles_nickname_guard
  before insert or update of nickname on public.profiles
  for each row execute function public.profiles_nickname_guard();

-- 5) 이미 있는 빈 닉네임 채우기 --------------------------------------------------
-- 관리자 계정도 포함합니다. 비어 있으면 브리더명이 안 나오는 것은 똑같습니다.
do $$
declare r record;
begin
  for r in select user_id from public.profiles
            where nullif(btrim(coalesce(nickname, '')), '') is null
  loop
    update public.profiles
       set nickname = private.generate_nickname()
     where user_id = r.user_id;
  end loop;
end $$;

-- 6) 같은 이름이 이미 둘 이상이면 뒤엣것에 새 이름을 줍니다 -------------------------
-- 여기 걸리는 계정은 이미 이름이 있습니다. 우회 표시를 켜지 않으면 트리거가
-- '본인이 바꿨다' 로 세어, 정리당한 쪽이 남은 2번 중 1번을 잃습니다.
do $$
declare r record;
begin
  perform set_config('app.nickname_bypass', '1', true);
  for r in
    select user_id from (
      select user_id,
             row_number() over (partition by lower(nickname) order by created_at, user_id) as seq
        from public.profiles
       where nickname is not null
    ) q where q.seq > 1
  loop
    update public.profiles
       set nickname = private.generate_nickname()
     where user_id = r.user_id;
  end loop;
  perform set_config('app.nickname_bypass', '0', true);
end $$;

create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(nickname));

-- 7) 화면이 물어보는 것들 -------------------------------------------------------
/* definer 입니다. nickname_changes 는 authenticated 에서 회수했으므로(위 85행)
   invoker 로 두면 본인 이력조차 읽지 못해 늘 0 이 나옵니다. 대신 auth.uid()
   로만 좁혀 남의 줄은 세지 않습니다. */
create or replace function public.my_nickname_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nickname', (select p.nickname from public.profiles p where p.user_id = (select auth.uid())),
    'limit', 2,
    'used', (select count(*) from public.nickname_changes c
              where c.user_id = (select auth.uid()) and c.kind = 'user'
                and c.created_at > coalesce(
                      (select p.nickname_reset_at from public.profiles p where p.user_id = (select auth.uid())),
                      '-infinity'::timestamptz))
  );
$$;

/* 계정 화면 전용 저장구. save_consent 를 쓰지 않는 이유가 있습니다 —
   save_consent 는 p_nickname 을 nullif(trim(...),'') 로 걸러 낸 뒤
   coalesce(excluded.nickname, p.nickname) 로 합칩니다. 그래서 '지우고 저장'
   이 '건드리지 않음' 과 구별되지 않고, 늘 옛 이름이 남습니다.
   여기서는 빈 값을 그대로 NULL 로 넣어 트리거가 새로 짓게 합니다. */
create or replace function public.set_my_nickname(p_nickname text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  insert into public.profiles(user_id, nickname)
  values (actor, nullif(trim(coalesce(p_nickname, '')), ''))
  on conflict (user_id) do update set nickname = excluded.nickname;
  return public.my_nickname_status();
end $$;

-- 공개된 브리더의 이력. 개체 공유 토큰이 입구입니다(public_animal 과 같은 방식).
-- user_id 는 돌려주지 않습니다 — 이름과 시각만으로 충분합니다.
create or replace function public.public_nickname_history(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'from', c.old_value, 'to', c.new_value, 'at', c.created_at)
           order by c.created_at desc)
      from public.nickname_changes c
     where c.user_id = (
             select a.user_id from public.animals a
              where a.share_token = p_token and a.is_public = true and a.public_breeder = true
           )
       and c.kind in ('user', 'admin')
  ), '[]'::jsonb);
$$;

/* 회원 카드가 바로 쓸 수 있게 user_id 로 묶어 돌려줍니다 — admin_animal_limits
   와 같은 모양이라 화면에서 다루는 방식이 같습니다.

   개수 제한을 두지 않았습니다. 이 표는 회원당 몇 줄뿐입니다(본인 변경은 2회가
   상한이고 나머지는 자동 부여). 잘라 내면 'used' 집계가 조용히 틀어져서,
   변경 횟수를 다 쓴 회원이 아직 남은 것처럼 보입니다. */
create or replace function public.admin_nickname_changes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce((
    select jsonb_object_agg(t.user_id::text,
             jsonb_build_object('used', t.used, 'items', t.items))
      from (
        select c.user_id,
               count(*) filter (
                 where c.kind = 'user'
                   and c.created_at > coalesce(p.nickname_reset_at, '-infinity'::timestamptz)
               ) as used,
               jsonb_agg(jsonb_build_object(
                 'at', c.created_at, 'from', c.old_value,
                 'to', c.new_value, 'kind', c.kind) order by c.created_at desc) as items
          from public.nickname_changes c
          left join public.profiles p on p.user_id = c.user_id
         group by c.user_id
      ) t), '{}'::jsonb)
  else null end;
$$;

-- 8) 관리자: 변경 횟수 초기화 ----------------------------------------------------
create or replace function public.admin_reset_nickname_changes(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not public.is_owner_user(actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  update public.profiles set nickname_reset_at = now() where user_id = p_target;
  if not found then
    raise exception 'ADMIN_MEMBER_NOT_FOUND' using errcode = '42501';
  end if;
  return jsonb_build_object('reset_at', now());
end;
$$;

-- 9) 관리자: 닉네임 직접 바꾸기 (횟수를 쓰지 않습니다) ------------------------------
create or replace function public.admin_set_nickname(p_target uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cleaned text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  if actor is null or not public.is_owner_user(actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  /* 트리거에게 '이건 관리자 조치' 라고 알립니다. 이 설정은 이 트랜잭션에서만
     삽니다(세 번째 인자 true). */
  perform set_config('app.nickname_bypass', '1', true);
  update public.profiles set nickname = cleaned where user_id = p_target;
  perform set_config('app.nickname_bypass', '0', true);
  if not found then
    raise exception 'ADMIN_MEMBER_NOT_FOUND' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'nickname', (select p.nickname from public.profiles p where p.user_id = p_target));
end;
$$;

revoke all on function public.my_nickname_status()                 from public, anon;
revoke all on function public.set_my_nickname(text)                from public, anon;
revoke all on function public.admin_nickname_changes()      from public, anon;
revoke all on function public.admin_reset_nickname_changes(uuid)   from public, anon;
revoke all on function public.admin_set_nickname(uuid, text)       from public, anon;
grant execute on function public.my_nickname_status()               to authenticated;
grant execute on function public.set_my_nickname(text)              to authenticated;
grant execute on function public.admin_nickname_changes()    to authenticated;
grant execute on function public.admin_reset_nickname_changes(uuid) to authenticated;
grant execute on function public.admin_set_nickname(uuid, text)     to authenticated;
-- 공개 이력은 로그인 없이도 봅니다 — 분양 글을 보는 사람이 확인해야 합니다.
revoke all on function public.public_nickname_history(text) from public;
grant execute on function public.public_nickname_history(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- =============================================================================
-- 확인
--   select nickname, count(*) from public.profiles group by 1 having count(*) > 1;  -- 비어야 정상
--   select count(*) from public.profiles where nickname is null;                    -- 0 이어야 정상
--   select kind, count(*) from public.nickname_changes group by 1;
--
-- 되돌리기
--   drop trigger if exists profiles_nickname_guard on public.profiles;
--   drop index if exists profiles_nickname_unique;
--   지어 준 이름과 이력은 남습니다. 지우고 싶으면 따로 비우세요.
-- =============================================================================
