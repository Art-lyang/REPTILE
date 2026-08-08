-- =============================================================================
-- v75 · 가입을 엽니다
-- -----------------------------------------------------------------------------
-- supabase_v26.sql 이 auth.users 에 트리거를 걸어 신규 가입을 **DB 에서** 막고
-- 있습니다. 화면 스위치(SIGNUPS_ENABLED)만 켜면 가입 버튼은 보이는데 누르는
-- 순간 'signups temporarily disabled' 로 떨어집니다. 이 파일이 그 자물쇠를
-- 풉니다.
--
-- ⚠️ 이 파일만으로는 부족합니다. 셋 다 해야 실제로 열립니다.
--
--   1. 이 SQL 을 실행 (DB 자물쇠)
--   2. Supabase 대시보드 → Authentication → Sign In / Providers →
--      "Allow new users to sign up" 켜기 (Auth 설정 자물쇠)
--   3. 새 배포 (화면 스위치 SIGNUPS_ENABLED = true)
--
--   하나라도 빠지면 가입이 안 되거나, 되더라도 화면에 버튼이 없습니다.
--
-- 되돌리려면 supabase_v26.sql 의 16~19번째 줄을 다시 실행하면 됩니다.
-- 함수는 남겨 둡니다 — 지우면 되돌릴 때 v26 을 통째로 다시 읽어야 합니다.
--
-- 선행: supabase_v74.sql
-- =============================================================================

begin;

/* 트리거만 내립니다. 함수 public.block_new_auth_users() 는 그대로 둡니다 —
   다시 잠가야 할 때 트리거 한 줄만 걸면 되게 하기 위함입니다. */
drop trigger if exists block_new_auth_users on auth.users;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, 'DB 자물쇠가 풀렸는가' as 검사,
       case when exists (
              select 1 from pg_trigger
               where tgname = 'block_new_auth_users'
                 and tgrelid = 'auth.users'::regclass
                 and not tgisinternal)
            then '★ 아직 막혀 있습니다' else 'OK' end as 판정
union all
select 2, '되돌릴 함수가 남아 있는가',
       case when to_regprocedure('public.block_new_auth_users()') is null
            then '★ 사라졌습니다 — v26 을 다시 읽어야 되돌립니다' else 'OK' end
union all
/* 여기까지 OK 여도 대시보드 설정이 남아 있습니다. 그건 SQL 로 볼 수 없어
   직접 확인해야 합니다. */
select 3, '남은 일',
       '대시보드 → Authentication → Sign In / Providers → Allow new users to sign up'
order by 순;
