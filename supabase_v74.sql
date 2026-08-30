-- =============================================================================
-- v74 · "확인했으나 이상없음" 을 기록으로 남깁니다
-- -----------------------------------------------------------------------------
-- 지금 검수에서 남는 기록은 열람(view·detail)과 조치(hold·delete…) 뿐입니다.
-- 그래서 **봤는데 문제가 없었다** 는 결과가 어디에도 남지 않습니다.
--
-- 이게 왜 문제냐면,
--
--   · 같은 개체를 다른 관리자가 또 열게 됩니다 — 이미 확인이 끝난 줄 모르니까
--   · 나중에 문제가 불거졌을 때 "그때 보고 이상 없다고 판단했다" 를 보일 수
--     없습니다. 열람 기록만 있으면 '보긴 봤다' 까지밖에 안 됩니다
--   · 검수를 얼마나 했는지가 조치 건수로만 세어져, 실제로 한 일보다 적게
--     보입니다
--
-- 그래서 조치 종류에 'clear' 를 더합니다. **개체는 아무것도 바뀌지 않습니다.**
-- 기록만 남습니다.
--
-- 보류 중인 개체에는 쓰지 않습니다 — 그건 '해제(release)' 입니다. 둘을 섞으면
-- 보류가 안 풀린 채로 "이상없음" 기록만 쌓입니다.
--
-- 선행: supabase_v73.sql
-- =============================================================================

do $guard$
begin
  if to_regclass('public.moderation_log') is null then
    raise exception E'supabase_v68.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

-- 1) 기록 종류에 clear 를 더합니다 ----------------------------------------------------
alter table public.moderation_log drop constraint if exists moderation_log_action_ck;
alter table public.moderation_log add constraint moderation_log_action_ck check (action in (
  'view',            -- 목록 훑기 (비공개 포함)
  'detail',          -- 한 건 세부조회 — 데이터까지 봤음
  'clear',           -- 확인했고 이상 없음 — 개체는 그대로
  'hold', 'release', 'delete_photos', 'delete_animal',
  'ai_block', 'ai_unblock', 'expire'
));


-- 2) 이상없음 -------------------------------------------------------------------
/* 개체를 건드리지 않습니다. update 문이 하나도 없는 것이 의도입니다 —
   '아무 일도 하지 않았다' 를 기록하는 함수라서 그렇습니다. */
create or replace function public.admin_clear_animal(p_animal uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.animals;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;

  /* 보류 중이면 풀어 줘야 하는 것이지 '이상없음' 을 적을 자리가 아닙니다.
     여기서 막지 않으면 보류가 걸린 채로 기록만 쌓입니다. */
  if a.held_at is not null then
    raise exception 'HELD_USE_RELEASE' using errcode = '42501',
      hint = '보류 중인 개체입니다. 해제를 쓰세요.';
  end if;

  insert into public.moderation_log (animal_id, owner_id, admin_id, action, reason)
  values (p_animal, a.user_id, auth.uid(), 'clear', p_reason);

  return jsonb_build_object('ok', true, 'action', 'clear');
end $$;

revoke all on function public.admin_clear_animal(uuid, text) from public, anon;
grant execute on function public.admin_clear_animal(uuid, text) to authenticated;

-- 3) 검수 목록이 몇 건을 걸렀는지 --------------------------------------------------
/* 한눈에 탭은 "등록 개체 13" 이라 하는데 검수 목록에는 4건만 나옵니다. 틀린
   것이 아니라 **사진이 없는 개체는 검수할 것이 없어서** 빠진 겁니다
   (admin_photo_queue 의 where 절). 그런데 화면에 그 말이 없으니 숫자가
   어긋나 보이고, 어긋나 보이는 숫자는 "어느 쪽이 맞나" 를 계속 묻게 만듭니다.

   그래서 거른 건수를 함께 돌려줍니다. 목록과 같은 조건으로 셉니다. */
create or replace function public.admin_photo_queue_counts(p_include_private boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'animals',     count(*),
      'with_photos', count(*) filter (where a.photo_url is not null
                                         or coalesce(array_length(a.photos, 1), 0) > 0),
      'visible',     count(*) filter (where (a.photo_url is not null
                                         or coalesce(array_length(a.photos, 1), 0) > 0)
                                        and (p_include_private
                                             or coalesce(a.is_public, false)
                                             or coalesce(a.is_listed, false)
                                             or a.held_at is not null)),
      'held',        count(*) filter (where a.held_at is not null),
      'owners',      count(distinct a.user_id))
      from public.animals a);
end $$;

revoke all on function public.admin_photo_queue_counts(boolean) from public, anon;
grant execute on function public.admin_photo_queue_counts(boolean) to authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, '기록 종류에 clear' as 검사,
       case when pg_get_constraintdef(oid) like '%clear%' then 'OK' else '★ MISSING' end as 판정
  from pg_constraint where conname = 'moderation_log_action_ck'
union all
select 2, '이상없음 함수',
       case when to_regprocedure('public.admin_clear_animal(uuid,text)') is null
            then '★ MISSING' else 'OK' end
union all
select 3, '관리자가 부를 수 있는가',
       case when has_function_privilege('authenticated',
              'public.admin_clear_animal(uuid,text)', 'execute') then 'OK'
            else '★ grant 누락' end
union all
select 4, '거른 건수 함수',
       case when to_regprocedure('public.admin_photo_queue_counts(boolean)') is null
            then '★ MISSING' else 'OK' end
union all
select 5, '개체를 건드리지 않는가',
       case when pg_get_functiondef(to_regprocedure('public.admin_clear_animal(uuid,text)')::oid)
                 like '%update public.animals%' then '★ 개체를 고칩니다' else 'OK' end
order by 순;
