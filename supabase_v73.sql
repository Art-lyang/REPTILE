-- =============================================================================
-- v73 · 세부조회 — 이미지와 데이터를 함께 봅니다
-- -----------------------------------------------------------------------------
-- 지금까지 검수는 사진만 봤습니다. 그런데 실제로 걸러야 할 것 중에는 사진만
-- 봐서는 모르는 것이 있습니다.
--
--   · 레오파드로 등록해 놓고 사진은 전혀 다른 동물
--   · 모프 정보가 사진과 안 맞음
--   · 개체와 무관한 사진 (사람·풍경·광고)
--   · 메모에 약관에 어긋나는 내용
--
-- 이미지와 데이터를 나란히 봐야 판단이 됩니다. 그래서 admin_animal_detail 이
-- 종·성별·모프·헷·해칭일·클러치·메모까지 함께 돌려줍니다.
--
-- ⚠️ 기록을 'view' 에서 'detail' 로 가릅니다.
--    목록을 훑은 것과 한 건을 열어 데이터까지 본 것은 무게가 다릅니다. 같은
--    이름으로 쌓이면 나중에 '이 개체를 실제로 들여다본 적이 있는가' 에 답할
--    수 없습니다.
--
-- 선행: supabase_v70.sql
-- =============================================================================

do $guard$
begin
  if to_regclass('public.moderation_log') is null then
    raise exception E'supabase_v68.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

-- 1) 기록 종류에 detail 을 더합니다 ---------------------------------------------------
alter table public.moderation_log drop constraint if exists moderation_log_action_ck;
alter table public.moderation_log add constraint moderation_log_action_ck check (action in (
  'view',            -- 목록 훑기 (비공개 포함)
  'detail',          -- 한 건 세부조회 — 데이터까지 봤음
  'hold', 'release', 'delete_photos', 'delete_animal',
  'ai_block', 'ai_unblock', 'expire'
));


-- 2) 세부조회 — 사진과 데이터를 함께 -----------------------------------------------------
create or replace function public.admin_animal_detail(p_animal uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.animals; p public.profiles;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;
  select * into p from public.profiles where user_id = a.user_id;

  /* 'view' 가 아니라 'detail' 입니다. 목록을 스친 것과 데이터까지 들여다본
     것은 나중에 갈라서 답할 수 있어야 합니다. */
  insert into public.moderation_log (animal_id, owner_id, admin_id, action, reason)
  values (p_animal, a.user_id, auth.uid(), 'detail', p_reason);

  return jsonb_build_object(
    'id', a.id,
    /* 이미지와 대조할 값들 — 이게 없으면 사진만 보고 판단하게 됩니다. */
    'name', a.name, 'species', a.species, 'sex', a.sex,
    'life_stage', a.life_stage, 'hatch_date', a.hatch_date,
    'clutch_label', a.clutch_label,
    'morphs', coalesce(a.morphs, '{}'), 'hets', coalesce(a.hets, '{}'),
    'note', a.note,
    'owner_email', p.email, 'owner_nickname', p.nickname,
    'created_at', a.created_at,
    'photo_url', a.photo_url, 'photos', coalesce(a.photos, '{}'),
    'is_public', a.is_public, 'is_listed', a.is_listed,
    'held_at', a.held_at, 'held_category', a.held_category,
    'held_reason', a.held_reason, 'purge_after', a.purge_after,
    'legal_status', a.legal_status,
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', l.action, 'category', l.category, 'reason', l.reason,
               'created_at', l.created_at) order by l.created_at desc)
        from public.moderation_log l where l.animal_id = p_animal), '[]'::jsonb));
end $$;

revoke all on function public.admin_animal_detail(uuid, text) from public, anon;
grant execute on function public.admin_animal_detail(uuid, text) to authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, '기록 종류에 detail' as 검사,
       case when pg_get_constraintdef(oid) like '%detail%' then 'OK' else '★ MISSING' end as 판정
  from pg_constraint where conname = 'moderation_log_action_ck'
union all
select 2, '세부조회가 detail 로 남는가',
       case when pg_get_functiondef(to_regprocedure('public.admin_animal_detail(uuid,text)')::oid)
                 like '%''detail''%' then 'OK' else '★ 아직 view 로 남습니다' end
union all
select 3, '대조용 데이터 반환',
       case when pg_get_functiondef(to_regprocedure('public.admin_animal_detail(uuid,text)')::oid)
                 like '%''morphs''%' then 'OK' else '★ MISSING' end
order by 순;
