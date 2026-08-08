-- =============================================================================
-- v64 적용 확인 — 읽기 전용
-- -----------------------------------------------------------------------------
-- supabase_v64.sql 을 스테이징에 실행한 뒤, 이 파일을 SQL Editor 에 붙여넣고
-- 한 번에 실행하세요. 아무것도 만들지도 고치지도 않습니다.
--
-- 왜 따로 필요한가
--   v64 가 만드는 것 중 상당수가 트리거 함수입니다. PostgREST 는 반환형이
--   trigger 인 함수를 노출하지 않으므로, 밖에서 RPC 로 두드려 봐야 '없음'
--   으로만 나옵니다. v61 때 같은 이유로 확인 파일을 따로 만들었습니다
--   (docs/V61_CHECK.sql).
--
-- 보는 법
--   각 조회의 맨 오른쪽 칸이 판정입니다. 전부 'OK' 면 끝입니다.
--   하나라도 'MISSING' 이면 그 줄만 다시 보세요.
-- =============================================================================


-- 1) 개체 표에 붙은 칸 ------------------------------------------------------------
select 'animals 칸' as 검사,
       count(*) filter (where column_name = 'legal_status') as legal_status,
       count(*) filter (where column_name = 'legal_ref')    as legal_ref,
       case when count(*) filter (where column_name in ('legal_status','legal_ref')) = 2
            then 'OK' else 'MISSING' end as 판정
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals';

-- 기본값이 'none' 이어야 합니다. 기존 개체 수천 건이 '확인 필요' 로 바뀌면
-- 아무도 확인하지 않습니다.
select 'legal_status 기본값' as 검사, column_default,
       case when column_default like '%none%' then 'OK' else 'CHECK' end as 판정
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals' and column_name = 'legal_status';


-- 2) 표 두 개 ------------------------------------------------------------------
select '표' as 검사, t.tablename,
       case when c.relrowsecurity then 'RLS 켜짐' else '★ RLS 꺼짐' end as rls
  from pg_tables t
  join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
 where t.schemaname = 'public'
   and t.tablename in ('animal_documents', 'animal_legal_locks')
 order by t.tablename;

-- ⚠️ 개체로 향하는 FK 가 없어야 합니다. save_row 가 개체를 고칠 때 delete 후
--    재insert 하므로(supabase_v54.sql), cascade 를 걸면 이름만 바꿔도 서류가
--    통째로 사라집니다. 아래가 0 줄이어야 정상입니다.
select '개체로 향하는 FK (0줄이어야 정상)' as 검사,
       conrelid::regclass as 표, conname as 제약
  from pg_constraint
 where contype = 'f'
   and conrelid in ('public.animal_documents'::regclass, 'public.animal_legal_locks'::regclass)
   and confrelid = 'public.animals'::regclass;


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


-- 4) 트리거 세 개 ---------------------------------------------------------------
-- 밖에서는 안 보이는 것들입니다. 여기서만 확인됩니다.
with want(name) as (values ('animals_cites_guard'), ('animals_cites_lock'), ('animal_documents_guard'))
select '트리거' as 검사, want.name,
       case when t.tgname is null then '★ MISSING' else 'OK' end as 판정
  from want
  left join pg_trigger t on t.tgname = want.name and not t.tgisinternal
 order by want.name;


-- 5) 함수 ---------------------------------------------------------------------
with want(name) as (values
  ('is_cites'), ('legal_docs_required'), ('cites_docs_ok'),
  ('save_animal_document'), ('archive_animal_document'), ('my_animal_legal'),
  ('assert_cites_transferable'), ('admin_cites_watchlist'), ('admin_release_legal_lock'),
  ('public_animal'))
select '함수' as 검사, want.name,
       coalesce(n.nspname, '—') as 스키마,
       case when p.oid is null then '★ MISSING' else 'OK' end as 판정
  from want
  left join pg_proc p on p.proname = want.name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'private')
 order by want.name;

-- 양도 문지기는 지금 부르는 곳이 없습니다. 없다고 지우면, 나중에 양도 기능을
-- 만들 때 '공개는 막혔는데 양도는 되는' 두 번째 문이 열립니다.
select 'assert_cites_transferable 살아있음' as 검사,
       case when to_regprocedure('public.assert_cites_transferable(uuid)') is null
            then '★ MISSING' else 'OK' end as 판정;


-- 6) 권한 — anon 이 손댈 수 없어야 합니다 --------------------------------------------
select 'anon 실행권한 (public_animal 만 있어야 정상)' as 검사,
       p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_실행가능
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_animal_document','archive_animal_document','my_animal_legal',
                     'assert_cites_transferable','admin_cites_watchlist',
                     'admin_release_legal_lock','public_animal')
 order by p.proname;


-- 7) 서류 보관함 -----------------------------------------------------------------
-- 공개 버킷이면 서류가 주소만 알면 열립니다. 서류에는 상대방 이름·주소·
-- 허가번호가 들어갑니다.
select '버킷' as 검사, id, public,
       case when public then '★ 공개 버킷입니다' else 'OK' end as 판정
  from storage.buckets
 where id like '%document%' or id like '%doc%';


-- 8) 실제로 걸리는지 — 개체가 있을 때만 -------------------------------------------------
-- 아래는 지금 데이터에 CITES 개체가 있는지 보는 것뿐입니다. 없으면 0줄이
-- 정상이고, 그건 잘못이 아닙니다. 스테이징에서 한 마리를 cites_ii 로 바꿔
-- 두고 공개를 시도해 보시면 문지기가 실제로 막는지 확인할 수 있습니다.
select 'CITES 로 표시된 개체' as 검사, legal_status, count(*) as 마리
  from public.animals
 where legal_status is not null and legal_status <> 'none'
 group by legal_status
 order by legal_status;

select '서류가 걸린 개체' as 검사, count(distinct animal_id) as 마리
  from public.animal_documents
 where archived_at is null;

select '잠금이 걸린 개체' as 검사,
       count(*) filter (where released_at is null) as 잠김,
       count(*) filter (where released_at is not null) as 해제됨
  from public.animal_legal_locks;


-- =============================================================================
-- 손으로 해 볼 것 — 조회로는 확인이 안 되는 두 가지
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
