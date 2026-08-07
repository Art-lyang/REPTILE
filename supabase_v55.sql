-- =============================================================================
-- v55 — 유료도 개체 상한을 둡니다 (50마리)
-- -----------------------------------------------------------------------------
-- 왜
--   v54 는 유료를 '무제한' 으로 두었습니다. 그런데 한 계정이 수천 마리를 넣어도
--   막을 방법이 없고, 사진까지 붙으면 저장 비용이 한 사람 때문에 튑니다.
--   실제로 개인 브리더가 50마리를 넘기는 경우는 드물어서, 우선 50 으로 둡니다.
--
-- 무료 한도와 다른 점
--   무료(10) 는 '넘긴 개체를 잠그는' 규칙입니다 — 결제가 끊겨 20마리가 된
--   사람이 생기기 때문입니다.
--   유료(50) 는 '더 못 만드는' 규칙일 뿐, 이미 있는 개체는 건드리지 않습니다.
--   나중에 상한을 낮췄다고 남의 기록이 잠기면 안 됩니다. 그래서 활성 판정
--   (care_active_animal_ids)은 유료면 여전히 전부입니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v54 다음입니다.
-- =============================================================================

begin;

-- 1) 상한 값 -------------------------------------------------------------------
-- 바꿀 일이 생기면 여기 한 곳만 고치면 됩니다.
create or replace function public.care_premium_limit()
returns integer language sql immutable set search_path = '' as $$ select 50 $$;

-- 2) 쓰기 검사에 유료 상한을 더합니다 --------------------------------------------
-- v54 판은 유료면 곧바로 통과시켰습니다. 이제 새로 만드는 경우만 세어 봅니다.
create or replace function private.assert_care_animal_writable(p_user uuid, p_id uuid, p_is_new boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare used integer; lim integer; premium boolean;
begin
  if p_user is null then return; end if;          -- 비로그인 기기 기록은 예전 방식 그대로

  premium := private.care_is_premium(p_user);
  lim := case when premium then public.care_premium_limit() else public.care_free_limit() end;

  if p_is_new then
    select count(*) into used from public.animals a where a.user_id = p_user;
    if used >= lim then
      raise exception '%' using
        errcode = '42501',
        message = case when premium then 'CARE_PREMIUM_LIMIT_REACHED' else 'CARE_FREE_LIMIT_REACHED' end;
    end if;
    return;
  end if;

  /* 고치는 경우. 유료는 이미 있는 개체를 언제나 고칠 수 있습니다 — 상한을
     넘겨 들어와 있더라도(예: 나중에 상한을 낮춘 경우) 잠그지 않습니다. */
  if premium then return; end if;

  if not (p_id = any(private.care_active_animal_ids(p_user))) then
    raise exception 'CARE_ANIMAL_INACTIVE' using errcode = '42501';
  end if;
end;
$$;

-- 3) 화면에 알려 줄 값 ----------------------------------------------------------
-- limit 은 그 사람에게 실제로 적용되는 값입니다(무료 10 / 유료 50).
create or replace function public.my_care_quota()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'premium', private.care_is_premium((select auth.uid())),
    'limit',   case when private.care_is_premium((select auth.uid()))
                    then public.care_premium_limit()
                    else public.care_free_limit() end,
    'used',    (select count(*) from public.animals a where a.user_id = (select auth.uid())),
    'active',  to_jsonb(private.care_active_animal_ids((select auth.uid())))
  );
$$;

notify pgrst, 'reload schema';
commit;

-- =============================================================================
-- 되돌리기
--   유료를 다시 무제한으로 두려면 care_premium_limit() 이 아주 큰 값을 돌려주게
--   바꾸면 됩니다. 함수를 지울 필요는 없습니다.
--     create or replace function public.care_premium_limit()
--     returns integer language sql immutable set search_path = '' as $$ select 1000000 $$;
-- =============================================================================
