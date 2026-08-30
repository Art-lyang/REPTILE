/* =============================================================================
   v34 — 케어 기록 보존 · 공개 개체 카드 · 날짜 검증
   적용일: 2026-08-03

   - 같은 날 체중을 여러 번 재도 이전 측정값을 보존합니다.
   - 공개 카드에는 소유자가 허용한 최근 체중과 클러치 표기만 추가합니다.
   - 해칭일은 미래 날짜로 저장하지 못하게 서버에서도 막습니다.
   ============================================================================= */

begin;

/* 1. 체중은 수정이 아니라 측정 이력입니다. */
alter table public.weight_logs
  drop constraint if exists weight_logs_animal_id_measured_on_key;
alter table public.weight_logs
  add column if not exists measured_at timestamptz;
update public.weight_logs
   set measured_at = coalesce(measured_at, created_at, measured_on::timestamptz)
 where measured_at is null;
alter table public.weight_logs alter column measured_at set default now();
alter table public.weight_logs alter column measured_at set not null;
create index if not exists weight_logs_animal_measured_idx
  on public.weight_logs(animal_id, measured_on desc, measured_at desc);

/* 2. 공개 여부와 별도로 체중 공개를 명시적으로 선택합니다. */
alter table public.animals add column if not exists public_weight boolean not null default false;
alter table public.animals add column if not exists clutch_label text;
alter table public.animals drop constraint if exists animals_clutch_label_ck;
alter table public.animals add constraint animals_clutch_label_ck
  check (clutch_label is null or char_length(btrim(clutch_label)) between 1 and 80);

/* 3. 현재 시각에 따라 달라지는 검증은 CHECK 대신 쓰기 시점 trigger로 검사합니다. */
create or replace function public.care_animal_hatch_date_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.hatch_date is not null and new.hatch_date > current_date then
    raise exception 'hatch_date cannot be in the future';
  end if;
  return new;
end $$;
revoke all on function public.care_animal_hatch_date_guard() from public, anon, authenticated;
drop trigger if exists care_animal_hatch_date_guard on public.animals;
create trigger care_animal_hatch_date_guard
  before insert or update of hatch_date on public.animals
  for each row execute function public.care_animal_hatch_date_guard();

/* 4. 공개 설정은 본인 행만 변경합니다. p_weight를 생략하면 비공개가 기본입니다. */
create or replace function public.set_animal_share(
  p_id uuid,
  p_public boolean,
  p_note text default null,
  p_breeder boolean default false,
  p_rotate boolean default false,
  p_listed boolean default false,
  p_weight boolean default false
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.animals;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update public.animals
     set is_public      = coalesce(p_public, false),
         is_listed      = coalesce(p_public, false) and coalesce(p_listed, false),
         public_note    = nullif(btrim(coalesce(p_note, '')), ''),
         public_breeder = coalesce(p_breeder, false),
         public_weight  = coalesce(p_public, false) and coalesce(p_weight, false),
         share_token    = case
                            when p_rotate or share_token is null then public.new_share_token()
                            else share_token
                          end
   where id = p_id and user_id = auth.uid()
   returning * into a;
  if not found then raise exception 'not your animal'; end if;
  return jsonb_build_object('ok', true, 'token', a.share_token,
    'is_public', a.is_public, 'is_listed', a.is_listed, 'public_weight', a.public_weight);
end $$;
revoke all on function public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean,boolean) from public;
grant execute on function public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean,boolean) to authenticated;
drop function if exists public.set_animal_share(uuid,boolean,text,boolean,boolean,boolean);

/* 5. 공개 페이지는 이 JSON allowlist 밖의 값을 절대 받지 않습니다. */
create or replace function public.public_animal(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.animals;
        nick text;
        parent jsonb;
        latest_weight jsonb;
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
        'token', case when p.is_public then p.share_token else null end
      ) as info
      from (values ('a', a.parent_a), ('b', a.parent_b)) as s(side, pid)
      join public.animals p on p.id = s.pid and p.user_id = a.user_id
    ) q;

  if a.public_weight then
    select jsonb_build_object('grams', w.grams, 'measured_on', w.measured_on)
      into latest_weight
      from public.weight_logs w
     where w.animal_id = a.id and w.user_id = a.user_id
     order by w.measured_on desc, w.measured_at desc
     limit 1;
  end if;

  return jsonb_build_object(
    'name', a.name, 'species', a.species, 'sex', a.sex,
    'hatch_date', a.hatch_date, 'morphs', coalesce(a.morphs, '{}'),
    'hets', coalesce(a.hets, '{}'), 'photo_url', a.photo_url,
    'photos', coalesce(a.photos, '{}'), 'note', a.public_note,
    'breeder', nick, 'parents', coalesce(parent, '{}'::jsonb),
    'clutch', a.clutch_label, 'latest_weight', latest_weight
  );
end $$;
revoke all on function public.public_animal(text) from public;
grant execute on function public.public_animal(text) to anon, authenticated;

/* 같은 브리더의 '공개+목록 허용' 개체만 토큰 기준으로 좁혀 반환합니다. */
create or replace function public.public_breeder_animals(p_token text, p_limit int default 8)
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (
    select user_id, id from public.animals
     where share_token = p_token and is_public = true and public_breeder = true
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb) from (
    select jsonb_build_object(
      'token', a.share_token, 'name', a.name, 'species', a.species,
      'photo', coalesce(a.photo_url, (a.photos)[1])
    ) item
      from public.animals a join owner o on o.user_id = a.user_id
     where a.id <> o.id and a.is_public = true and a.is_listed = true
       and a.share_token is not null
     order by md5(a.share_token)
     limit greatest(1, least(coalesce(p_limit, 8), 12))
  ) q;
$$;
revoke all on function public.public_breeder_animals(text,integer) from public;
grant execute on function public.public_breeder_animals(text,integer) to anon, authenticated;

/* 새 RPC가 Data API에 즉시 노출되도록 PostgREST 스키마 캐시를 갱신합니다. */
notify pgrst, 'reload schema';

commit;

/* 확인: 미래 해칭일 0건, 중복 날짜는 허용, 공개 함수 2개가 보여야 합니다. */
select count(*) as future_hatch_dates from public.animals where hatch_date > current_date;
select routine_name from information_schema.routines
 where routine_schema = 'public' and routine_name in ('public_animal','public_breeder_animals');
