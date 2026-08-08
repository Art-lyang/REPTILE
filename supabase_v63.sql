-- =============================================================================
-- v63 · 부모로 쓰이는 개체의 종·성별·성장 단계를 잠급니다
-- -----------------------------------------------------------------------------
-- 무엇이 잘못되어 있었나
--   v37 의 care_animal_parent_guard 는 '자식을 저장할 때' 부모 자격을 봅니다.
--   부=성체 수컷, 모=성체 암컷, 그리고 같은 종. 여기까지는 맞습니다.
--
--   그런데 검사가 자식 쪽에서만 일어납니다. 어미를 연결해 둔 뒤에 그 어미를
--   열어서 종을 '기타' 로 바꾸면, 아무도 막지 않습니다. 실제로 레오파드 새끼의
--   어미가 기타로 앉아 있는 상태가 나왔습니다. 성별과 성장 단계도 같습니다 —
--   어미를 수컷으로, 또는 베이비로 바꿔도 그대로 저장됩니다.
--
-- 어떻게 막는가
--   반대 방향 검사를 하나 더 답니다. 종·성별·성장 단계가 바뀔 때, 이 개체를
--   부모로 걸어 둔 자식이 있는지 보고 있으면 거절합니다.
--
--   '자식이 있으면 무조건 거절' 이 아니라 '바꾼 값이 자식과 안 맞으면 거절'
--   입니다. 레오파드 어미를 레오파드로 다시 저장하는 것 같은 무해한 저장까지
--   막으면, 이름만 고치려던 사람이 막힙니다.
--
--   v37 과 같은 규칙으로 종을 정규화합니다 — 레오파드의 관리 코드 gecko 와
--   개체 코드 leopard 는 같은 종입니다.
--
-- 되돌리기
--   drop trigger care_animal_child_guard on public.animals;
-- =============================================================================

create or replace function public.care_animal_child_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  /* 부모 자격을 이루는 세 값이 그대로면 볼 것이 없습니다. 이름·메모만 고친
     저장이 훨씬 잦으므로, 여기서 먼저 빠져나가는 편이 낫습니다. */
  if new.species    is not distinct from old.species
 and new.sex        is not distinct from old.sex
 and new.life_stage is not distinct from old.life_stage then
    return new;
  end if;

  /* 아비로 걸린 자식 */
  if exists (
    select 1 from public.animals c
     where c.parent_a = new.id
       and (new.sex is distinct from 'male'
         or new.life_stage is distinct from 'adult'
         or (case when new.species = 'leopard' then 'gecko' else new.species end)
            is distinct from
            (case when c.species = 'leopard' then 'gecko' else c.species end))
  ) then
    raise exception 'CARE_PARENT_IN_USE_SIRE';
  end if;

  /* 어미로 걸린 자식 */
  if exists (
    select 1 from public.animals c
     where c.parent_b = new.id
       and (new.sex is distinct from 'female'
         or new.life_stage is distinct from 'adult'
         or (case when new.species = 'leopard' then 'gecko' else new.species end)
            is distinct from
            (case when c.species = 'leopard' then 'gecko' else c.species end))
  ) then
    raise exception 'CARE_PARENT_IN_USE_DAM';
  end if;

  return new;
end $$;

revoke all on function public.care_animal_child_guard() from public, anon, authenticated;

drop trigger if exists care_animal_child_guard on public.animals;
create trigger care_animal_child_guard
  before update of species, sex, life_stage on public.animals
  for each row execute function public.care_animal_child_guard();


-- 확인 -----------------------------------------------------------------------
-- 이미 어긋나 있는 개체가 있는지 봅니다. 트리거는 앞으로를 막을 뿐이라,
-- 지금 틀어져 있는 것은 손으로 고치셔야 합니다.
select c.id   as child_id,
       c.name as child_name,
       c.species as child_species,
       p.name as parent_name,
       p.species as parent_species,
       p.sex, p.life_stage,
       case when c.parent_a = p.id then '부' else '모' end as side
  from public.animals c
  join public.animals p on p.id in (c.parent_a, c.parent_b)
 where (case when p.species = 'leopard' then 'gecko' else p.species end)
       is distinct from
       (case when c.species = 'leopard' then 'gecko' else c.species end)
    or p.life_stage is distinct from 'adult'
    or (c.parent_a = p.id and p.sex is distinct from 'male')
    or (c.parent_b = p.id and p.sex is distinct from 'female');

-- 위 목록이 비어 있으면 끝입니다. 줄이 나오면 그 부모의 종·성별·단계를
-- 자식에 맞게 되돌리시거나, 자식의 부모 연결을 지우시면 됩니다.
-- (도도 → 레오파드 게코 · 암컷 · 성체 로 되돌리는 식입니다.)
