-- =============================================================================
-- v72 · 검수 목록에 비공개 개체도 포함할 수 있게
-- -----------------------------------------------------------------------------
-- v70 은 공개된 개체만 목록에 올렸습니다. 비공개는 개체 id 를 알아야 열 수
-- 있었는데, id 를 알려면 누군가 신고를 해야 합니다. 즉 **신고가 오기 전에는
-- 아무것도 확인할 수 없는 구조**였습니다. 그건 검수가 아니라 민원 처리입니다.
--
-- 그래서 목록에 비공개도 담을 수 있게 합니다. 다만 그냥 열지 않습니다.
--
--   · 기본값은 여전히 공개된 것만입니다. 비공개를 보려면 명시적으로 켭니다.
--   · 켜서 불러올 때마다 moderation_log 에 'view' 가 한 줄 남습니다.
--     한 장씩이 아니라 '이 시점에 비공개 목록을 훑었다' 를 남깁니다.
--
-- 왜 한 줄인가
--   한 장마다 남기면 목록을 한 번 열 때 수십 줄이 쌓여, 정작 조치 기록이
--   묻힙니다. 남겨야 할 사실은 '누가 언제 비공개까지 훑었는가' 이지 '어느
--   사진을 스쳤는가' 가 아닙니다. 한 건을 자세히 열면 그건 그대로 따로
--   남습니다(admin_animal_detail).
--
-- 이건 열람 범위를 넓히는 변경입니다. 약관에 그대로 적어야 합니다 —
-- '공개된 것만 본다' 가 아니라 '등록된 이미지를 검수 목적으로 열람한다' 로.
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.admin_photo_queue(boolean,int,int)') is null then
    raise exception E'supabase_v70.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

/* 인자가 하나 늘어 서명이 바뀝니다. 옛 서명을 남겨 두면 화면이 어느 쪽을
   부를지 모호해지므로 지웁니다 — 배포와 마이그레이션 사이 잠깐 옛 화면이
   PGRST202 를 볼 수 있는데, 그 편이 조용히 옛 함수가 도는 것보다 낫습니다. */
drop function if exists public.admin_photo_queue(boolean, int, int);

create or replace function public.admin_photo_queue(
  p_only_held boolean default false,
  p_limit int default 60,
  p_offset int default 0,
  p_include_private boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(t order by t_held desc nulls last, t_created desc), '[]'::jsonb)
    into out
    from (
      select jsonb_build_object(
               'id', a.id, 'name', a.name, 'species', a.species,
               'owner_id', a.user_id, 'owner_email', p.email, 'owner_nickname', p.nickname,
               'photo_url', a.photo_url, 'photos', a.photos,
               'is_public', a.is_public, 'is_listed', a.is_listed,
               'held_at', a.held_at, 'held_category', a.held_category,
               'held_reason', a.held_reason, 'purge_after', a.purge_after,
               'waiting', (a.held_at is not null and a.purge_after is null),
               'created_at', a.created_at) as t,
             a.held_at as t_held, a.created_at as t_created
        from public.animals a
        left join public.profiles p on p.user_id = a.user_id
       where (a.photo_url is not null or coalesce(array_length(a.photos, 1), 0) > 0)
         and (p_include_private
              or coalesce(a.is_public, false) or coalesce(a.is_listed, false)
              or a.held_at is not null)
         and (not p_only_held or a.held_at is not null)
       order by a.held_at desc nulls last, a.created_at desc
       limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
    ) s;

  /* 비공개까지 훑었으면 그 사실을 남깁니다. 한 번에 한 줄입니다. */
  if p_include_private then
    insert into public.moderation_log (animal_id, owner_id, admin_id, action, reason)
    values ('00000000-0000-0000-0000-000000000000', null, auth.uid(), 'view',
            '비공개 포함 검수 목록 열람');
  end if;

  return out;
end $$;

revoke all on function public.admin_photo_queue(boolean, int, int, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_photo_queue(boolean, int, int, boolean)
  to authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, '새 서명' as 검사,
       case when to_regprocedure('public.admin_photo_queue(boolean,int,int,boolean)') is null
            then '★ MISSING' else 'OK' end as 판정
union all
select 2, '옛 서명 정리',
       case when to_regprocedure('public.admin_photo_queue(boolean,int,int)') is null
            then 'OK' else '★ 아직 남아 있습니다' end
union all
select 3, '실행 권한',
       case when has_function_privilege('authenticated',
              to_regprocedure('public.admin_photo_queue(boolean,int,int,boolean)')::oid, 'execute')
        and not has_function_privilege('anon',
              to_regprocedure('public.admin_photo_queue(boolean,int,int,boolean)')::oid, 'execute')
            then 'OK' else '★ 확인 필요' end
order by 순;
