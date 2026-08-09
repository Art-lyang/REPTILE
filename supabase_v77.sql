-- =============================================================================
-- v77 · 넘긴 개체의 읽기 전용 잠금이 실제로 걸리게
-- -----------------------------------------------------------------------------
-- v65 의 animals_transfer_guard 는 넘긴 개체를 못 고치게 막으려는 것이었는데,
-- 실제로는 안 막힙니다. 화면에서 그냥 이름을 고쳐도 통과합니다.
--
-- 왜 그런가 — save_row 가 고치는 방식 때문입니다(supabase_v54.sql).
--
--     p_row := cur || p_row;          -- ① 지금 줄을 통째로 합칩니다
--     delete from animals where id = …;
--     insert into animals select * from jsonb_populate_record(null::animals, p_row);
--
-- ① 에서 지금 줄이 합쳐지므로 **transferred_at 이 저절로 실립니다.** 화면이
-- 안 보내도 들어갑니다. 그리고 고치는 것이 update 가 아니라 delete + insert
-- 라서, 트리거에는 tg_op = 'INSERT' 로 도착합니다. 그런데 v65 의 검사는
-- 이렇게 되어 있습니다.
--
--     if new.transferred_at is null then raise …            -- ← 실렸으므로 통과
--     if tg_op = 'UPDATE' and (이름·모프·부모가 달라졌으면) raise …  -- ← INSERT 라 건너뜀
--
-- 두 검사를 다 비껴갑니다. 넘긴 개체의 이름·종·모프·부모를 그대로 고칠 수
-- 있습니다.
--
-- 사본을 받은 쪽은 피해가 없습니다. 사본은 값으로 복사됐고 혈통도 스냅샷이라
-- 원본이 바뀌어도 따라 바뀌지 않습니다. 문제는 **양도자 쪽 기록이 더 이상
-- '무엇을 넘겼는지' 를 말해 주지 못한다**는 것입니다. 거래 기록으로 쓸 수
-- 없게 됩니다.
--
-- 고치는 방법 — 넘긴 개체는 insert 자체를 막습니다. 그 id 로 새로 넣는 길은
-- save_row 의 delete + insert 뿐이고, 그건 곧 '고치려는 시도' 입니다.
-- accept_animal_transfer 가 만드는 사본은 새 id 라 걸리지 않습니다.
--
-- ⚠️ delete 는 그대로 둡니다. 회원이 자기 기록을 지울 권리가 먼저입니다
--    (처리방침 6항). 지워도 원장(animal_transfers)은 남아서 거래가 있었다는
--    사실은 사라지지 않습니다.
--
-- 선행: supabase_v65.sql
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.animals_transfer_guard()') is null then
    raise exception E'supabase_v65.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

create or replace function public.animals_transfer_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.animal_transfers
              where animal_id = new.id and status = 'accepted') then

    /* 이미 넘긴 개체입니다. 이 id 로 다시 넣는 길은 save_row 의
       delete + insert 뿐이고, 그건 고치려는 시도입니다. 사본은 새 id 라
       여기 걸리지 않습니다(accept_animal_transfer). */
    if tg_op = 'INSERT' then
      raise exception 'TRANSFER_READONLY' using errcode = '42501';
    end if;

    /* 넘긴 표시가 사라지면 안 됩니다. */
    if new.transferred_at is null then
      raise exception 'TRANSFER_READONLY' using errcode = '42501';
    end if;

    /* 직접 update 로 오는 길도 그대로 막습니다. */
    if new.name       is distinct from old.name or
       new.species    is distinct from old.species or
       new.sex        is distinct from old.sex or
       new.life_stage is distinct from old.life_stage or
       new.morphs     is distinct from old.morphs or
       new.hets       is distinct from old.hets or
       new.parent_a   is distinct from old.parent_a or
       new.parent_b   is distinct from old.parent_b then
      raise exception 'TRANSFER_READONLY' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, 'INSERT 를 막는가' as 검사,
       case when pg_get_functiondef(to_regprocedure('public.animals_transfer_guard()')::oid)
                 like '%tg_op = ''INSERT''%' then 'OK' else '★ 아직 뚫려 있습니다' end as 판정
union all
select 2, 'UPDATE 검사가 tg_op 에 갇혀 있지 않은가',
       case when pg_get_functiondef(to_regprocedure('public.animals_transfer_guard()')::oid)
                 like '%tg_op = ''UPDATE'' and%' then '★ 여전히 갇혀 있습니다' else 'OK' end
union all
select 3, '트리거가 붙어 있는가',
       case when exists (select 1 from pg_trigger
                          where tgname = 'animals_transfer_guard'
                            and tgrelid = 'public.animals'::regclass
                            and not tgisinternal) then 'OK' else '★ MISSING' end
union all
/* 지금 넘긴 개체가 있으면 실제로 막히는지까지 볼 수 있습니다. 없으면 0 입니다. */
select 4, '넘긴 개체 수',
       (select count(*)::text from public.animal_transfers where status = 'accepted')
order by 순;

-- 4번이 0 이면 아직 실제 양도가 없다는 뜻입니다 — 정상입니다.
