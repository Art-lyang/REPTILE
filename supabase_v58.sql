-- =============================================================================
-- v58 — 회원별 개체 상한 조정 (관리자, 최대 100)
-- -----------------------------------------------------------------------------
-- 왜
--   지금 상한은 무료 10 / 유료 50 두 값뿐입니다(v54·v55). 그런데 50마리를
--   넘기는 브리더가 나올 수 있고, 그때마다 care_premium_limit() 을 올리면
--   모든 회원의 상한이 같이 올라갑니다. 그 한 사람만 올려 주는 길이 필요합니다.
--
-- 어디까지 열어 두는가
--   100 까지입니다. 그 이상은 사진 용량(무료 요금제 1GB)이 먼저 걸립니다 —
--   개체당 사진 두 장이면 100마리에 70MB 안팎이고, 그런 회원이 열댓 명이면
--   요금제를 올려야 합니다. 무제한으로 두면 그 판단을 할 기회 없이 넘어갑니다.
--
-- 기존 규칙과의 관계
--   비어 있으면(null) 예전 그대로입니다 — 무료 10 / 유료 50.
--   값이 있으면 그 회원에게만 그 값이 적용됩니다. 무료 회원에게도 줄 수
--   있습니다(예: 초기 협력 브리더).
--
--   활성 판정(care_active_animal_ids)도 이 값을 따릅니다. 그래야 상한을 30 으로
--   올려 준 무료 회원이 30마리를 다 쓸 수 있습니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v55 다음입니다.
-- =============================================================================

begin;

-- 1) 회원별 상한 -------------------------------------------------------------
alter table public.profiles
  add column if not exists animal_limit_override integer;

-- 값이 들어갈 때만 범위를 봅니다. 0 이나 음수를 넣으면 그 회원은 아무것도
-- 등록할 수 없게 되는데, 그건 '제한' 이 아니라 '차단' 이라 다른 기능입니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_animal_limit_override_range'
  ) then
    alter table public.profiles
      add constraint profiles_animal_limit_override_range
      check (animal_limit_override is null
             or (animal_limit_override between 1 and 100));
  end if;
end $$;

-- 2) 그 회원에게 실제로 적용되는 상한 -------------------------------------------
create or replace function private.care_effective_limit(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.animal_limit_override from public.profiles p where p.user_id = p_user),
    case when private.care_is_premium(p_user)
         then public.care_premium_limit()
         else public.care_free_limit() end
  );
$$;

-- 3) 활성 개체 목록 — 조정한 상한을 따릅니다 -------------------------------------
-- v54 판은 무료면 무조건 care_free_limit() 이었습니다. 그대로 두면 상한을 30 으로
-- 올려 준 무료 회원이 여전히 10마리만 쓸 수 있습니다.
create or replace function private.care_active_animal_ids(p_user uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case
    when p_user is null then '{}'::uuid[]
    when private.care_is_premium(p_user) then
      (select coalesce(array_agg(a.id), '{}'::uuid[]) from public.animals a where a.user_id = p_user)
    else (
      select coalesce(array_agg(x.id), '{}'::uuid[]) from (
        select a.id
          from public.animals a
         where a.user_id = p_user
         order by a.free_pinned desc, a.created_at asc, a.id asc
         limit private.care_effective_limit(p_user)
      ) x
    )
  end;
$$;

-- 4) 쓰기 검사 — 두 값 대신 조정된 상한 하나를 봅니다 -----------------------------
create or replace function private.assert_care_animal_writable(p_user uuid, p_id uuid, p_is_new boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare used integer; lim integer; premium boolean;
begin
  if p_user is null then return; end if;          -- 비로그인 기기 기록은 예전 방식 그대로

  premium := private.care_is_premium(p_user);
  lim := private.care_effective_limit(p_user);

  if p_is_new then
    select count(*) into used from public.animals a where a.user_id = p_user;
    if used >= lim then
      if premium then
        raise exception 'CARE_PREMIUM_LIMIT_REACHED' using errcode = '42501';
      else
        raise exception 'CARE_FREE_LIMIT_REACHED' using errcode = '42501';
      end if;
    end if;
    return;
  end if;

  /* 유료는 이미 있는 개체를 언제나 고칠 수 있습니다 — 상한을 낮췄더라도
     남의 기록이 잠기면 안 됩니다(v55 와 같은 이유). */
  if premium then return; end if;

  if not (p_id = any(private.care_active_animal_ids(p_user))) then
    raise exception 'CARE_ANIMAL_INACTIVE' using errcode = '42501';
  end if;
end;
$$;

-- 5) 화면에 알려 줄 값 ---------------------------------------------------------
create or replace function public.my_care_quota()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'premium', private.care_is_premium((select auth.uid())),
    'limit',   private.care_effective_limit((select auth.uid())),
    /* 관리자가 따로 올려 준 값인지. 화면에서 '관리자 조정' 이라고 알려 주면
       왜 남들과 다른지 묻지 않아도 됩니다. */
    'custom',  (select p.animal_limit_override is not null
                  from public.profiles p where p.user_id = (select auth.uid())),
    'used',    (select count(*) from public.animals a where a.user_id = (select auth.uid())),
    'active',  to_jsonb(private.care_active_animal_ids((select auth.uid())))
  );
$$;

-- 6) 관리자가 조정하는 창구 -----------------------------------------------------
-- 회원 제한·탈퇴는 Supabase Auth Admin API 를 써야 해서 Worker(서비스 키)를
-- 거치지만, 이건 우리 표의 컬럼 하나를 바꾸는 일이라 그럴 필요가 없습니다.
-- 관리자 화면이 바로 부르고, 권한 확인은 함수 안에서 합니다.
--
-- p_limit 이 null 이면 조정을 지우고 기본값(무료 10 / 유료 50)으로 돌립니다.
create or replace function public.admin_set_animal_limit(p_target uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not public.is_owner_user(actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_limit is not null and (p_limit < 1 or p_limit > 100) then
    raise exception 'ADMIN_LIMIT_OUT_OF_RANGE' using errcode = '22003';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target) then
    raise exception 'ADMIN_MEMBER_NOT_FOUND' using errcode = '42501';
  end if;

  /* 아직 profiles 줄이 없는 회원도 있습니다(동의만 하고 정보를 안 적은 경우). */
  insert into public.profiles(user_id, animal_limit_override)
  values (p_target, p_limit)
  on conflict (user_id) do update set animal_limit_override = excluded.animal_limit_override;

  return jsonb_build_object(
    'override', p_limit,
    'effective', private.care_effective_limit(p_target)
  );
end;
$$;

-- 7) 관리자 화면이 현재 조정값을 읽는 창구 ---------------------------------------
-- admin_list_members 의 반환 모양을 바꾸려면 함수를 지웠다 다시 만들어야 해서,
-- 조정된 회원만 따로 돌려주고 화면에서 합칩니다. 대부분의 회원은 조정이 없어서
-- 이 목록은 짧습니다.
create or replace function public.admin_animal_limits()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(
    (select jsonb_object_agg(p.user_id::text, p.animal_limit_override)
       from public.profiles p
      where p.animal_limit_override is not null), '{}'::jsonb)
  else null end;
$$;

revoke all on function public.admin_set_animal_limit(uuid,integer) from public, anon;
revoke all on function public.admin_animal_limits()                from public, anon;
grant execute on function public.admin_set_animal_limit(uuid,integer) to authenticated;
grant execute on function public.admin_animal_limits()                to authenticated;

notify pgrst, 'reload schema';
commit;

-- =============================================================================
-- 확인
--   select user_id, animal_limit_override from public.profiles
--    where animal_limit_override is not null;
--
-- 되돌리기
--   update public.profiles set animal_limit_override = null;   -- 조정 전부 해제
--   컬럼 자체를 지울 필요는 없습니다. null 이면 아무 일도 하지 않습니다.
-- =============================================================================
