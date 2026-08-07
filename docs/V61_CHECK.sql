-- =============================================================================
-- v61 적용 확인 (Supabase → SQL Editor 에 붙여넣고 실행)
-- -----------------------------------------------------------------------------
-- 왜 따로 확인하나
--   v59·v60 은 새로 만든 함수가 public 스키마에 있어서, 밖에서 익명으로 불러
--   응답 코드만 봐도 적용 여부를 알 수 있었습니다.
--
--   v61 은 그렇지 않습니다. 트리거 함수는 PostgREST 가 RPC 로 열어 주지 않고
--   (returns trigger), 글자 검사는 private 스키마에 있습니다. 그래서 여기서
--   직접 봐야 합니다.
--
--   읽기만 합니다. 표를 바꾸지 않습니다.
-- =============================================================================

-- 1) 만들어졌어야 할 것들 ------------------------------------------------------
--    기대: 4줄 모두 '있음'
select '함수 private.is_plain_name' as 대상,
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'is_plain_name'
       ) then '있음' else '없음 ← v61 미적용' end as 상태
union all
select '함수 public.profiles_name_guard',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'profiles_name_guard'
       ) then '있음' else '없음 ← v61 미적용' end
union all
select '트리거 profiles_name_guard',
       case when exists (
         select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where c.relname = 'profiles' and t.tgname = 'profiles_name_guard'
       ) then '있음' else '없음 ← v61 미적용' end
union all
select '닉네임 트리거에 글자 검사',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'profiles_nickname_guard'
            and p.prosrc like '%NICKNAME_CHARSET%'
       ) then '있음' else '없음 ← v61 미적용' end;

-- 2) 검사가 실제로 맞게 도는가 ---------------------------------------------------
--    기대: 통과 7건, 차단 7건 (아래 '판정' 이 전부 'ok')
select v as 값,
       private.is_plain_name(v) as 허용,
       expect as 기대,
       case when private.is_plain_name(v) = expect then 'ok' else '⚠ 어긋남' end as 판정
from (values
  ('행복한 집사 001', true), ('Ryang Gecko', true), ('ryang_studio', true),
  ('gecko-2', true), ('량.스튜디오', true), ('すずめ', true), ('小龙', true),
  ('량스튜디오 🐍', false), ('🦎', false), ('ㅋㅋ^^', false),
  ('hi :)', false), ('hello♥', false), ('집사👍', false), ('Ryang™', false)
) as t(v, expect);

-- 3) 사업자 신청에서 프리미엄 조건이 빠졌는가 ----------------------------------------
--    기대: '빠짐'. '남아있음' 이면 가입 화면에서 낸 신청이 그 자리에서 막힙니다.
select case when p.prosrc like '%BIZ_PREMIUM_REQUIRED%'
            then '남아있음 ← v61 미적용'
            else '빠짐' end as 프리미엄조건
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'apply_business_verification';

-- 4) 남아 있는 이모지가 없는가 ----------------------------------------------------
--    기대: 0건. 마이그레이션이 정리했어야 합니다.
select count(*) filter (where name is not null and not private.is_plain_name(name))      as 이름_이모지_남음,
       count(*) filter (where nickname is not null and not private.is_plain_name(nickname)) as 닉네임_이모지_남음
  from public.profiles;
