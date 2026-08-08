-- =============================================================================
-- 잘못 걸린 보류 원복 + 관리자 본인 개체로 다시 걸기
-- -----------------------------------------------------------------------------
-- HOLD_TRY.sql 이 소유자를 가리지 않고 개체를 골랐습니다. 테스터가 쓰는 개체에
-- 걸렸을 수 있어 먼저 전부 풉니다.
--
--   1부 — 지금 보류된 것을 전부 원복
--   2부 — kmc612000@gmail.com 소유 개체에만 다시 걸기
--
-- ⚠️ 보류를 풀어도 공개(is_public)는 자동으로 안 돌아옵니다. 무엇을 남에게
--    보일지는 회원이 정하는 것이라 v68 이 일부러 그렇게 둡니다. 원래 공개
--    상태였던 개체는 케어 화면에서 직접 다시 켜 주세요. 1부가 어느 개체를
--    풀었는지 보여 줍니다.
-- =============================================================================

-- ##############################################################################
-- 1부 — 원복
-- ##############################################################################

begin;

do $undo$
declare em text; uid uuid; r record; n int := 0;
begin
  select lower(a.email), p.user_id into em, uid
    from public.admins a
    left join public.profiles p on lower(p.email) = lower(a.email)
   order by a.email limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('email', em, 'sub', uid::text)::text, true);

  for r in select id, name from public.animals where held_at is not null loop
    perform public.admin_release_animal(r.id, '잘못 걸린 보류 원복');
    raise notice '원복: %', r.name;
    n := n + 1;
  end loop;
  raise notice '총 %건 원복', n;
end $undo$;

commit;

-- 어떤 개체가 풀렸는지. is_public 이 false 면 원래 공개였는지 확인해 주세요.
select a.name as 개체, p.email as 주인, a.is_public as 공개, a.is_listed as 갤러리
  from public.animals a
  left join public.profiles p on p.user_id = a.user_id
 where a.id in (select animal_id from public.moderation_log
                 where action = 'release' and reason = '잘못 걸린 보류 원복')
 order by a.name;

-- 남은 보류가 없어야 합니다 (0 이어야 정상)
select count(*) as 남은_보류 from public.animals where held_at is not null;


-- ##############################################################################
-- 2부 — 관리자 본인 개체에만 다시 걸기
-- ##############################################################################

begin;

do $mine$
declare
  em text := 'kmc612000@gmail.com';
  uid uuid;
  target uuid; nm text;
begin
  select user_id into uid from public.profiles where lower(email) = em;
  if uid is null then
    raise exception '% 계정을 profiles 에서 못 찾았습니다.', em;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('email', em, 'sub', uid::text)::text, true);

  /* ★ 소유자를 가립니다. 이게 처음 판에 빠져 있었습니다. */
  select a.id, a.name into target, nm
    from public.animals a
   where a.user_id = uid
     and (a.photo_url is not null or coalesce(array_length(a.photos, 1), 0) > 0)
     and a.held_at is null
   order by a.created_at desc
   limit 1;

  if target is null then
    raise exception '% 계정에 사진이 있는 개체가 없습니다.', em;
  end if;

  perform public.admin_hold_animal(target, 'unrelated', '배너 확인용입니다. 확인 후 해제합니다.');
  raise notice '보류: % (%)', nm, target;
end $mine$;

commit;


-- 확인할 주소 -------------------------------------------------------------------
select a.name as 개체, p.email as 주인,
       'https://ryangstudio.com/care/animal.html?id=' || a.id as 주소,
       a.purge_after as 삭제예정
  from public.animals a
  left join public.profiles p on p.user_id = a.user_id
 where a.held_at is not null;

-- 위 주소로 들어가면 사진보다 위에 빨간 배너가 뜹니다.
-- /care/ 개체 목록에서는 그 카드에 '비공개 처리됨' 칩이 붙습니다.
