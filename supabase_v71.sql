-- =============================================================================
-- v71 · 관리자 함수 실행 권한
-- -----------------------------------------------------------------------------
-- v64·v68·v70 이 관리자 함수에 revoke 만 하고 grant 를 안 했습니다. 여덟 개
-- 전부입니다. 그래서 검수 탭이 permission denied 로 아무것도 못 부릅니다.
--
--   revoke all on function public.admin_photo_queue(...) from public, anon, authenticated;
--   ← 여기서 끝났습니다. authenticated 에게 다시 줘야 관리자가 부릅니다.
--
-- 왜 이렇게 됐나
--   private.* 함수(정의자 안에서만 쓰는 것)를 잠그는 줄을 그대로 복사해 왔습니다.
--   그쪽은 아무도 직접 부르면 안 되니 revoke 만 하는 것이 맞습니다. 관리자
--   함수는 반대입니다 — 관리자가 PostgREST 를 통해 authenticated 로 부릅니다.
--
-- 권한을 줘도 안전한가
--   네. 여덟 개 모두 첫 줄에서 public.is_admin() 을 봅니다. 관리자가 아니면
--   ADMIN_ONLY 로 거절되므로, 실행 권한은 '부를 수는 있다' 까지일 뿐입니다.
--   anon 에게는 주지 않습니다.
-- =============================================================================

begin;

/* v64 — CITES */
grant execute on function public.admin_cites_watchlist()                to authenticated;
grant execute on function public.admin_release_legal_lock(uuid, text)   to authenticated;

/* v68 — 검수 조치 */
grant execute on function public.admin_hold_animal(uuid, text, text)    to authenticated;
grant execute on function public.admin_release_animal(uuid, text)       to authenticated;
grant execute on function public.admin_purge_photos(uuid, text, text)   to authenticated;

/* v70 — 검수 조회 */
grant execute on function public.admin_photo_queue(boolean, int, int)   to authenticated;
grant execute on function public.admin_animal_detail(uuid, text)        to authenticated;
grant execute on function public.admin_moderation_log(int)              to authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
-- authenticated 는 전부 true, anon 은 전부 false 여야 합니다.
select p.proname as 함수,
       has_function_privilege('authenticated', p.oid, 'execute') as 관리자_호출가능,
       has_function_privilege('anon', p.oid, 'execute')          as 익명_호출가능,
       case when has_function_privilege('authenticated', p.oid, 'execute')
             and not has_function_privilege('anon', p.oid, 'execute')
            then 'OK' else '★ 확인 필요' end as 판정
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.proname in ('admin_cites_watchlist','admin_release_legal_lock',
                     'admin_hold_animal','admin_release_animal','admin_purge_photos',
                     'admin_photo_queue','admin_animal_detail','admin_moderation_log')
 order by p.proname;

-- 같은 실수가 다른 곳에도 있는지 — grant 없이 revoke 만 된 admin_ 함수를 찾습니다.
-- 0줄이어야 정상입니다.
select p.proname as grant_빠진_함수
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.proname like 'admin\_%'
   and not has_function_privilege('authenticated', p.oid, 'execute')
 order by p.proname;
