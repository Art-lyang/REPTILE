-- =============================================================================
-- v64 적용 확인 — 읽기 전용, 한 번에 한 표로
-- -----------------------------------------------------------------------------
-- supabase_v64.sql 이 제대로 들어갔는지 봅니다. 아무것도 만들지도 고치지도
-- 않습니다.
--
-- ⚠️ 조회를 여러 개로 나누지 않습니다.
--    Supabase SQL Editor 는 마지막 문장의 결과만 보여 줍니다. 처음 판은 검사를
--    12개 문장으로 나눠 두어서, 다 돌고도 화면에는 마지막 한 줄(버킷)만
--    보였습니다. 나머지 11개가 통과했는지 실패했는지 알 방법이 없었습니다.
--    그래서 전부 한 문장으로 합쳤습니다 — 결과 표 하나에 다 나옵니다.
--
-- ⚠️ 표가 없어도 죽지 않습니다.
--    'public.animal_documents'::regclass 는 표가 없으면 캐스트에서 바로 예외를
--    던집니다. 그러면 '적용됐는지 보는 파일' 이 미적용일 때 죽습니다. 여기서는
--    to_regclass 와 카탈로그 조회만 씁니다.
--
-- 보는 법
--    판정 칸에 ★ 가 하나도 없으면 끝입니다. 순서대로 나옵니다.
-- =============================================================================

with
/* 있어야 할 것들 */
want_trigger(name) as (values
  ('animals_cites_guard'), ('animals_cites_lock'), ('animal_documents_guard')),
want_func(ns, name) as (values
  ('private','is_cites'), ('private','legal_docs_required'), ('private','cites_docs_ok'),
  ('public','save_animal_document'), ('public','archive_animal_document'),
  ('public','my_animal_legal'), ('public','assert_cites_transferable'),
  ('public','admin_cites_watchlist'), ('public','admin_release_legal_lock'),
  ('public','public_animal')),
new_tables(name) as (values ('animal_documents'), ('animal_legal_locks')),

/* 새 표의 oid. 없으면 0줄이고, 아래 검사들은 그걸 그대로 '없음' 으로 읽습니다. */
new_oids as (
  select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join new_tables t on t.name = c.relname
   where c.relnamespace = 'public'::regnamespace)

-- 0) 적용 여부 -------------------------------------------------------------------
select 1 as 순, '적용 여부' as 검사,
       (select count(*)::text from new_oids) || '/2 표' as 대상,
       case (select count(*) from new_oids)
         when 2 then 'OK'
         when 0 then '★ 미적용 — supabase_v64.sql 을 먼저 실행하세요'
         else '★ 반쯤 적용됨'
       end as 판정

-- 1) 개체 표에 붙은 칸 ------------------------------------------------------------
union all
select 2, '개체 칸', 'legal_status · legal_ref',
       case when count(*) = 2 then 'OK' else '★ MISSING (' || count(*)::text || '/2)' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals'
   and column_name in ('legal_status', 'legal_ref')

union all
select 3, '기본값', 'legal_status = none',
       case when bool_or(column_default like '%none%') then 'OK'
            when count(*) = 0 then '★ 칸이 없습니다'
            else '★ 기본값이 none 이 아닙니다' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals' and column_name = 'legal_status'

-- 2) RLS ----------------------------------------------------------------------
union all
select 4, 'RLS', relname,
       case when relrowsecurity then 'OK' else '★ RLS 꺼짐' end
  from new_oids

-- 3) 개체로 향하는 FK — 없어야 합니다 --------------------------------------------------
--    save_row 가 개체를 고칠 때 delete 후 재insert 하므로(supabase_v54.sql),
--    cascade 를 걸면 이름만 바꿔도 서류가 통째로 사라집니다.
union all
select 5, '개체로 향하는 FK', '없어야 정상',
       case when count(*) = 0 then 'OK'
            else '★ ' || count(*)::text || '개 있습니다 — 이름만 바꿔도 서류가 날아갑니다' end
  from pg_constraint
 where contype = 'f'
   and conrelid in (select oid from new_oids)
   and confrelid = (select oid from pg_class
                     where relnamespace = 'public'::regnamespace and relname = 'animals')

-- 4) delete 정책 — 없어야 합니다 -----------------------------------------------------
--    RLS 는 정책이 없으면 막습니다. 없는 것이 곧 잠금입니다.
union all
select 6, 'delete 정책', '없어야 정상',
       case when count(*) = 0 then 'OK'
            else '★ ' || count(*)::text || '개 — 서류를 지울 수 있습니다' end
  from pg_policies
 where schemaname = 'public'
   and tablename in (select name from new_tables)
   and cmd = 'DELETE'

union all
select 7, '정책 개수', tablename, count(*)::text || '개 (' || string_agg(cmd, ', ' order by cmd) || ')'
  from pg_policies
 where schemaname = 'public' and tablename in (select name from new_tables)
 group by tablename

-- 5) 트리거 셋 — 밖에서는 안 보이는 것들입니다 ----------------------------------------------
union all
select 8, '트리거', w.name,
       case when t.tgname is null then '★ MISSING' else 'OK' end
  from want_trigger w
  left join pg_trigger t on t.tgname = w.name and not t.tgisinternal

-- 6) 함수 ---------------------------------------------------------------------
union all
select 9, '함수', w.ns || '.' || w.name,
       case when p.oid is null then '★ MISSING' else 'OK' end
  from want_func w
  left join pg_namespace n on n.nspname = w.ns
  left join pg_proc p on p.proname = w.name and p.pronamespace = n.oid

-- 7) anon 권한 — public_animal 만 열려 있어야 합니다 ----------------------------------
union all
select 10, 'anon 실행권한', p.proname,
       case when p.proname = 'public_animal' then
              case when has_function_privilege('anon', p.oid, 'execute') then 'OK (익명 공개용)'
                   else '★ 막혀 있습니다 — 공개 개체 카드가 안 뜹니다' end
            when has_function_privilege('anon', p.oid, 'execute') then '★ 익명에게 열려 있습니다'
            else 'OK' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_animal_document','archive_animal_document','my_animal_legal',
                     'assert_cites_transferable','admin_cites_watchlist',
                     'admin_release_legal_lock','public_animal')

-- 8) 서류 보관함 — 공개면 주소만 알아도 열립니다 ---------------------------------------------
union all
select 11, '버킷', id,
       case when public then '★ 공개 버킷입니다' else 'OK' end
  from storage.buckets
 where id ilike '%doc%'

order by 순, 대상;


-- ##############################################################################
-- 2부 — 위 표에 ★ 가 없을 때만. 실제 데이터를 셉니다.
-- -----------------------------------------------------------------------------
-- 미적용 상태에서 돌리면 'relation does not exist' 로 멈추므로 주석으로 둡니다.
-- ##############################################################################

-- select 'CITES 로 표시된 개체' as 검사, legal_status as 구분, count(*)::text as 값
--   from public.animals
--  where coalesce(legal_status, 'none') <> 'none'
--  group by legal_status
-- union all
-- select '서류가 걸린 개체', '유효', count(distinct animal_id)::text
--   from public.animal_documents where archived_at is null
-- union all
-- select '잠금', '잠김', count(*) filter (where released_at is null)::text
--   from public.animal_legal_locks
-- union all
-- select '잠금', '해제됨', count(*) filter (where released_at is not null)::text
--   from public.animal_legal_locks;


-- =============================================================================
-- 3부 — 손으로 해 볼 것. 조회로는 확인이 안 됩니다.
-- -----------------------------------------------------------------------------
-- ① 서류 없이 공개가 막히는가
--    스테이징에서 개체 하나를 cites_ii 로 바꾸고, 케어 화면에서 공개를 켜
--    보세요. 거절되어야 합니다.
--
-- ② 개체 이름만 바꿔도 서류가 남는가
--    ①의 개체에 서류를 하나 올린 뒤, 이름만 고쳐 저장해 보세요. 서류가 그대로
--    있어야 합니다. save_row 의 delete + 재insert 때문에 여기서 사라지면 FK 나
--    cascade 가 어딘가 남아 있는 것입니다. 위 5번 검사가 OK 여도, 실제로
--    돌려 봐야 아는 부분입니다.
-- =============================================================================
