-- =============================================================================
-- v65 · 개체 양도·양수
-- -----------------------------------------------------------------------------
-- 설계 근거: plans/transfer-docs-roadmap.md 2-A 절 (2026-08-08 결정)
-- 선행 조건: supabase_v64.sql 적용 + 검증 완료 (구조 11/11, 손 검증 8/8)
--
-- 핵심 — 소유권을 옮기지 않습니다
--   animals.user_id 를 바꾸면 세 가지가 한꺼번에 깨집니다.
--     · animals_own_read(v16) 때문에 양도자가 그 개체를 못 읽습니다.
--     · 그 개체를 부모로 쓴 자손의 족보가 '삭제된 개체' 로 끊깁니다.
--     · save_row(v54) 가 delete+insert 하고 care_animal_parent_guard(v37) 가
--       insert 에도 걸리므로, 양도자의 자손은 이름 한 글자도 못 고치게 됩니다
--       (부모가 남의 것이라 CARE_DAM_INVALID). 아무 잘못 없는 사람이 자기
--       기록을 잃습니다.
--
--   그래서 '복사 + 원본 읽기전용' 으로 갑니다.
--     양수자에게 새 줄(새 id)을 만들어 주고,
--     양도자의 줄은 그대로 두되 '양도됨' 으로 잠급니다.
--
--   양도자 쪽은 아무것도 안 바뀝니다. 스냅샷이 필요한 곳은 양수자의 사본
--   한 줄뿐입니다 — 그 줄의 부모는 양도자 소유라 양수자가 읽을 수 없으니,
--   조상 '이름' 을 값으로 복사해 둡니다. 세대 수는 양도할 때 고릅니다(기본 3).
--
-- ⚠️ 개체로 향하는 FK 를 걸지 않습니다.
--    save_row 가 개체를 고칠 때 delete 후 재insert 하므로, cascade 를 걸면
--    이름만 바꿔도 거래 이력이 통째로 사라집니다. v64 의 animal_documents 가
--    같은 이유로 FK 를 뺐고, 손 검증 6번이 그걸 확인했습니다.
--
-- ⚠️ 읽기전용 잠금도 개체 밖에 둡니다.
--    animals.transferred_at 만 믿으면, save_row 의 delete+insert 때 그 칸을
--    빼고 보내는 것만으로 잠금이 풀립니다. v64 가 animal_legal_locks 를 개체
--    밖에 둔 것과 같은 이유입니다 — 여기서는 원장(animal_transfers) 자체가
--    그 역할을 합니다. 원장은 지울 수 없으니까요.
--
-- 되돌리기
--   drop trigger animals_transfer_guard on public.animals;
--   drop table public.animal_transfers;
--   alter table public.animals drop column pedigree_snapshot, drop column transferred_at;
-- =============================================================================

do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception E'animals 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
  if to_regprocedure('public.assert_cites_transferable(uuid)') is null then
    raise exception E'supabase_v64.sql 을 먼저 실행하세요.\n양도는 CITES 문지기를 거쳐야 합니다.';
  end if;
end $guard$;

begin;

-- 1) 개체에 붙는 칸 ---------------------------------------------------------------
/* pedigree_snapshot 은 링크가 아니라 값입니다. 양수자가 못 읽는 조상의 이름을
   그 시점 그대로 담습니다. 나중에 양도자가 조상 이름을 바꿔도 넘어간 사본은
   그대로여야 합니다 — 혈통서에 찍혀 나간 이름이 뒤늦게 달라지면 안 됩니다.

   transferred_at 은 표시일 뿐입니다. 실제 잠금 판정은 원장을 봅니다. */
alter table public.animals
  add column if not exists pedigree_snapshot jsonb,
  add column if not exists transferred_at timestamptz;


-- 2) 양도 원장 -------------------------------------------------------------------
/* append-only 입니다. RLS 를 켜고 delete 정책을 두지 않습니다 — RLS 는 정책이
   없으면 막으므로, 없는 것이 곧 잠금입니다.

   animal_id 는 참조가 아니라 값입니다(위 머리말 참고). */
create table if not exists public.animal_transfers (
  id            uuid primary key default gen_random_uuid(),
  animal_id     uuid not null,
  from_user     uuid not null,
  to_user       uuid,
  to_animal_id  uuid,
  token         text not null unique,
  status        text not null default 'pending',
  gens          smallint not null default 3,
  note          text,
  price         numeric(12,0),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  cancelled_at  timestamptz,

  constraint animal_transfers_status_ck check (status in ('pending','accepted','cancelled')),
  constraint animal_transfers_gens_ck   check (gens between 1 and 6),
  constraint animal_transfers_note_ck   check (note is null or char_length(note) <= 500),
  constraint animal_transfers_price_ck  check (price is null or price >= 0)
);

create index if not exists animal_transfers_animal_idx on public.animal_transfers (animal_id);
create index if not exists animal_transfers_from_idx   on public.animal_transfers (from_user);
create index if not exists animal_transfers_to_idx     on public.animal_transfers (to_user);

alter table public.animal_transfers enable row level security;

/* 당사자만 봅니다. 가격이 여기 들어 있어서, 제3자가 보면 브리더의 분양가가
   그대로 노출됩니다. QR 을 받은 사람은 아래 RPC 로만 접근합니다. */
drop policy if exists animal_transfers_select on public.animal_transfers;
create policy animal_transfers_select on public.animal_transfers
  for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

/* 쓰기는 아래 정의자 함수로만 합니다. insert/update 정책을 두지 않으므로
   PostgREST 로 직접 두드려도 손댈 수 없습니다. delete 는 말할 것도 없습니다. */


-- 3) 혈통 스냅샷 만들기 ------------------------------------------------------------
/* 조상 이름을 세대별로 담습니다. 자리(slot)를 함께 적어 두어야 어느 쪽 계통인지
   알 수 있습니다 — 짝수가 부, 홀수가 모입니다(care-core.js buildPedigree 와
   같은 규칙). 개체 id 는 담지 않습니다. 양수자가 읽지도 못하는 id 를 들고
   있어 봐야 쓸 데가 없고, 남의 계정 내부를 가리키는 값이 됩니다. */
create or replace function private.pedigree_snapshot(p_animal uuid, p_gens int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  cur uuid[] := array[p_animal];
  nxt uuid[];
  out jsonb := '[]'::jsonb;
  row_names jsonb;
  g int;
  i int;
  a public.animals;
begin
  for g in 1..greatest(1, least(coalesce(p_gens, 3), 6)) loop
    nxt := '{}';
    row_names := '[]'::jsonb;
    for i in 1..coalesce(array_length(cur, 1), 0) loop
      if cur[i] is null then
        nxt := nxt || array[null::uuid, null::uuid];
        row_names := row_names || jsonb_build_array(null, null);
      else
        select * into a from public.animals where id = cur[i];
        nxt := nxt || array[a.parent_a, a.parent_b];
        row_names := row_names || jsonb_build_array(
          (select p.name from public.animals p where p.id = a.parent_a),
          (select p.name from public.animals p where p.id = a.parent_b));
      end if;
    end loop;
    exit when not exists (select 1 from unnest(nxt) x where x is not null);
    out := out || jsonb_build_array(jsonb_build_object('gen', g, 'names', row_names));
    cur := nxt;
  end loop;
  return jsonb_build_object('taken_at', now(), 'gens', jsonb_array_length(out), 'rows', out);
end $$;


-- 4) 양도 발의 -------------------------------------------------------------------
/* 토큰은 QR 에 실립니다. 짧으면 찍어 볼 수 있으니 넉넉하게 잡습니다. */
create or replace function public.start_animal_transfer(
  p_animal uuid, p_gens int default 3, p_note text default null, p_price numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); a public.animals; t text;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into a from public.animals where id = p_animal and user_id = u;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;

  /* 이미 넘긴 개체는 다시 못 넘깁니다. */
  if exists (select 1 from public.animal_transfers
              where animal_id = p_animal and status = 'accepted') then
    raise exception 'ALREADY_TRANSFERRED' using errcode = '42501';
  end if;

  /* ★ v64 의 문지기. 이걸 안 부르면 '공개는 막혔는데 양도는 되는' 두 번째
     문이 열립니다. 서류 없는 CITES 개체는 여기서 막힙니다. */
  perform public.assert_cites_transferable(p_animal);

  /* 발의는 하나만 살려 둡니다. 새로 만들면 이전 것은 취소됩니다 — QR 을 여러
     장 뿌려 놓고 누가 먼저 찍는지 겨루게 두면 안 됩니다. */
  update public.animal_transfers
     set status = 'cancelled', cancelled_at = now()
   where animal_id = p_animal and status = 'pending';

  t := encode(gen_random_bytes(24), 'hex');
  insert into public.animal_transfers (animal_id, from_user, token, gens, note, price)
  values (p_animal, u, t, greatest(1, least(coalesce(p_gens, 3), 6)), p_note, p_price);

  return jsonb_build_object('token', t, 'gens', greatest(1, least(coalesce(p_gens, 3), 6)));
end $$;


-- 5) 양도 취소 -------------------------------------------------------------------
create or replace function public.cancel_animal_transfer(p_animal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.animal_transfers
     set status = 'cancelled', cancelled_at = now()
   where animal_id = p_animal and from_user = u and status = 'pending';
end $$;


-- 6) QR 을 찍은 사람이 보는 것 -------------------------------------------------------
/* 수락 전에 무엇을 받는지 보여 줍니다. 가격과 메모는 당사자 사이의 값이라
   여기서도 내보냅니다 — 토큰을 가진 사람은 이미 양도 상대입니다. */
create or replace function public.peek_animal_transfer(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare tr public.animal_transfers; a public.animals;
begin
  select * into tr from public.animal_transfers where token = p_token;
  if not found then return null; end if;
  select * into a from public.animals where id = tr.animal_id;

  return jsonb_build_object(
    'status', tr.status,
    'gens', tr.gens,
    'note', tr.note,
    'price', tr.price,
    'name', a.name,
    'species', a.species,
    'sex', a.sex,
    'life_stage', a.life_stage,
    'hatch_date', a.hatch_date,
    'morphs', a.morphs,
    'hets', a.hets,
    'legal_status', a.legal_status,
    'mine', (tr.from_user = auth.uid()));
end $$;


-- 7) 양수 ----------------------------------------------------------------------
/* 원자적으로 셋을 합니다.
     ① 양수자 계정에 사본을 만들고 혈통 스냅샷을 넣습니다
     ② 양도자의 줄에 transferred_at 을 찍습니다
     ③ 원장을 accepted 로 닫습니다
   중간에 실패하면 전부 없던 일이 됩니다. */
create or replace function public.accept_animal_transfer(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  tr public.animal_transfers;
  a public.animals;
  newid uuid;
  used int;
  cap int;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into tr from public.animal_transfers where token = p_token for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND' using errcode = '42501'; end if;
  if tr.status <> 'pending' then raise exception 'TRANSFER_CLOSED' using errcode = '42501'; end if;
  if tr.from_user = u then raise exception 'TRANSFER_SELF' using errcode = '42501'; end if;

  select * into a from public.animals where id = tr.animal_id;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;

  /* ★ 수락 시점에 한 번 더 봅니다. 발의한 뒤 서류가 보관 처리될 수 있습니다. */
  perform public.assert_cites_transferable(tr.animal_id);

  /* 양수자의 개체 상한. 정의자 권한으로 남의 계정에 줄을 넣는 것이라, 여기서
     안 세면 상한이 아무 뜻이 없어집니다. */
  select count(*) into used from public.animals where user_id = u;
  cap := private.care_effective_limit(u);
  if cap is not null and used >= cap then
    raise exception 'ANIMAL_LIMIT_REACHED' using errcode = '42501';
  end if;

  /* ① 사본. 부모는 잇지 않습니다 — 양수자가 읽을 수 없는 줄이고, v37 의 부모
     검사도 남의 개체는 거절합니다. 대신 이름 스냅샷을 넣습니다.
     공개 상태는 물려주지 않습니다. 무엇을 남에게 보일지는 새 주인이 정합니다. */
  newid := gen_random_uuid();
  insert into public.animals (
    id, user_id, name, species, sex, life_stage, hatch_date, clutch_label,
    morphs, hets, note, legal_status, legal_ref,
    pedigree_snapshot, is_public, is_listed)
  values (
    newid, u, a.name, a.species, a.sex, a.life_stage, a.hatch_date, a.clutch_label,
    a.morphs, a.hets, null, a.legal_status, a.legal_ref,
    private.pedigree_snapshot(tr.animal_id, tr.gens), false, false);

  /* ② 양도자의 줄은 남되 잠깁니다. */
  update public.animals set transferred_at = now() where id = tr.animal_id;

  /* ③ */
  update public.animal_transfers
     set status = 'accepted', to_user = u, to_animal_id = newid, accepted_at = now()
   where id = tr.id;

  return jsonb_build_object('animal_id', newid, 'name', a.name);
end $$;


-- 8) 양도된 개체는 읽기전용 ----------------------------------------------------------
/* 판정은 원장을 봅니다. animals.transferred_at 만 믿으면, save_row 의
   delete+insert 때 그 칸을 빼고 보내는 것만으로 잠금이 풀립니다. 원장은
   지울 수 없으므로 그 수가 안 통합니다 — v64 가 animal_legal_locks 로
   같은 문제를 푼 것과 같은 구조입니다.

   지우는 것은 막지 않습니다. 넘긴 개체를 내 목록에서 치우고 싶은 것은
   자연스럽고, 원장은 어차피 남습니다. */
create or replace function public.animals_transfer_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.animal_transfers
              where animal_id = new.id and status = 'accepted') then
    /* 사본이 아니라 원본입니다. 원본은 넘긴 시점 그대로 남습니다. */
    if new.transferred_at is null then
      raise exception 'TRANSFER_READONLY' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (
         new.name       is distinct from old.name or
         new.species    is distinct from old.species or
         new.sex        is distinct from old.sex or
         new.life_stage is distinct from old.life_stage or
         new.morphs     is distinct from old.morphs or
         new.hets       is distinct from old.hets or
         new.parent_a   is distinct from old.parent_a or
         new.parent_b   is distinct from old.parent_b) then
      raise exception 'TRANSFER_READONLY' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists animals_transfer_guard on public.animals;
create trigger animals_transfer_guard
  before insert or update on public.animals
  for each row execute function public.animals_transfer_guard();


-- 9) 내 양도 목록 ----------------------------------------------------------------
create or replace function public.my_animal_transfers()
returns setof public.animal_transfers language sql stable security invoker
set search_path = '' as $$
  select * from public.animal_transfers
   where from_user = auth.uid() or to_user = auth.uid()
   order by created_at desc;
$$;


-- 10) 권한 ---------------------------------------------------------------------
revoke all on function private.pedigree_snapshot(uuid, int)                 from public, anon, authenticated;
revoke all on function public.start_animal_transfer(uuid, int, text, numeric) from public, anon;
revoke all on function public.cancel_animal_transfer(uuid)                   from public, anon;
revoke all on function public.peek_animal_transfer(text)                     from public, anon;
revoke all on function public.accept_animal_transfer(text)                   from public, anon;
revoke all on function public.my_animal_transfers()                          from public, anon;
revoke all on function public.animals_transfer_guard()                       from public, anon, authenticated;

grant execute on function public.start_animal_transfer(uuid, int, text, numeric) to authenticated;
grant execute on function public.cancel_animal_transfer(uuid)                    to authenticated;
grant execute on function public.peek_animal_transfer(text)                      to authenticated;
grant execute on function public.accept_animal_transfer(text)                    to authenticated;
grant execute on function public.my_animal_transfers()                           to authenticated;

/* 원장에는 select 만 줍니다. insert/update 는 위 정의자 함수로만, delete 는
   아무에게도 주지 않습니다 — 거래 이력을 지울 수 있으면 장부가 아닙니다. */
grant select on public.animal_transfers to authenticated;

commit;


-- =============================================================================
-- 알아 둘 것
-- -----------------------------------------------------------------------------
-- · 서류는 따라가지 않습니다.
--   animal_documents 는 양도자의 user_id 로 묶여 있습니다. 양수자는 자기
--   이름으로 다시 올려야 하고, 그때까지 그 개체를 공개할 수 없습니다
--   (v64 의 문지기가 사본에도 그대로 걸립니다). CITES 개체의 서류는 본래
--   소지자 명의로 발급되는 것이라, 남의 서류를 그대로 물려주는 쪽이 오히려
--   틀립니다. 화면에서 이 점을 안내해야 합니다.
--
-- · 케어 기록·체중·사진도 따라가지 않습니다.
--   사본은 신원과 혈통 스냅샷만 가져갑니다. 사육 기록은 양도자가 남긴
--   것이고, 넘기려면 별도 결정이 필요합니다(로드맵 4절).
--
-- · 양도자의 자손은 그대로입니다.
--   user_id 를 안 옮기므로 족보도 부모 검사도 아무 영향이 없습니다. 이것이
--   이 설계를 고른 이유입니다.
-- =============================================================================
