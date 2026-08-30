-- =============================================================================
-- 보류 배너 확인 — 개체 하나에 보류를 걸어 봅니다
-- -----------------------------------------------------------------------------
-- 두 가지를 알아서 처리합니다.
--
--   ① 개체 id 를 손으로 안 넣어도 됩니다. 사진이 있는 개체 하나를 고릅니다.
--
--      ⚠️ 이 파일은 소유자를 가리지 않습니다. 테스터 계정의 개체에 걸릴 수
--         있습니다. 실제로 그렇게 걸렸던 적이 있습니다 — 특정 계정으로만
--         걸려면 docs/HOLD_FIX.sql 의 2부를 쓰세요.
--   ② is_admin() 이 SQL Editor 에서 false 인 문제.
--      is_admin 은 auth.jwt()->>'email' 을 봅니다(supabase_setup.sql). SQL
--      Editor 에는 JWT 가 없어 그 값이 비고, 그래서 ADMIN_ONLY 로 막힙니다.
--      admins 표의 첫 관리자로 JWT 를 흉내 내 같은 트랜잭션에서만 통과시킵니다.
--      (set_config 의 세 번째 인자 true = 이 트랜잭션 한정. 다음 요청으로 안 샙니다.)
--
--      ⚠️ email 만 넣으면 안 됩니다. is_admin 은 통과하지만 moderation_log 의
--         admin_id 를 채우는 auth.uid() 가 여전히 null 이라 23502 로 막힙니다.
--         auth.uid() 는 sub 클레임을 읽으므로 둘 다 넣어야 합니다.
--
-- 그대로 실행하세요.
-- =============================================================================

begin;

do $try$
declare
  em text;
  uid uuid;
  target uuid;
  nm text;
  res jsonb;
begin
  /* 관리자 메일과 그 계정의 user_id 를 함께 잡습니다. */
  select lower(a.email), p.user_id into em, uid
    from public.admins a
    left join public.profiles p on lower(p.email) = lower(a.email)
   order by a.email limit 1;

  if em is null then
    raise exception 'admins 표가 비어 있습니다 — 관리자 메일이 등록돼 있어야 합니다.';
  end if;
  if uid is null then
    raise exception '관리자 메일(%)에 해당하는 profiles 줄이 없습니다.', em;
  end if;

  /* JWT 흉내. email 은 is_admin 이, sub 는 auth.uid() 가 읽습니다.
     이 트랜잭션 안에서만 유효합니다. */
  perform set_config('request.jwt.claims',
    json_build_object('email', em, 'sub', uid::text)::text, true);

  /* 사진이 있는 개체 중 아직 보류가 아닌 것 하나. */
  select a.id, a.name into target, nm
    from public.animals a
   where (a.photo_url is not null or coalesce(array_length(a.photos, 1), 0) > 0)
     and a.held_at is null
   order by a.created_at desc
   limit 1;

  if target is null then
    raise exception '사진이 있는 개체가 없습니다. 개체에 사진을 하나 올린 뒤 다시 실행하세요.';
  end if;

  res := public.admin_hold_animal(target, 'unrelated', '개체와 무관한 사진으로 보여 확인이 필요합니다.');

  raise notice '보류 건 개체: % (%)', nm, target;
  raise notice '결과: %', res;
end $try$;

commit;


-- 걸렸는지 확인 -----------------------------------------------------------------
select a.name as 개체, a.held_at::date as 보류일, a.held_category as 분류,
       a.purge_after as 삭제예정, a.is_public as 공개, a.held_reason as 사유
  from public.animals a
 where a.held_at is not null
 order by a.held_at desc;


-- 이제 그 개체의 관리 페이지에 들어가 보세요.
--   /care/animal.html?id=<위 목록의 개체>
-- 배너가 맨 위에 뜨고, /care/ 개체 목록의 카드에도 '비공개 처리됨' 이 붙습니다.


-- =============================================================================
-- 되돌리기 — 확인이 끝나면
-- -----------------------------------------------------------------------------
-- begin;
--   do $undo$
--   declare em text; uid uuid; t uuid;
--   begin
--     select lower(a.email), p.user_id into em, uid from public.admins a
--       left join public.profiles p on lower(p.email) = lower(a.email)
--      order by a.email limit 1;
--     perform set_config('request.jwt.claims',
--       json_build_object('email', em, 'sub', uid::text)::text, true);
--     for t in select id from public.animals where held_at is not null loop
--       perform public.admin_release_animal(t, '확인용 보류 해제');
--     end loop;
--   end $undo$;
-- commit;
--
-- ⚠️ 공개(is_public)는 자동으로 되돌아오지 않습니다. 무엇을 남에게 보일지는
--    회원이 정하는 것이라 일부러 그렇게 두었습니다. 케어 화면에서 다시 켜세요.
-- =============================================================================
