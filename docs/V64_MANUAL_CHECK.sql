-- =============================================================================
-- v64 손 검증 — 화면 없이 SQL 로만
-- -----------------------------------------------------------------------------
-- v64 는 DB 만 들어갔고 화면이 아직 없습니다. legal_status 를 고를 자리가
-- 없어서 손 검증을 할 수 없었습니다. 화면이 붙기 전까지는 여기서 합니다.
--
-- ⚠️ 스테이징에서, 버려도 되는 개체로 하세요.
--    CITES 로 표시하는 순간 animal_legal_locks 에 잠금이 걸리고, 그 뒤로는
--    일반으로 되돌릴 수 없습니다(CITES_DOWNGRADE_BLOCKED). 되돌리려면 맨 아래
--    admin_release_legal_lock 을 써야 합니다.
--
-- ⚠️ save_row 를 부르지 않습니다.
--    save_row(p_device, p_table, p_row) 는 auth.uid() 로 소유자를 확인하는데,
--    SQL Editor 에는 JWT 가 없어 그 값이 NULL 입니다. 즉 여기서 부르면 앱과
--    다른 길로 갑니다. 대신 save_row 가 하는 일(같은 id 로 delete 후 insert)을
--    직접 재현하고, 트랜잭션을 되돌립니다.
--
-- 확인하려는 것 둘
--   ① 서류 없이 공개하려 하면 거절되는가
--   ② 개체 줄을 지웠다 넣어도 서류가 남는가   ← v65 를 막고 있는 것
-- =============================================================================


-- 0) 시험용 개체 고르기 -------------------------------------------------------------
-- id 하나를 골라, 아래 나오는 '여기에-개체-id' 를 전부 그것으로 바꾸세요.
select id, name, species, is_public, is_listed, legal_status
  from public.animals
 order by created_at desc
 limit 10;


-- =============================================================================
-- ① 서류 없이 공개가 막히는가
-- -----------------------------------------------------------------------------
-- 한 줄씩 따로 실행하세요. 3·4·5 번은 '에러가 나는 것' 이 정답입니다.
-- =============================================================================

-- 1-1. CITES 로 표시. 여기서 잠금이 걸립니다.
--      표시 자체는 막지 않습니다 — 막는 것은 '남에게 보이는 것' 입니다.
update public.animals set legal_status = 'cites_ii' where id = '여기에-개체-id';

-- 1-2. 잠금이 걸렸는지 (1줄 나와야 정상)
select animal_id, locked_status, locked_at, released_at
  from public.animal_legal_locks where animal_id = '여기에-개체-id';

-- 1-3. ★ 서류 없이 공개 → CITES_DOCS_REQUIRED 가 나야 정상
update public.animals set is_public = true where id = '여기에-개체-id';

-- 1-4. ★ 분양 갤러리도 → CITES_DOCS_REQUIRED 가 나야 정상
update public.animals set is_listed = true where id = '여기에-개체-id';

-- 1-5. ★ 되돌리기 → CITES_DOWNGRADE_BLOCKED 가 나야 정상
update public.animals set legal_status = 'none' where id = '여기에-개체-id';


-- =============================================================================
-- ② 개체 줄을 지웠다 넣어도 서류가 남는가   ← 핵심
-- -----------------------------------------------------------------------------
-- save_row 는 개체를 고칠 때 같은 id 로 delete 후 insert 합니다(supabase_v54).
-- 서류가 cascade 로 매달려 있으면 이름만 바꿔도 통째로 사라집니다. v64 는
-- 그래서 FK 를 뺐는데, 선언된 FK 말고 다른 경로가 없는지는 돌려 봐야 압니다.
-- =============================================================================

-- 2-1. 서류를 하나 올립니다. file_path 형식이 정해져 있습니다
--      ('d/u_' + 소유자uuid + '_' + 파일명). 실제 파일은 없어도 됩니다 —
--      여기서 보려는 것은 줄이 살아남는지이지 파일이 아닙니다.
insert into public.animal_documents
       (animal_id, user_id, doc_kind, doc_number, issued_on, file_path)
select a.id, a.user_id, 'cites_import', 'TEST-0001', current_date,
       'd/u_' || a.user_id::text || '_test.pdf'
  from public.animals a
 where a.id = '여기에-개체-id';

-- 2-2. 서류가 갖춰졌으니 이제 공개가 되는지. ①에서 막혔던 것이 통과해야 합니다.
update public.animals set is_public = true where id = '여기에-개체-id';

-- 2-3. ★★ 본 검사. 통째로 한 번에 실행하세요.
--      아무것도 남기지 않습니다 — 맨 끝에서 되돌립니다.
begin;

  create temp table _snap on commit drop as
    select * from public.animals where id = '여기에-개체-id';

  -- save_row 가 하는 것과 같은 순서
  delete from public.animals where id = '여기에-개체-id';

  -- 이 순간 서류가 살아 있는지가 전부입니다
  select count(*) as 서류_개체삭제직후,
         case when count(*) = 1 then 'OK — 살아남았습니다'
              else '★ 사라졌습니다 — cascade 가 어딘가 있습니다' end as 판정
    from public.animal_documents
   where animal_id = (select id from _snap) and archived_at is null;

  -- 잠금도 함께 확인합니다. 이것이 사라지면 CITES 개체를 지웠다 넣는 것만으로
  -- 일반 개체로 되돌릴 수 있게 됩니다 — 강등 차단이 통째로 뚫립니다.
  select count(*) as 잠금_개체삭제직후,
         case when count(*) = 1 then 'OK'
              else '★ 잠금이 사라졌습니다 — 강등 차단이 뚫립니다' end as 판정
    from public.animal_legal_locks
   where animal_id = (select id from _snap) and released_at is null;

rollback;

-- 2-4. 되돌아왔는지 확인 (1줄 나와야 정상)
select id, name, legal_status, is_public
  from public.animals where id = '여기에-개체-id';

-- 2-5. 서류도 그대로인지
select count(*) as 서류_되돌린뒤
  from public.animal_documents
 where animal_id = '여기에-개체-id' and archived_at is null;


-- =============================================================================
-- 뒷정리 — 관리자 계정으로
-- =============================================================================

-- select public.admin_release_legal_lock('여기에-개체-id', '검증 후 정리');
--
-- update public.animals set legal_status = 'none', is_public = false, is_listed = false
--  where id = '여기에-개체-id';
--
-- 서류는 지울 수 없습니다(설계상 delete 정책이 없습니다). 보관 처리만 됩니다.
-- select public.archive_animal_document(id) from public.animal_documents
--  where animal_id = '여기에-개체-id';
