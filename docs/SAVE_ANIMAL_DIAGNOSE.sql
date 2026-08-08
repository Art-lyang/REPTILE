-- =============================================================================
-- 개체 저장 실패 진단 — 아무것도 남기지 않습니다
-- -----------------------------------------------------------------------------
-- 화면의 '입력한 정보를 저장할 수 없습니다' 는 서버가 준 에러를 감싼 문구라
-- 원인이 안 보입니다. save_row 가 실제로 하는 일을 그대로 재현해서 진짜
-- 에러 메시지를 꺼냅니다.
--
-- ✅ 통째로 rollback 으로 끝납니다. 개체가 생기지 않습니다.
--
-- 그대로 실행하세요. 고칠 것 없습니다.
-- =============================================================================

begin;

create temp table _d (순 int, 단계 text, 결과 text) on commit drop;

do $diag$
declare
  u uuid;
  payload jsonb;
  newid uuid;
  n int;
begin
  -- 어떤 계정으로든 하나 잡습니다. 실제 저장과 같은 조건을 만들려는 것뿐입니다.
  select user_id into u from public.animals where user_id is not null limit 1;
  if u is null then
    select id into u from auth.users limit 1;
  end if;
  insert into _d values (0, '시험 계정', coalesce(u::text, '★ 없음'));
  if u is null then return; end if;

  /* 화면이 보내는 것과 같은 모양입니다(care-animal-form.js values()).
     legal_status 는 화면이 아직 안 보냅니다 — 그게 문제인지도 여기서 드러납니다. */
  payload := jsonb_build_object(
    'id', gen_random_uuid(),
    'user_id', u,
    'device', 'u_' || u::text,          -- save_row 가 채우는 값
    'created_at', now(),
    -- 여기부터가 화면이 실제로 보내는 것 (care-app.js saveAnimal)
    'name', '진단용-지워짐',
    'species', 'other',
    'sex', 'unknown',
    'life_stage', 'baby_unknown',
    'hatch_date', null,
    'clutch_label', null,
    'note', null,
    'is_public', false,
    'is_listed', false,
    'public_breeder', false,
    'public_weight', false,
    'line_trait_scores', '{}'::jsonb);

  -- 1) save_row 가 하는 insert 를 그대로
  begin
    insert into public.animals
    select * from jsonb_populate_record(null::public.animals, payload)
    returning id into newid;
    insert into _d values (1, 'insert (save_row 방식)', 'OK — ' || newid::text);
  exception when others then
    insert into _d values (1, 'insert (save_row 방식)',
      '★ ' || sqlstate || ' · ' || sqlerrm);
    return;
  end;

  -- 2) 방금 넣은 줄의 새 칸들이 어떤 값인지
  select count(*) into n from public.animals
   where id = newid and legal_status is null;
  insert into _d values (2, 'legal_status 값',
    coalesce((select legal_status from public.animals where id = newid), '(null)')
    || case when n = 1 then '  ← 기본값이 안 먹었습니다(정상, select * 라서)' else '' end);

  -- 3) 그 상태로 공개를 켜 보기 (CITES 문지기가 null 을 어떻게 보는지)
  begin
    update public.animals set is_public = true where id = newid;
    insert into _d values (3, 'null 상태에서 공개', 'OK — 막지 않습니다');
  exception when others then
    insert into _d values (3, 'null 상태에서 공개', '★ ' || sqlstate || ' · ' || sqlerrm);
  end;

  -- 3-b) 화면이 안 보내는 NOT NULL 칸을 하나씩 더해 보며 어디서 통과하는지
  --      (1번이 실패했을 때만 뜻이 있습니다)

  -- 4) 수정 경로(save_row 는 delete 후 재insert)
  begin
    delete from public.animals where id = newid;
    insert into public.animals
    select * from jsonb_populate_record(null::public.animals,
      payload || jsonb_build_object('name', '진단용-이름변경'));
    insert into _d values (4, '수정(delete+insert)', 'OK');
  exception when others then
    insert into _d values (4, '수정(delete+insert)', '★ ' || sqlstate || ' · ' || sqlerrm);
  end;
end
$diag$;

-- 5) animals 에 걸린 트리거 전부 (v64 가 넣은 것 포함)
insert into _d
select 5, '트리거', tgname || '  (' ||
       case tgenabled when 'O' then '켜짐' when 'D' then '꺼짐' else tgenabled::text end || ')'
  from pg_trigger
 where tgrelid = 'public.animals'::regclass and not tgisinternal;

-- 6) animals 의 not null 칸 중 기본값이 있는 것 — save_row 의 select * 는
--    기본값을 안 씁니다. 여기 나오는 칸이 있으면 그게 원인입니다.
insert into _d
select 6, 'NOT NULL + 기본값 칸', column_name || ' (기본 ' || coalesce(column_default,'없음') || ')'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals'
   and is_nullable = 'NO' and column_default is not null;

-- 7) animals 의 CHECK 제약
insert into _d
select 7, 'CHECK 제약', conname || '  ' || pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.animals'::regclass and contype = 'c';

select 순, 단계, 결과 from _d order by 순, 결과;

rollback;
