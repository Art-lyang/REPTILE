-- =============================================================================
-- v64 적용 확인 — 읽기 전용
-- -----------------------------------------------------------------------------
-- supabase_v64.sql 이 제대로 들어갔는지 봅니다. 아무것도 만들지도 고치지도
-- 않습니다.
--
-- 왜 따로 필요한가
--   v64 가 만드는 것 중 트리거가 셋입니다. PostgREST 는 반환형이 trigger 인
--   함수를 노출하지 않으므로, 밖에서 RPC 로 두드려 봐야 있으나 없으나 '없음'
--   으로만 나옵니다. v61 때 같은 이유로 확인 파일을 따로 만들었습니다
--   (docs/V61_CHECK.sql).
--
-- ⚠️ 1부만 먼저 실행하세요.
--   1부는 표가 없어도 죽지 않습니다 — 카탈로그만 읽습니다. 2부는 표가 실제로
--   있어야 도는 조회라, 미적용 상태에서 돌리면 'relation does not exist' 로
--   전체가 멈춥니다. 1부가 '적용됨' 이라고 할 때만 2부를 돌리세요.
--
--   (처음 판에서 이 구분이 없어 미적용 상태에서 파일이 통째로 죽었습니다.
--    'public.animal_documents'::regclass 는 표가 없으면 캐스트 단계에서
--    바로 예외를 던집니다. to_regclass 는 null 을 돌려줍니다.)
-- =============================================================================


-- ##############################################################################
-- 1부 — 언제 돌려도 안전합니다
-- ##############################################################################

-- 0) 적용됐는가 -----------------------------------------------------------------
-- 여기서 '미적용' 이 나오면 아래는 볼 것 없습니다. supabase_v64.sql 을 먼저
-- 실행하세요.
select
  case
    when to_regclass('public.animal_documents') is null
     and to_regclass('public.animal_legal_locks') is null then '미적용 — v64 를 먼저 실행하세요'
    when to_regclass('public.animal_documents') is null
      or to_regclass('public.animal_legal_locks') is null then '★ 반쯤 적용됨 — 아래를 보고 어디서 멈췄는지 확인하세요'
    else '적용됨 — 아래를 계속 보세요'
  end as v64_상태,
  (to_regclass('public.animal_documents')   is not null) as 서류표,
  (to_regclass('public.animal_legal_locks') is not null) as 잠금표;


-- 1) 개체 표에 붙은 칸 ------------------------------------------------------------
select 'animals 칸' as 검사,
       count(*) filter (where column_name = 'legal_status') as legal_status,
       count(*) filter (where column_name = 'legal_ref')    as legal_ref,
       case when count(*) filter (where column_name in ('legal_status','legal_ref')) = 2
            then 'OK' else '★ MISSING' end as 판정
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals';

-- 기본값이 'none' 이어야 합니다. 기존 개체 수천 건이 '확인 필요' 로 바뀌면
-- 아무도 확인하지 않습니다. (칸이 없으면 0줄입니다 — 그것도 답입니다.)
select 'legal_status 기본값' as 검사, column_default,
       case when column_default like '%none%' then 'OK' else '★ CHECK' end as 판정
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals' and column_name = 'legal_status';


-- 2) 표와 RLS ------------------------------------------------------------------
select '표' as 검사, c.relname as 표이름,
       case when c.relrowsecurity then 'RLS 켜짐' else '★ RLS 꺼짐' end as rls
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('animal_documents', 'animal_legal_locks')
 order by c.relname;

-- ⚠️ 개체로 향하는 FK 가 없어야 합니다. save_row 가 개체를 고칠 때 delete 후
--    재insert 하므로(supabase_v54.sql), cascade 를 걸면 이름만 바꿔도 서류가
--    통째로 사라집니다. 아래가 0줄이어야 정상입니다.
--    to_regclass 를 씁니다 — ::regclass 는 표가 없으면 예외를 던집니다.
select '개체로 향하는 FK (0줄이어야 정상)' as 검사,
       conrelid::regclass::text as 표, conname as 제약
  from pg_constraint
 where contype = 'f'
   and conrelid in (
         select oid from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in ('animal_documents', 'animal_legal_locks'))
   and confrelid = (select oid from pg_class
                     where relnamespace = 'public'::regnamespace and relname = 'animals');


-- 3) 정책 — delete 정책이 없어야 합니다 ---------------------------------------------
-- 서류와 잠금은 지울 수 없어야 합니다. RLS 는 정책이 없으면 막으므로,
-- delete 정책이 '없는 것' 이 곧 잠금입니다.
select '정책' as 검사, tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('animal_documents', 'animal_legal_locks')
 order by tablename, cmd;

select 'delete 정책 (0이어야 정상)' as 검사, count(*) as 개수,
       case when count(*) = 0 then 'OK' else '★ 지울 수 있습니다' end as 판정
  from pg_policies
 where schemaname = 'public'
   and tablename in ('animal_documents', 'animal_legal_locks')
   and cmd = 'DELETE';


-- 4) 트리거 셋 -----------------------------------------------------------------
-- 밖에서는 안 보이는 것들입니다. 여기서만 확인됩니다.
with want(name) as (
  values ('animals_cites_guard'), ('animals_cites_lock'), ('animal_documents_guard'))
select '트리거' as 검사, want.name,
       case when t.tgname is null then '★ MISSING' else 'OK' end as 판정
  from want
  left join pg_trigger t on t.tgname = want.name and not t.tgisinternal
 order by want.name;


-- 5) 함수 ---------------------------------------------------------------------
with want(name, ns) as (values
  ('is_cites','private'), ('legal_docs_required','private'), ('cites_docs_ok','private'),
  ('save_animal_document','public'), ('archive_animal_document','public'),
  ('my_animal_legal','public'), ('assert_cites_transferable','public'),
  ('admin_cites_watchlist','public'), ('admin_release_legal_lock','public'),
  ('public_animal','public'))
select '함수' as 검사, want.ns || '.' || want.name as 이름,
       case when p.oid is null then '★ MISSING' else 'OK' end as 판정
  from want
  left join pg_namespace n on n.nspname = want.ns
  left join pg_proc p on p.proname = want.name and p.pronamespace = n.oid
 order by want.ns, want.name;

-- 양도 문지기는 지금 부르는 곳이 없습니다. 없다고 지우면, 나중에 양도 기능을
-- 만들 때 '공개는 막혔는데 양도는 되는' 두 번째 문이 열립니다.
select 'assert_cites_transferable 살아있음' as 검사,
       case when to_regprocedure('public.assert_cites_transferable(uuid)') is null
            then '★ MISSING' else 'OK' end as 판정;


-- 6) 권한 — anon 이 손댈 수 없어야 합니다 --------------------------------------------
-- public_animal 만 true 여야 정상입니다.
select 'anon 실행권한' as 검사, p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_실행가능,
       case when p.proname = 'public_animal' then '이건 true 가 정상'
            when has_function_privilege('anon', p.oid, 'execute') then '★ 열려 있습니다'
            else 'OK' end as 판정
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_animal_document','archive_animal_document','my_animal_legal',
                     'assert_cites_transferable','admin_cites_watchlist',
                     'admin_release_legal_lock','public_animal')
 order by p.proname;


-- 7) 서류 보관함 -----------------------------------------------------------------
-- 공개 버킷이면 주소만 알면 열립니다. 서류에는 상대방 이름·주소·허가번호가
-- 들어갑니다.
select '버킷' as 검사, id, public,
       case when public then '★ 공개 버킷입니다' else 'OK' end as 판정
  from storage.buckets
 where id ilike '%doc%';


-- ##############################################################################
-- 2부 — 1부가 '적용됨' 일 때만 돌리세요
-- -----------------------------------------------------------------------------
-- 여기부터는 표를 직접 읽습니다. 미적용 상태에서 돌리면
-- 'relation "public.animal_documents" does not exist' 로 멈춥니다.
-- 아래 주석을 풀고 실행하세요.
-- ##############################################################################

-- select 'CITES 로 표시된 개체' as 검사, legal_status, count(*) as 마리
--   from public.animals
--  where legal_status is not null and legal_status <> 'none'
--  group by legal_status
--  order by legal_status;
--
-- select '서류가 걸린 개체' as 검사, count(distinct animal_id) as 마리
--   from public.animal_documents
--  where archived_at is null;
--
-- select '잠금이 걸린 개체' as 검사,
--        count(*) filter (where released_at is null)     as 잠김,
--        count(*) filter (where released_at is not null) as 해제됨
--   from public.animal_legal_locks;


-- =============================================================================
-- 3부 — 손으로 해 볼 것. 조회로는 확인이 안 됩니다
-- -----------------------------------------------------------------------------
-- ① 서류 없이 공개가 막히는가
--    스테이징에서 개체 하나를 cites_ii 로 바꾸고, 케어 화면에서 공개를 켜
--    보세요. 거절되어야 합니다.
--
-- ② 개체 이름만 바꿔도 서류가 남는가
--    ①의 개체에 서류를 하나 올린 뒤, 이름만 고쳐 저장해 보세요. 서류가
--    그대로 있어야 합니다. save_row 의 delete + 재insert 때문에 여기서
--    사라지면 FK 나 cascade 가 어딘가 남아 있는 것입니다.
-- =============================================================================
