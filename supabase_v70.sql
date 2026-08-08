-- =============================================================================
-- v70 · 검수 화면이 쓸 조회
-- -----------------------------------------------------------------------------
-- v68 이 조치 함수(보류·해제·삭제)는 만들었는데 **목록을 가져오는 창구**가
-- 없습니다. 관리자가 무엇을 볼지 정할 수가 없으니 화면을 만들 수 없습니다.
--
-- 열람 범위 (plans/ai-training-consent.md 의 결정)
--   공개된 것은 상시, 비공개는 신고·검수 사유가 있을 때. 지금은 신고 기능이
--   없으므로 **공개된 것만 목록에 올립니다.** 비공개까지 훑는 것은 '우리
--   페이지에서 나가는 것을 책임진다' 는 목적을 넘습니다.
--
--   비공개 개체를 봐야 할 일이 생기면 admin_animal_detail 로 한 건씩 열고,
--   그때마다 열람 기록이 남습니다. 목록으로 훑는 것과 한 건씩 사유를 남기고
--   보는 것은 다릅니다.
--
-- 선행: supabase_v68.sql
-- =============================================================================

do $guard$
begin
  if to_regclass('public.moderation_log') is null then
    raise exception E'supabase_v68.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

-- 1) 검수 목록 — 공개된 것만 ---------------------------------------------------------
/* 사진이 있는 공개 개체를 최근순으로. 보류 중인 것도 함께 보여 줍니다 —
   조치한 뒤 회원이 고쳤는지 확인해야 하니까요. */
create or replace function public.admin_photo_queue(
  p_only_held boolean default false, p_limit int default 60, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'name', a.name, 'species', a.species,
             'owner_id', a.user_id, 'owner_email', p.email, 'owner_nickname', p.nickname,
             'photo_url', a.photo_url, 'photos', a.photos,
             'is_public', a.is_public, 'is_listed', a.is_listed,
             'held_at', a.held_at, 'held_category', a.held_category,
             'held_reason', a.held_reason, 'purge_after', a.purge_after,
             /* purge_after 가 비어 있으면 회원이 고쳤고 우리를 기다리는 중입니다. */
             'waiting', (a.held_at is not null and a.purge_after is null),
             'created_at', a.created_at)
           order by a.held_at desc nulls last, a.created_at desc)
      from public.animals a
      left join public.profiles p on p.user_id = a.user_id
     where (a.photo_url is not null or coalesce(array_length(a.photos, 1), 0) > 0)
       and (coalesce(a.is_public, false) or coalesce(a.is_listed, false) or a.held_at is not null)
       and (not p_only_held or a.held_at is not null)
     limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
  ), '[]'::jsonb);
end $$;


-- 2) 한 건 자세히 — 열람 기록을 남깁니다 ---------------------------------------------------
/* 비공개 개체도 여기서는 열립니다. 대신 볼 때마다 moderation_log 에 'view'
   가 쌓입니다. 회원 목록에는 안 보이지만(v68 정책) 우리 쪽 기록에는 남아,
   나중에 '누가 언제 무엇을 봤는가' 를 답할 수 있습니다. 그게 이 권한을
   가지는 조건입니다. */
create or replace function public.admin_animal_detail(p_animal uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.animals; p public.profiles;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;
  select * into p from public.profiles where user_id = a.user_id;

  insert into public.moderation_log (animal_id, owner_id, admin_id, action, reason)
  values (p_animal, a.user_id, auth.uid(), 'view', p_reason);

  return jsonb_build_object(
    'id', a.id, 'name', a.name, 'species', a.species, 'note', a.note,
    'owner_email', p.email, 'owner_nickname', p.nickname,
    'photo_url', a.photo_url, 'photos', a.photos,
    'is_public', a.is_public, 'is_listed', a.is_listed,
    'held_at', a.held_at, 'held_category', a.held_category,
    'held_reason', a.held_reason, 'purge_after', a.purge_after,
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', l.action, 'category', l.category, 'reason', l.reason,
               'created_at', l.created_at) order by l.created_at desc)
        from public.moderation_log l where l.animal_id = p_animal), '[]'::jsonb));
end $$;


-- 3) 처리 기록 (관리자 전체) ---------------------------------------------------------
create or replace function public.admin_moderation_log(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'animal_id', l.animal_id, 'action', l.action,
             'category', l.category, 'reason', l.reason,
             'owner_email', p.email, 'created_at', l.created_at,
             'photo_paths', l.photo_paths)
           order by l.created_at desc)
      from (select * from public.moderation_log
             order by created_at desc limit greatest(1, least(p_limit, 500))) l
      left join public.profiles p on p.user_id = l.owner_id
  ), '[]'::jsonb);
end $$;


-- 4) 권한 ----------------------------------------------------------------------
revoke all on function public.admin_photo_queue(boolean, int, int) from public, anon, authenticated;
revoke all on function public.admin_animal_detail(uuid, text)      from public, anon, authenticated;
revoke all on function public.admin_moderation_log(int)            from public, anon, authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, '검수 목록' as 검사,
       case when to_regprocedure('public.admin_photo_queue(boolean,int,int)') is null
            then '★ MISSING' else 'OK' end as 판정
union all
select 2, '한 건 자세히 (열람 기록)',
       case when to_regprocedure('public.admin_animal_detail(uuid,text)') is null
            then '★ MISSING' else 'OK' end
union all
select 3, '처리 기록',
       case when to_regprocedure('public.admin_moderation_log(int)') is null
            then '★ MISSING' else 'OK' end
union all
select 4, 'anon 접근',
       case when has_function_privilege('anon',
              to_regprocedure('public.admin_photo_queue(boolean,int,int)')::oid, 'execute')
            then '★ 열려 있습니다' else 'OK' end
order by 순;
