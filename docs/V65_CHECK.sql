-- =============================================================================
-- v65 적용 확인 — 읽기 전용, 한 번에 한 표로
-- -----------------------------------------------------------------------------
-- supabase_v65.sql(양도·양수)을 실행한 뒤 이 파일을 통째로 실행하세요.
-- 아무것도 만들지도 고치지도 않습니다. 표가 없어도 죽지 않습니다.
--
-- 판정 칸에 ★ 가 하나도 없으면 끝입니다.
--
-- ⚠️ 계약 세 가지를 여기서 확인합니다 (plans/transfer-docs-roadmap.md).
--    ① 개체로 향하는 FK 금지 — save_row 가 delete+insert 하므로 cascade 가
--      걸리면 개체 이름만 바꿔도 거래 이력이 사라집니다.
--    ② 소유권을 옮기는 경로가 assert_cites_transferable 을 부를 것 — 안 부르면
--      '공개는 막혔는데 양도는 되는' 두 번째 문이 열립니다.
--    ③ 거래 이력은 지울 수 없을 것 — delete 정책도 delete 권한도 없어야 합니다.
-- =============================================================================

with
want_func(ns, name) as (values
  ('private','pedigree_snapshot'),
  ('public','start_animal_transfer'), ('public','cancel_animal_transfer'),
  ('public','peek_animal_transfer'),  ('public','accept_animal_transfer'),
  ('public','my_animal_transfers'),   ('public','animals_transfer_guard')),
ledger as (
  select c.oid, c.relrowsecurity
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname = 'animal_transfers'),
/* 소유권을 옮기는 두 경로의 본문. 여기에 문지기 호출이 있어야 합니다. */
gate as (
  select p.proname,
         pg_get_functiondef(p.oid) as body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname in ('start_animal_transfer', 'accept_animal_transfer'))

select 1 as 순, '적용 여부' as 검사, 'animal_transfers' as 대상,
       case when exists (select 1 from ledger) then 'OK'
            else '★ 미적용 — supabase_v65.sql 을 먼저 실행하세요' end as 판정

union all
select 2, '개체 칸', 'pedigree_snapshot · transferred_at',
       case when count(*) = 2 then 'OK' else '★ MISSING (' || count(*)::text || '/2)' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals'
   and column_name in ('pedigree_snapshot', 'transferred_at')

union all
select 3, 'RLS', 'animal_transfers',
       case when bool_or(relrowsecurity) then 'OK'
            when count(*) = 0 then '★ 표가 없습니다' else '★ RLS 꺼짐' end
  from ledger

-- ① 개체로 향하는 FK — 없어야 합니다
union all
select 4, '개체로 향하는 FK', '없어야 정상',
       case when count(*) = 0 then 'OK'
            else '★ ' || count(*)::text || '개 — 개체 이름만 바꿔도 거래 이력이 날아갑니다' end
  from pg_constraint
 where contype = 'f'
   and conrelid in (select oid from ledger)
   and confrelid = (select oid from pg_class
                     where relnamespace = 'public'::regnamespace and relname = 'animals')

-- ③ 지울 수 없을 것
union all
select 5, 'delete 정책', '없어야 정상',
       case when count(*) = 0 then 'OK' else '★ ' || count(*)::text || '개 — 이력을 지울 수 있습니다' end
  from pg_policies
 where schemaname = 'public' and tablename = 'animal_transfers' and cmd = 'DELETE'

union all
select 6, 'delete 권한', '아무에게도 없어야 정상',
       case when count(*) = 0 then 'OK'
            else '★ ' || string_agg(grantee, ', ') || ' 에게 열려 있습니다' end
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'animal_transfers' and privilege_type = 'DELETE'

union all
select 7, '정책', tablename, policyname || ' (' || cmd || ')'
  from pg_policies
 where schemaname = 'public' and tablename = 'animal_transfers'

-- 읽기전용 잠금
union all
select 8, '트리거', 'animals_transfer_guard',
       case when exists (select 1 from pg_trigger
                          where tgname = 'animals_transfer_guard' and not tgisinternal)
            then 'OK' else '★ MISSING' end

union all
select 9, '함수', w.ns || '.' || w.name,
       case when p.oid is null then '★ MISSING' else 'OK' end
  from want_func w
  left join pg_namespace n on n.nspname = w.ns
  left join pg_proc p on p.proname = w.name and p.pronamespace = n.oid

-- ② 문지기를 실제로 부르는가 — 이게 가장 중요합니다
union all
select 10, 'CITES 문지기 호출', g.proname,
       case when g.body like '%assert_cites_transferable%' then 'OK'
            else '★ 안 부릅니다 — 서류 없는 CITES 개체도 양도됩니다' end
  from gate g

union all
select 10, 'CITES 문지기 호출', '(함수 없음)',
       case when exists (select 1 from gate) then null else '★ 양도 함수가 없습니다' end
 where not exists (select 1 from gate)

-- anon 은 아무것도 못 해야 합니다
union all
select 11, 'anon 실행권한', p.proname,
       case when has_function_privilege('anon', p.oid, 'execute')
            then '★ 익명에게 열려 있습니다' else 'OK' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.proname in ('start_animal_transfer','cancel_animal_transfer',
                     'peek_animal_transfer','accept_animal_transfer','my_animal_transfers')

order by 순, 대상;


-- ##############################################################################
-- 2부 — 위 표에 ★ 가 없을 때만. 실제 데이터를 셉니다.
-- ##############################################################################

-- select '양도 원장' as 검사, status as 구분, count(*)::text as 값
--   from public.animal_transfers group by status
-- union all
-- select '넘긴 개체', '읽기전용', count(*)::text
--   from public.animals where transferred_at is not null
-- union all
-- select '받은 개체', '스냅샷 있음', count(*)::text
--   from public.animals where pedigree_snapshot is not null;


-- =============================================================================
-- 3부 — 손으로 해 볼 것. 계정이 둘 필요합니다.
-- -----------------------------------------------------------------------------
-- ① 서류 없는 CITES 개체는 양도 발의부터 막히는가
--    개체 하나를 cites_ii 로 두고(서류 없이) 양도를 걸어 보세요.
--    CITES_DOCS_REQUIRED 가 나야 합니다. 이게 v64 와 v65 를 잇는 지점입니다.
--
-- ② 넘긴 뒤 양도자의 자손 족보가 멀쩡한가
--    부모로 쓰인 개체를 넘기고, 그 자식을 열어 보세요. 족보에 부모가 그대로
--    보여야 합니다. 소유권을 옮기지 않는 설계를 고른 이유가 이것입니다.
--
-- ③ 넘긴 개체를 양도자가 고칠 수 없는가
--    이름을 바꿔 저장해 보세요. TRANSFER_READONLY 가 나야 합니다.
--
-- ④ 양수자의 사본에 조상 이름이 들어 있는가
--    받은 개체의 혈통서를 열어 보세요. 부모 링크는 없어도 이름은 있어야 합니다.
-- =============================================================================
