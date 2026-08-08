-- =============================================================================
-- v64 손 검증 — 아무것도 남기지 않습니다
-- -----------------------------------------------------------------------------
-- v64 는 DB 만 들어갔고 화면이 아직 없습니다. legal_status 를 고를 자리가
-- 없어서 손 검증을 할 수 없었습니다. 화면이 붙기 전까지는 여기서 합니다.
--
-- ✅ 이 파일은 통째로 rollback 으로 끝납니다.
--    잠금도, 서류도, 공개 상태도 남지 않습니다. 프로덕션에서 실수로 돌려도
--    데이터가 바뀌지 않습니다. 그래도 스테이징을 권합니다.
--
--    (처음 판은 update 를 그냥 나열해서, 중간에 멈추면 CITES 잠금이 남을 수
--     있었습니다. 잠금은 관리자 함수 없이는 못 풀고 서류는 delete 정책이 없어
--     지워지지도 않습니다. 되돌릴 수 없는 것을 검증용으로 만들면 안 됩니다.)
--
-- 쓰는 법
--    아래 v_animal 한 곳만 개체 id 로 바꾸고, 파일 전체를 한 번에 실행하세요.
--    결과가 표 하나로 나옵니다. 판정에 ★ 가 없으면 통과입니다.
--
-- 확인하는 것
--    ① 서류 없이 공개하려 하면 거절되는가
--    ② 개체 줄을 지웠다 넣어도 서류와 잠금이 남는가   ← v65 를 막고 있는 것
-- =============================================================================

-- 개체 id 를 모르시면 이것만 먼저 돌려 보세요.
--   select id, name, species, legal_status from public.animals
--    order by created_at desc limit 10;

begin;

create temp table _r (순 int, 검사 text, 기대 text, 판정 text) on commit drop;

do $check$
declare
  -- ▼▼▼ 여기 한 곳만 바꾸세요 ▼▼▼
  v_raw  text := '여기에-개체-id';
  -- ▲▲▲ ------------------- ▲▲▲
  v_animal uuid;
  v_owner  uuid;
  n int;
begin
  /* 자리표시자를 안 바꾸고 돌린 경우를 먼저 잡습니다. 캐스트 에러가 그대로
     나면 무엇을 하라는 것인지 알기 어렵습니다. */
  begin
    v_animal := v_raw::uuid;
  exception when others then
    insert into _r values (0, '개체 id', '실제 id',
      '★ 위 v_raw 를 개체 id 로 바꾸고 다시 실행하세요');
    return;
  end;

  select user_id into v_owner from public.animals where id = v_animal;
  if not found then
    insert into _r values (0, '개체 id', '존재하는 개체', '★ 그런 개체가 없습니다');
    return;
  end if;
  insert into _r values (0, '시험 개체', v_raw, 'OK');

  -- ① ------------------------------------------------------------------------
  -- 1-1. CITES 로 표시. 표시 자체는 막지 않습니다 — 막는 것은 '남에게 보이는 것'.
  update public.animals set legal_status = 'cites_ii' where id = v_animal;

  select count(*) into n from public.animal_legal_locks
   where animal_id = v_animal and released_at is null;
  insert into _r values (1, '표시하면 잠기는가', '잠금 1건',
    case when n = 1 then 'OK' else '★ 잠금이 안 걸렸습니다 (' || n || '건)' end);

  -- 1-2. 서류 없이 공개 → 거절되어야 합니다.
  begin
    update public.animals set is_public = true where id = v_animal;
    insert into _r values (2, '서류 없이 공개', '거절', '★ 통과됐습니다 — 막혔어야 합니다');
  exception when others then
    insert into _r values (2, '서류 없이 공개', '거절', 'OK — ' || sqlerrm);
  end;

  -- 1-3. 분양 갤러리도 같이 막히는가.
  begin
    update public.animals set is_listed = true where id = v_animal;
    insert into _r values (3, '서류 없이 갤러리 노출', '거절', '★ 통과됐습니다');
  exception when others then
    insert into _r values (3, '서류 없이 갤러리 노출', '거절', 'OK — ' || sqlerrm);
  end;

  -- 1-4. 일반으로 되돌리기 → 막혀야 합니다.
  begin
    update public.animals set legal_status = 'none' where id = v_animal;
    insert into _r values (4, 'CITES 강등', '거절', '★ 되돌려졌습니다 — 막혔어야 합니다');
  exception when others then
    insert into _r values (4, 'CITES 강등', '거절', 'OK — ' || sqlerrm);
  end;

  -- ② ------------------------------------------------------------------------
  -- 2-1. 서류를 하나 올립니다. 실제 파일은 없어도 됩니다 — 보려는 것은 줄입니다.
  insert into public.animal_documents
         (animal_id, user_id, doc_kind, doc_number, issued_on, file_path)
  values (v_animal, v_owner, 'cites_import', 'TEST-0001', current_date,
          'd/u_' || v_owner::text || '_test.pdf');

  -- 2-2. 서류가 생겼으니 이제 공개가 되어야 합니다.
  begin
    update public.animals set is_public = true where id = v_animal;
    insert into _r values (5, '서류 갖추고 공개', '통과', 'OK');
  exception when others then
    insert into _r values (5, '서류 갖추고 공개', '통과', '★ 막혔습니다 — ' || sqlerrm);
  end;

  -- 2-3. ★★ 본 검사. save_row 는 개체를 고칠 때 같은 id 로 delete 후 insert
  --      합니다(supabase_v54). 서류가 cascade 로 매달려 있으면 이름만 바꿔도
  --      통째로 사라집니다. save_row 를 직접 부르지 않는 이유는 그 함수가
  --      auth.uid() 로 소유자를 확인하는데 SQL Editor 에는 JWT 가 없어서입니다.
  delete from public.animals where id = v_animal;

  select count(*) into n from public.animal_documents
   where animal_id = v_animal and archived_at is null;
  insert into _r values (6, '개체 삭제 후 서류', '1건 남음',
    case when n = 1 then 'OK — 살아남았습니다'
         else '★ 사라졌습니다 (' || n || '건) — cascade 가 어딘가 있습니다' end);

  select count(*) into n from public.animal_legal_locks
   where animal_id = v_animal and released_at is null;
  insert into _r values (7, '개체 삭제 후 잠금', '1건 남음',
    case when n = 1 then 'OK'
         else '★ 사라졌습니다 — 지웠다 넣는 것만으로 강등이 됩니다' end);
end
$check$;

select 순, 검사, 기대, 판정 from _r order by 순;

-- 여기서 전부 되돌립니다. 위 select 의 결과만 남고 데이터는 그대로입니다.
rollback;


-- =============================================================================
-- 되돌아갔는지 확인하고 싶으면 — 위와 따로 실행하세요
-- -----------------------------------------------------------------------------
-- 둘 다 0 이어야 합니다(원래 CITES 개체를 쓰고 계신 게 아니라면).
--
--   select (select count(*) from public.animal_legal_locks) as 잠금,
--          (select count(*) from public.animal_documents)   as 서류;
-- =============================================================================
