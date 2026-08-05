/* =============================================================================
   v37 — 성장 단계 · 부모 역할 검증 · 공개 프로필 확장
   적용일: 2026-08-03
   ============================================================================= */

begin;

/* 기존 혈통에 부모로 이미 연결된 개체는 성체로 보존하고, 나머지 기존 개체는
   안전한 초기값인 베이비(미구분)로 시작합니다. */
alter table public.animals add column if not exists life_stage text;
update public.animals as parent
   set life_stage = 'adult'
 where parent.life_stage is null
   and exists (
     select 1 from public.animals child
      where child.parent_a = parent.id or child.parent_b = parent.id
   );
update public.animals set life_stage = 'baby_unknown' where life_stage is null;
alter table public.animals alter column life_stage set default 'baby_unknown';
alter table public.animals alter column life_stage set not null;
alter table public.animals drop constraint if exists animals_life_stage_ck;
alter table public.animals add constraint animals_life_stage_ck
  check (life_stage in ('baby_unknown','juvenile','subadult','adult'));

/* 혈통은 부=성체 수컷, 모=성체 암컷만 허용합니다. 같은 소유자·같은 종의
   개체만 연결해 security-definer 저장 RPC를 통한 교차 계정 연결도 차단합니다. */
create or replace function public.care_animal_parent_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.parent_a is not null and new.parent_a = new.parent_b then
    raise exception 'CARE_PARENT_DUPLICATE';
  end if;
  if new.parent_a = new.id or new.parent_b = new.id then
    raise exception 'CARE_PARENT_SELF';
  end if;
  if new.parent_a is not null and not exists (
    select 1 from public.animals p
     where p.id = new.parent_a and p.sex = 'male' and p.life_stage = 'adult'
       and (case when p.species = 'leopard' then 'gecko' else p.species end)
           = (case when new.species = 'leopard' then 'gecko' else new.species end)
       and p.user_id is not distinct from new.user_id
       and (new.user_id is not null or p.device = new.device)
  ) then
    raise exception 'CARE_SIRE_INVALID';
  end if;
  if new.parent_b is not null and not exists (
    select 1 from public.animals p
     where p.id = new.parent_b and p.sex = 'female' and p.life_stage = 'adult'
       and (case when p.species = 'leopard' then 'gecko' else p.species end)
           = (case when new.species = 'leopard' then 'gecko' else new.species end)
       and p.user_id is not distinct from new.user_id
       and (new.user_id is not null or p.device = new.device)
  ) then
    raise exception 'CARE_DAM_INVALID';
  end if;
  return new;
end $$;
revoke all on function public.care_animal_parent_guard() from public, anon, authenticated;
drop trigger if exists care_animal_parent_guard on public.animals;
create trigger care_animal_parent_guard
  before insert or update of parent_a, parent_b, user_id, device, species on public.animals
  for each row execute function public.care_animal_parent_guard();

/* 페어링도 동일한 성체·성별 규칙을 서버에서 최종 확인합니다. 레오파드의
   관리 코드 gecko와 개체 코드 leopard는 같은 종으로 정규화합니다. */
create or replace function public.care_pairing_parent_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.male is not null and new.male = new.female then
    raise exception 'CARE_PAIRING_DUPLICATE';
  end if;
  if new.male is not null and not exists (
    select 1 from public.animals a
     where a.id = new.male and a.sex = 'male' and a.life_stage = 'adult'
       and (case when a.species = 'leopard' then 'gecko' else a.species end) = new.species
       and a.user_id is not distinct from new.user_id
       and (new.user_id is not null or a.device = new.device)
  ) then
    raise exception 'CARE_PAIRING_MALE_INVALID';
  end if;
  if new.female is not null and not exists (
    select 1 from public.animals a
     where a.id = new.female and a.sex = 'female' and a.life_stage = 'adult'
       and (case when a.species = 'leopard' then 'gecko' else a.species end) = new.species
       and a.user_id is not distinct from new.user_id
       and (new.user_id is not null or a.device = new.device)
  ) then
    raise exception 'CARE_PAIRING_FEMALE_INVALID';
  end if;
  return new;
end $$;
revoke all on function public.care_pairing_parent_guard() from public, anon, authenticated;
drop trigger if exists care_pairing_parent_guard on public.pairings;
create trigger care_pairing_parent_guard
  before insert or update of male, female, user_id, device, species on public.pairings
  for each row execute function public.care_pairing_parent_guard();

/* 공개 카드: 공개 체중을 선택한 경우에만 최근 30회 이력을 시간순으로 반환합니다.
   부모 사진은 그 부모 개체 자체도 공개 상태일 때만 반환합니다. */
create or replace function public.public_animal(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.animals;
        nick text;
        parent jsonb;
        latest_weight jsonb;
        weight_history jsonb := '[]'::jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then return null; end if;
  select * into a from public.animals
   where share_token = p_token and is_public = true;
  if not found then return null; end if;

  if a.public_breeder then
    select nullif(btrim(coalesce(p.nickname, '')), '') into nick
      from public.profiles p where p.user_id = a.user_id;
  end if;

  select coalesce(jsonb_object_agg(side, info), '{}'::jsonb) into parent
    from (
      select s.side, jsonb_build_object(
        'name', p.name, 'morphs', p.morphs, 'hets', p.hets,
        'token', case when p.is_public then p.share_token else null end,
        'photo', case when p.is_public then coalesce(p.photo_url, (p.photos)[1]) else null end
      ) as info
      from (values ('a', a.parent_a), ('b', a.parent_b)) as s(side, pid)
      join public.animals p on p.id = s.pid and p.user_id = a.user_id
    ) q;

  if a.public_weight then
    select coalesce(jsonb_agg(jsonb_build_object(
      'grams', w.grams, 'measured_on', w.measured_on
    ) order by w.measured_on, w.measured_at), '[]'::jsonb)
      into weight_history
      from (
        select grams, measured_on, measured_at
          from public.weight_logs
         where animal_id = a.id and user_id = a.user_id
         order by measured_on desc, measured_at desc
         limit 30
      ) w;
    if jsonb_array_length(weight_history) > 0 then
      latest_weight := weight_history -> (jsonb_array_length(weight_history) - 1);
    end if;
  end if;

  return jsonb_build_object(
    'name', a.name, 'species', a.species, 'sex', a.sex,
    'life_stage', a.life_stage, 'hatch_date', a.hatch_date,
    'morphs', coalesce(a.morphs, '{}'), 'hets', coalesce(a.hets, '{}'),
    'photo_url', a.photo_url, 'photos', coalesce(a.photos, '{}'),
    'note', a.public_note, 'breeder', nick,
    'parents', coalesce(parent, '{}'::jsonb), 'clutch', a.clutch_label,
    'latest_weight', latest_weight, 'weight_history', weight_history
  );
end $$;
revoke all on function public.public_animal(text) from public;
grant execute on function public.public_animal(text) to anon, authenticated;

/* 브리더 공개 페이지: 브리더명 공개를 켠 개체 토큰이 입구입니다. 같은 소유자의
   공개+목록 허용 개체만 페이지 단위로 반환하며 사육 기록은 포함하지 않습니다. */
create or replace function public.public_breeder_profile(
  p_token text,
  p_species text default null,
  p_limit integer default 36,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare owner_id uuid;
        nick text;
        total_count integer;
        animal_rows jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then return null; end if;
  select a.user_id, nullif(btrim(coalesce(p.nickname, '')), '')
    into owner_id, nick
    from public.animals a
    join public.profiles p on p.user_id = a.user_id
   where a.share_token = p_token and a.is_public = true and a.public_breeder = true;
  if not found or nick is null then return null; end if;

  select count(*)::integer into total_count
    from public.animals a
   where a.user_id = owner_id and a.is_public = true and a.is_listed = true
     and a.share_token is not null
     and (nullif(btrim(coalesce(p_species, '')), '') is null or a.species = p_species);

  select coalesce(jsonb_agg(item), '[]'::jsonb) into animal_rows from (
    select jsonb_build_object(
      'token', a.share_token, 'name', a.name, 'species', a.species,
      'sex', a.sex, 'life_stage', a.life_stage,
      'morphs', coalesce(a.morphs, '{}'), 'hets', coalesce(a.hets, '{}'),
      'photo', coalesce(a.photo_url, (a.photos)[1])
    ) as item
      from public.animals a
     where a.user_id = owner_id and a.is_public = true and a.is_listed = true
       and a.share_token is not null
       and (nullif(btrim(coalesce(p_species, '')), '') is null or a.species = p_species)
     order by a.created_at desc, a.id
     limit greatest(1, least(coalesce(p_limit, 36), 60))
     offset greatest(0, coalesce(p_offset, 0))
  ) q;

  return jsonb_build_object('breeder', nick, 'total', total_count, 'animals', animal_rows);
end $$;
revoke all on function public.public_breeder_profile(text,text,integer,integer) from public;
grant execute on function public.public_breeder_profile(text,text,integer,integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

select life_stage, count(*) from public.animals group by life_stage order by life_stage;
select routine_name from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('public_animal','public_breeder_profile');
