-- =============================================================================
-- v68 · 이미지 검수 — 보류 · 처리 기록 · 회원 안내
-- -----------------------------------------------------------------------------
-- 설계 근거: plans/ai-training-consent.md
--
-- 왜 필요한가
--   사진은 아무거나 올라올 수 있고 지금은 아무도 보지 않습니다. QR·링크로 돌고
--   크롤러가 주워 가면 걸리는 곳이 우리 도메인입니다. 회원 데이터를 보려는
--   것이 아니라 우리 페이지에서 나가는 것을 책임지기 위한 장치입니다.
--
-- 무엇을 만드나
--   ① 보류 — 남에게 안 보이게 하고, 학습 대상에서 빼고, 7일 뒤 삭제
--   ② 처리 기록 — append-only. 분쟁이 나면 이것만 남습니다
--   ③ 회원 안내 — 왜 그렇게 됐는지. 읽고 닫을 수 있되 기록은 남습니다
--
-- 시계 둘 (2026-08-09 결정)
--   회원 대응 7일 · 우리 확인 7일 이내. 회원이 조치하면 회원 시계는 멈춥니다.
--   우리가 늦어도 회원 자료가 사라지지 않습니다.
--
-- ⚠️ 보류는 '가리는 것' 이지 '뺏는 것' 이 아닙니다.
--    공개·갤러리·QR·학습에서는 즉시 빠지지만, 회원 본인에게는 계속 보입니다.
--    교체하라고 두는 상태이므로 안 보이면 고칠 수가 없습니다.
--
-- ⚠️ 중대 위반(성인물·도박·직접적 피해)은 보류가 아니라 즉시 삭제입니다.
--    유예 기간 동안 우리 서버에 두는 것 자체가 문제입니다.
-- =============================================================================

do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception E'animals 표가 없습니다.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'public.is_admin() 이 없습니다.';
  end if;
end $guard$;

begin;

-- 1) 개체에 붙는 검수 상태 -----------------------------------------------------------
/* held_at 이 있으면 보류입니다. 공개 문지기와 학습 선별이 이 칸을 봅니다.
   purge_after 는 보류 시각 + 7일. 회원이 조치하면 null 로 비워 시계를 멈춥니다. */
alter table public.animals
  add column if not exists held_at        timestamptz,
  add column if not exists held_reason    text,
  add column if not exists held_category  text,
  add column if not exists purge_after    date,
  /* ⚠️ not null 로 두면 안 됩니다. save_row 는
     insert ... select * from jsonb_populate_record(null::animals, p_row) 라서
     화면이 안 보낸 칸에 명시적 NULL 을 넣습니다 — 컬럼 기본값이 안 먹습니다.
     v54 의 free_pinned 가 정확히 그래서 개체 등록을 통째로 막았습니다.
     이건 관리자만 쓰는 칸이라 화면이 알 필요가 없으므로 nullable 로 둡니다.
     읽는 쪽에서 coalesce(ai_train_block, false) 로 봅니다. */
  add column if not exists ai_train_block boolean;

do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'animals_held_category_ck') then
    alter table public.animals add constraint animals_held_category_ck check (
      held_category is null or held_category in
        ('adult', 'gambling', 'illegal', 'harm', 'unrelated', 'copyright', 'other')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'animals_held_reason_ck') then
    alter table public.animals add constraint animals_held_reason_ck check (
      held_reason is null or char_length(held_reason) between 1 and 500
    );
  end if;
end $ck$;

create index if not exists animals_held_idx on public.animals (held_at) where held_at is not null;
create index if not exists animals_purge_idx on public.animals (purge_after) where purge_after is not null;


-- 2) 처리 기록 — append-only --------------------------------------------------------
/* 개체로 향하는 FK 를 걸지 않습니다. save_row 가 개체를 delete 후 재insert
   하므로 cascade 가 걸리면 기록이 통째로 사라집니다(v64·v65 와 같은 이유).
   개체를 지운 뒤에도 '무엇을 왜 지웠는지' 는 남아야 합니다. */
create table if not exists public.moderation_log (
  id          uuid primary key default gen_random_uuid(),
  animal_id   uuid not null,
  owner_id    uuid,
  admin_id    uuid not null,
  action      text not null,
  category    text,
  reason      text,
  photo_paths text[],
  created_at  timestamptz not null default now(),

  constraint moderation_log_action_ck check (action in
    ('view', 'hold', 'release', 'delete_photos', 'delete_animal', 'ai_block', 'ai_unblock', 'expire')),
  constraint moderation_log_reason_ck check (reason is null or char_length(reason) <= 500)
);

create index if not exists moderation_log_animal_idx on public.moderation_log (animal_id, created_at desc);
create index if not exists moderation_log_owner_idx  on public.moderation_log (owner_id, created_at desc);

alter table public.moderation_log enable row level security;

/* 회원은 자기 개체에 대한 기록만 봅니다. 'view'(열람)는 빼고 보여 줍니다 —
   조치가 아니라 확인이고, 전부 보이면 알림이 소음이 됩니다. 관리자 화면에서는
   아래 RPC 로 전부 봅니다. */
drop policy if exists moderation_log_own on public.moderation_log;
create policy moderation_log_own on public.moderation_log
  for select to authenticated
  using (owner_id = (select auth.uid()) and action <> 'view');

revoke insert, update, delete on public.moderation_log from anon, authenticated, service_role;
grant select on public.moderation_log to authenticated;


-- 3) 회원 안내 — 읽고 닫을 수 있게 -----------------------------------------------------
/* 기록과 안내는 다른 것입니다. 기록은 못 지우고, 안내는 닫을 수 있어야 합니다.
   닫아도 기록은 그대로입니다. */
create table if not exists public.moderation_notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  animal_id  uuid,
  log_id     uuid,
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists moderation_notices_user_idx
  on public.moderation_notices (user_id) where seen_at is null;

alter table public.moderation_notices enable row level security;

drop policy if exists moderation_notices_own on public.moderation_notices;
create policy moderation_notices_own on public.moderation_notices
  for select to authenticated using (user_id = (select auth.uid()));

/* 닫기만 됩니다. 만들거나 지우는 것은 정의자 함수로만. */
drop policy if exists moderation_notices_seen on public.moderation_notices;
create policy moderation_notices_seen on public.moderation_notices
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke insert, delete on public.moderation_notices from anon, authenticated, service_role;
grant select, update on public.moderation_notices to authenticated;


-- 4) 보류 걸기 (관리자) --------------------------------------------------------------
create or replace function public.admin_hold_animal(
  p_animal uuid, p_category text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.animals; lid uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;

  /* 공개와 학습은 즉시 끊습니다. 유예가 필요한 것은 '지우는 것' 뿐입니다. */
  update public.animals
     set held_at = now(), held_category = p_category, held_reason = p_reason,
         purge_after = (current_date + 7),
         is_public = false, is_listed = false, ai_train_block = true
   where id = p_animal;

  insert into public.moderation_log (animal_id, owner_id, admin_id, action, category, reason)
  values (p_animal, a.user_id, auth.uid(), 'hold', p_category, p_reason)
  returning id into lid;

  insert into public.moderation_notices (user_id, animal_id, log_id)
  values (a.user_id, p_animal, lid);

  return jsonb_build_object('held_at', now(), 'purge_after', current_date + 7);
end $$;


-- 5) 보류 풀기 (관리자) --------------------------------------------------------------
/* 회원이 고쳤고 우리가 확인했을 때. 공개는 자동으로 되돌리지 않습니다 —
   무엇을 남에게 보일지는 회원이 정합니다. */
create or replace function public.admin_release_animal(p_animal uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.animals; lid uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;

  update public.animals
     set held_at = null, held_category = null, held_reason = null,
         purge_after = null, ai_train_block = false
   where id = p_animal;

  insert into public.moderation_log (animal_id, owner_id, admin_id, action, reason)
  values (p_animal, a.user_id, auth.uid(), 'release', p_reason)
  returning id into lid;

  insert into public.moderation_notices (user_id, animal_id, log_id)
  values (a.user_id, p_animal, lid);
end $$;


-- 6) 즉시 삭제 (중대 위반) -----------------------------------------------------------
/* 사진만 지웁니다. 개체와 사육 기록은 회원 것이므로 남깁니다 — 문제는
   이미지이지 개체가 아닙니다. 사유는 그대로 알립니다. */
create or replace function public.admin_purge_photos(
  p_animal uuid, p_category text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.animals; lid uuid; paths text[];
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;

  /* 어떤 파일을 지웠는지 기록에 남깁니다. 스토리지에서 실제로 지우는 것은
     화면(또는 관리 작업)이 합니다 — SQL 에서 버킷을 지울 수 없습니다. */
  paths := coalesce(a.photos, '{}') ||
           case when a.photo_url is null then '{}'::text[] else array[a.photo_url] end;

  update public.animals
     set photo_url = null, photos = '{}',
         is_public = false, is_listed = false, ai_train_block = true,
         held_at = null, held_reason = null, held_category = null, purge_after = null
   where id = p_animal;

  insert into public.moderation_log
    (animal_id, owner_id, admin_id, action, category, reason, photo_paths)
  values (p_animal, a.user_id, auth.uid(), 'delete_photos', p_category, p_reason, paths)
  returning id into lid;

  insert into public.moderation_notices (user_id, animal_id, log_id)
  values (a.user_id, p_animal, lid);

  return jsonb_build_object('removed', coalesce(array_length(paths, 1), 0), 'paths', paths);
end $$;


-- 7) 회원이 조치하면 시계를 멈춥니다 ------------------------------------------------------
/* 보류 중인 개체의 사진이 바뀌면 '확인 대기' 로 넘어갑니다. purge_after 를
   비우면 자동 삭제 대상에서 빠지고, 관리자가 볼 때까지 기다립니다.
   우리가 늦은 대가를 회원이 치르지 않게 하는 부분입니다. */
create or replace function public.animals_hold_clock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.held_at is not null and new.purge_after is not null
     and (new.photo_url is distinct from old.photo_url
          or new.photos is distinct from old.photos) then
    new.purge_after := null;
  end if;
  return new;
end $$;

drop trigger if exists animals_hold_clock on public.animals;
create trigger animals_hold_clock
  before update of photo_url, photos on public.animals
  for each row execute function public.animals_hold_clock();


-- 8) 기한이 지난 보류를 지웁니다 ---------------------------------------------------------
/* purge_expired 가 매일 03:00 UTC 에 부릅니다(supabase_v13 + pg_cron).
   purge_after 가 null 인 것(확인 대기)은 건드리지 않습니다. */
create or replace function public.purge_held_animals()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select id, user_id, photos, photo_url from public.animals
            where purge_after is not null and purge_after < current_date loop
    insert into public.moderation_log (animal_id, owner_id, admin_id, action, photo_paths)
    values (r.id, r.user_id, r.user_id, 'expire',
            coalesce(r.photos, '{}') ||
            case when r.photo_url is null then '{}'::text[] else array[r.photo_url] end);

    update public.animals
       set photo_url = null, photos = '{}', held_at = null, purge_after = null
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;


-- 9) 권한 ----------------------------------------------------------------------
revoke all on function public.admin_hold_animal(uuid, text, text)   from public, anon, authenticated;
revoke all on function public.admin_release_animal(uuid, text)      from public, anon, authenticated;
revoke all on function public.admin_purge_photos(uuid, text, text)  from public, anon, authenticated;
revoke all on function public.purge_held_animals()                  from public, anon, authenticated;
revoke all on function public.animals_hold_clock()                  from public, anon, authenticated;

commit;


-- =============================================================================
-- 남은 것 (이 파일 밖)
-- -----------------------------------------------------------------------------
-- · purge_expired 안에서 purge_held_animals() 를 부르도록 이어야 합니다.
--   v13 의 함수를 고치는 것이라 다음 판(v69)에서 합니다 — 지금 고치면 v13 을
--   덮어쓰게 되고, 그 파일이 이미 적용된 뒤라 되돌리기 어렵습니다.
--
-- · 스토리지 파일 실제 삭제는 화면이 합니다. SQL 에서 버킷을 못 지웁니다.
--   moderation_log.photo_paths 에 무엇을 지워야 하는지 남겨 두었습니다.
--
-- · 공개 문지기(public_animal 등)가 held_at 을 보게 해야 완전해집니다.
--   지금은 is_public 을 false 로 내려 막고 있어 실질적으로는 같지만,
--   회원이 다시 켜면 풀립니다. v69 에서 막습니다.
-- =============================================================================
