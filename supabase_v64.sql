-- =============================================================================
-- v64 — CITES 개체의 서류 필수 등록 (불법 양도·양수 방지)
-- -----------------------------------------------------------------------------
-- 무엇
--   개체에 법적 지위(legal_status)를 달고, 그것이 CITES 이면 관련 서류를
--   등록해야만 그 개체를 '남에게 보일 수 있게' 만듭니다. 공개 개체 카드와
--   분양 갤러리 노출이 서류 뒤로 잠깁니다. 나중에 양도 기능이 생기면
--   같은 잠금이 양도에도 걸립니다(아래 8번 assert_cites_transferable).
--
-- 왜 '등록할 때 강제' 가 아니라 '공개할 때 강제' 인가
--   서류는 animal_documents 라는 별도 표에 들어갑니다. 서류를 개체에 매달려면
--   개체 id 가 먼저 있어야 하므로, INSERT 시점에 서류를 요구하는 것은 구조상
--   불가능합니다. 그것 말고도 이유가 하나 더 있습니다 — 등록 순간에 서류를
--   요구하면, 사용자는 서류를 올리는 대신 '일반 사육동물' 을 골라 버립니다.
--   분류를 피하게 만드는 규칙은 불법 거래를 막는 게 아니라 숨깁니다.
--
--   그래서 이렇게 나눕니다.
--     · CITES 라고 표시하는 것 자체는 아무 마찰이 없습니다 (권장·무료)
--     · 서류가 없으면 그 개체는 잠깁니다 — 공개 불가, (추후) 양도 불가
--   막는 지점을 실제로 불법 거래가 일어나는 곳에 두는 것입니다.
--
-- ⚠️ save_row 와 캐스케이드 — 이 파일에서 가장 중요한 부분
--   public.save_row 는 개체를 고칠 때 delete 후 같은 id 로 insert 합니다
--   (supabase_v54.sql). 따라서
--     · animal_documents 에 on delete cascade 를 걸면 개체 이름만 바꿔도
--       서류가 전부 사라집니다. 그래서 이 표에는 FK 를 걸지 않습니다.
--     · 강등 차단을 old.legal_status 비교로만 하면, delete+insert 는 UPDATE 가
--       아니라 INSERT 로 들어오므로 OLD 가 없어 그냥 뚫립니다.
--       그래서 animal_legal_locks 라는 '개체 밖에 사는 잠금' 을 둡니다.
--
--   ※ 같은 이유로 v63 의 care_animal_child_guard(before update)와 weight_logs·
--     care_plans 의 on delete cascade 도 save_row 경로에서는 기대대로 돌지
--     않을 수 있습니다. 이 파일의 범위가 아니라 손대지 않았지만, 따로
--     확인해 보시기 바랍니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v63 다음입니다.
--   맨 아래 13번 확인 구문으로 결과를 점검할 수 있습니다.
--
--   실제로 필요한 선행 버전은 v37 입니다 (public_animal 본문과 weight_logs,
--   profiles.nickname). v62·v63 과는 서로 건드리는 것이 달라 순서에 상관없습니다.
--
-- 되돌리기
--   14번에 적어 두었습니다. 문지기 둘만 떼면 이 파일 이전 상태로 돌아갑니다.
--   칸과 표는 남겨도 아무 일도 하지 않습니다.
-- =============================================================================

-- 0) 안전장치 -------------------------------------------------------------------
do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception E'animals 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

create schema if not exists private;

begin;

-- 1) 개체의 법적 지위 -------------------------------------------------------------
/* 기본값은 'none' 입니다. 이미 등록된 개체 수천 건이 있고, 그것들을 전부
   '확인 필요' 로 만들어 놓으면 아무도 확인하지 않습니다. 모르는 것은
   'unknown' 으로 사용자가 직접 고르게 두고, 기본은 조용히 둡니다.

   ⚠️ not null 을 걸면 안 됩니다. save_row 는
        insert into animals select * from jsonb_populate_record(null::animals, $1)
      로 넣습니다. payload 에 없는 칸은 기본값이 아니라 NULL 이 들어갑니다
      (care/breeding-animal-panel.js 의 species 주석이 같은 이야기입니다).
      새 개체를 만들 때 화면이 legal_status 를 안 보내면 not null 위반으로
      개체 등록이 통째로 막힙니다.

      그래서 nullable 로 두고, NULL 을 'none' 과 같이 봅니다 —
      private.is_cites 가 coalesce 로 받아 냅니다. 화면이 이 칸을 보내도록
      고친 뒤에도 굳이 not null 로 조일 이유는 없습니다. */
alter table public.animals
  add column if not exists legal_status text default 'none',
  add column if not exists legal_ref    text;

do $legal_status_ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'animals_legal_status_ck') then
    alter table public.animals
      add constraint animals_legal_status_ck check (
        legal_status is null
        or legal_status in ('none', 'unknown', 'cites_i', 'cites_ii', 'cites_iii', 'domestic_regulated')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'animals_legal_ref_ck') then
    alter table public.animals
      add constraint animals_legal_ref_ck check (
        legal_ref is null or char_length(legal_ref) between 1 and 120
      );
  end if;
end $legal_status_ck$;

/* 어떤 지위가 서류를 요구하는지 한 곳에서 정합니다. 나중에 국내 지정관리
   야생동물까지 묶으려면 이 함수 한 줄만 고치면 됩니다. 화면·트리거·RPC 가
   전부 이걸 부르기 때문입니다. */
create or replace function private.is_cites(p_status text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_status, 'none') in ('cites_i', 'cites_ii', 'cites_iii');
$$;

create or replace function private.legal_docs_required(p_status text)
returns boolean language sql immutable set search_path = '' as $$
  -- 지금은 CITES 만. domestic_regulated 를 넣으려면 여기에 or 로 더하세요.
  select private.is_cites(p_status);
$$;

-- 2) 서류 표 --------------------------------------------------------------------
/* FK 를 걸지 않은 이유는 파일 머리말에 적었습니다. animal_id 는 참조가 아니라
   그냥 값입니다. 대신 쓰기 경로(RPC·정책)에서 '내 개체인지' 를 확인합니다.

   file_path 는 버킷 안 경로만 담습니다. animal-photos 는 전체 URL 을 담고
   있어서 나중에 경로를 바꾸기 어려워졌습니다(supabase_v25.sql 주석 참고).
   새로 만드는 표에서까지 같은 실수를 반복하지 않습니다.

   지우기가 없습니다. archived_at 으로 덮을 뿐입니다. 서류 기록이 흔적 없이
   사라질 수 있으면 추적 장부로서의 가치가 0 입니다. */
create table if not exists public.animal_documents (
  id          uuid primary key default gen_random_uuid(),
  animal_id   uuid not null,
  user_id     uuid not null,
  doc_kind    text not null,
  doc_number  text,
  issued_on   date,
  expires_on  date,
  issuer      text,
  file_path   text not null,
  note        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint animal_documents_kind_ck check (doc_kind in (
    -- 핵심 서류 — 이 중 하나가 유효해야 잠금이 풀립니다
    'cites_import',            -- 수입허가서
    'cites_export',            -- 수출허가서
    'cites_reexport',          -- 재수출증명서
    'cites_certificate',       -- 국제적 멸종위기종 등록·허가 관련 증서
    'artificial_propagation',  -- 인공증식증명서
    -- 보조 서류 — 보관은 하되 잠금은 못 풉니다
    'import_declaration',      -- 수입신고필증
    'transfer_report',         -- 양도·양수 신고 관련 서류
    'purchase_contract',       -- 매매(양도양수) 계약서
    'other'
  )),
  constraint animal_documents_number_ck check (
    doc_number is null or char_length(btrim(doc_number)) between 1 and 120
  ),
  constraint animal_documents_issuer_ck check (
    issuer is null or char_length(issuer) <= 120
  ),
  constraint animal_documents_note_ck check (
    note is null or char_length(note) <= 500
  ),
  constraint animal_documents_path_ck check (
    file_path ~ '^d/u_[0-9a-f-]{36}_[A-Za-z0-9._-]{1,80}$'
  ),
  constraint animal_documents_dates_ck check (
    expires_on is null or issued_on is null or expires_on >= issued_on
  )
);

create index if not exists animal_documents_animal_idx
  on public.animal_documents (animal_id) where archived_at is null;
create index if not exists animal_documents_user_idx
  on public.animal_documents (user_id);

alter table public.animal_documents enable row level security;

/* 읽기·쓰기 전부 본인 것만. anon 은 아무것도 못 봅니다 — 서류에는 상대방
   이름·주소·허가번호가 들어갑니다. 공개 개체 카드에 절대 실리면 안 됩니다.

   delete 정책이 없는 것은 실수가 아닙니다. RLS 는 정책이 없으면 막습니다.
   지우기는 archive_animal_document 로만 합니다. */
drop policy if exists animal_documents_select on public.animal_documents;
create policy animal_documents_select on public.animal_documents
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists animal_documents_insert on public.animal_documents;
create policy animal_documents_insert on public.animal_documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.animals a
       where a.id = animal_documents.animal_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists animal_documents_update on public.animal_documents;
create policy animal_documents_update on public.animal_documents
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3) 강등 잠금 표 ----------------------------------------------------------------
/* 개체 밖에 삽니다. save_row 가 개체 줄을 지웠다 다시 넣어도 이 줄은 남습니다.
   한 번 CITES 로 표시된 개체는 그 뒤로 '일반' 으로 되돌릴 수 없습니다.

   되돌릴 길을 아예 막지는 않았습니다 — 종을 잘못 고르는 일은 실제로 생깁니다.
   다만 그 길은 관리자를 거치고, 푼 기록이 남습니다(released_* 칸).

   회원은 읽기만 됩니다. insert/update/delete 정책이 없으므로 PostgREST 로
   직접 두드려도 손댈 수 없습니다. 쓰기는 아래 트리거(정의자 권한)와
   관리자 함수뿐입니다. */
create table if not exists public.animal_legal_locks (
  animal_id      uuid primary key,
  user_id        uuid not null,
  locked_status  text not null,
  locked_at      timestamptz not null default now(),
  released_at    timestamptz,
  released_by    uuid,
  release_reason text
);

alter table public.animal_legal_locks enable row level security;

drop policy if exists animal_legal_locks_select on public.animal_legal_locks;
create policy animal_legal_locks_select on public.animal_legal_locks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 4) 서류가 갖춰졌는가 -------------------------------------------------------------
/* '유효한 핵심 서류가 하나라도 있는가' 입니다.
     · 보관 안 됨(archived_at is null)
     · 핵심 서류 종류일 것 — 계약서나 '기타' 로는 잠금이 풀리지 않습니다
     · 서류번호가 비어 있지 않을 것
     · 만료되지 않았을 것

   만료일이 지나면 이 함수는 그 순간부터 거짓을 돌려줍니다. 다만 트리거는
   쓰기가 있어야 돕니다 — 이미 공개된 개체가 서류 만료로 저절로 내려가지는
   않습니다. 그건 9번의 감시 함수로 찾아서 처리합니다. */
create or replace function private.cites_docs_ok(p_animal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.animal_documents d
     where d.animal_id = p_animal
       and d.archived_at is null
       and d.doc_kind in ('cites_import', 'cites_export', 'cites_reexport',
                          'cites_certificate', 'artificial_propagation')
       and coalesce(btrim(d.doc_number), '') <> ''
       and (d.expires_on is null or d.expires_on >= current_date)
  );
$$;

-- 5) 개체 쪽 문지기 ---------------------------------------------------------------
create or replace function public.animals_cites_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare locked text;
begin
  select l.locked_status into locked
    from public.animal_legal_locks l
   where l.animal_id = new.id and l.released_at is null;

  /* (가) 잠긴 개체를 비-CITES 로 되돌리려는 시도.
     save_row 의 delete+insert 도 여기서 걸립니다 — 잠금은 개체 밖에 있으니까요. */
  if locked is not null and not private.is_cites(new.legal_status) then
    raise exception 'CITES_DOWNGRADE_BLOCKED' using errcode = '42501';
  end if;

  /* (나) 잠금이 아직 안 걸린 찰나(같은 트랜잭션 안 UPDATE)를 위한 이중 방어. */
  if tg_op = 'UPDATE'
     and private.is_cites(old.legal_status)
     and not private.is_cites(new.legal_status) then
    raise exception 'CITES_DOWNGRADE_BLOCKED' using errcode = '42501';
  end if;

  /* (다) 본론 — 서류 없이 남에게 보이려는 시도.
     is_public 은 QR·공개 카드, is_listed 는 분양 갤러리입니다. 둘 다 막습니다. */
  if private.legal_docs_required(new.legal_status)
     and (coalesce(new.is_public, false) or coalesce(new.is_listed, false))
     and not private.cites_docs_ok(new.id) then
    raise exception 'CITES_DOCS_REQUIRED' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists animals_cites_guard on public.animals;
create trigger animals_cites_guard
  before insert or update on public.animals
  for each row execute function public.animals_cites_guard();

/* 표시하는 순간 잠급니다. before 트리거에서 남의 표를 건드리지 않고
   after 로 뺀 이유는, 개체 삽입이 실패하면 잠금도 남으면 안 되기 때문입니다. */
create or replace function public.animals_cites_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_cites(new.legal_status) and new.user_id is not null then
    /* 별칭을 답니다. on conflict 의 where 절에서 기존 줄을 가리킬 때
       스키마까지 붙인 이름은 해석이 애매합니다. */
    insert into public.animal_legal_locks as l (animal_id, user_id, locked_status)
    values (new.id, new.user_id, new.legal_status)
    on conflict (animal_id) do update
      set locked_status = excluded.locked_status
      where l.released_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists animals_cites_lock on public.animals;
create trigger animals_cites_lock
  after insert or update of legal_status on public.animals
  for each row execute function public.animals_cites_lock();

-- 6) 서류 쪽 문지기 ---------------------------------------------------------------
/* 반대 방향의 구멍을 막습니다 — 서류를 올려 공개해 놓고 서류만 내리는 것.
   공개 중인 CITES 개체의 마지막 유효 서류는 보관 처리할 수 없습니다.
   먼저 개체를 비공개로 돌린 뒤에 내리라는 뜻입니다. */
create or replace function public.animal_documents_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.animals;
begin
  select * into a from public.animals where id = new.animal_id;
  if not found then
    raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501';
  end if;
  if a.user_id is null or a.user_id <> new.user_id then
    raise exception 'ANIMAL_NOT_MINE' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.archived_at is null and new.archived_at is not null
     and private.legal_docs_required(a.legal_status)
     and (coalesce(a.is_public, false) or coalesce(a.is_listed, false)) then
    /* 지금 내리는 이 서류를 뺀 나머지로도 충분한지 봅니다. */
    if not exists (
      select 1 from public.animal_documents d
       where d.animal_id = new.animal_id
         and d.id <> new.id
         and d.archived_at is null
         and d.doc_kind in ('cites_import', 'cites_export', 'cites_reexport',
                            'cites_certificate', 'artificial_propagation')
         and coalesce(btrim(d.doc_number), '') <> ''
         and (d.expires_on is null or d.expires_on >= current_date)
    ) then
      raise exception 'CITES_DOCS_LAST_ONE' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists animal_documents_guard on public.animal_documents;
create trigger animal_documents_guard
  before insert or update on public.animal_documents
  for each row execute function public.animal_documents_guard();

-- 7) 화면이 쓰는 창구 -------------------------------------------------------------
create or replace function public.save_animal_document(p_doc jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare u uuid := (select auth.uid()); newid uuid;
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.animal_documents
    (animal_id, user_id, doc_kind, doc_number, issued_on, expires_on, issuer, file_path, note)
  values (
    (p_doc->>'animal_id')::uuid, u,
    p_doc->>'doc_kind',
    nullif(btrim(coalesce(p_doc->>'doc_number', '')), ''),
    nullif(p_doc->>'issued_on', '')::date,
    nullif(p_doc->>'expires_on', '')::date,
    nullif(btrim(coalesce(p_doc->>'issuer', '')), ''),
    p_doc->>'file_path',
    nullif(btrim(coalesce(p_doc->>'note', '')), '')
  )
  returning id into newid;

  return newid;
end;
$$;

create or replace function public.archive_animal_document(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := (select auth.uid()); target uuid;
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.animal_documents
     set archived_at = now()
   where id = p_id and user_id = u and archived_at is null
  returning animal_id into target;

  if target is null then
    raise exception 'DOCUMENT_NOT_FOUND' using errcode = '42501';
  end if;

  return public.my_animal_legal(target);
end;
$$;

/* 개체 한 마리의 법적 상태와 서류 목록. 화면은 이거 하나만 부르면 됩니다.
   file_path 는 그대로 돌려줍니다 — 화면이 서명 URL 을 따로 받습니다.

   ⚠️ definer 입니다. private.legal_docs_required 와 private.cites_docs_ok 는
      회원에게서 execute 를 회수했기 때문에, invoker 로 두면 회원이 부를 때마다
      permission denied 가 납니다. 대신 아래에서 소유자를 직접 확인합니다 —
      user_id = u 로 거르므로 남의 개체는 ANIMAL_NOT_FOUND 로 떨어집니다. */
create or replace function public.my_animal_legal(p_animal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); a public.animals;
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into a from public.animals where id = p_animal and user_id = u;
  if not found then
    raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'animal_id',     a.id,
    /* NULL 은 'none' 과 같습니다. 화면이 NULL 을 따로 다루게 하지 않습니다. */
    'legal_status',  coalesce(a.legal_status, 'none'),
    'legal_ref',     a.legal_ref,
    'docs_required', private.legal_docs_required(a.legal_status),
    'docs_ok',       private.cites_docs_ok(a.id),
    'locked',        exists (select 1 from public.animal_legal_locks l
                              where l.animal_id = a.id and l.released_at is null),
    'is_public',     coalesce(a.is_public, false),
    'is_listed',     coalesce(a.is_listed, false),
    'documents',     coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'doc_kind', d.doc_kind, 'doc_number', d.doc_number,
               'issued_on', d.issued_on, 'expires_on', d.expires_on,
               'issuer', d.issuer, 'file_path', d.file_path, 'note', d.note,
               'expired', d.expires_on is not null and d.expires_on < current_date)
             order by d.created_at desc)
        from public.animal_documents d
       where d.animal_id = a.id and d.archived_at is null), '[]'::jsonb)
  );
end;
$$;

-- 8) 양도 문지기 (아직 부르는 곳은 없습니다) -------------------------------------------
/* animal_transfers 는 plans/transfer-docs-roadmap.md 의 Phase 2 입니다.
   그 표가 생기면 이 함수를 이전 함수 첫 줄에서 부르세요. 지금 미리 두는
   이유는, 나중에 만들면서 '공개 게이트' 와 다른 규칙을 새로 쓰게 되는 것을
   막기 위해서입니다. 규칙은 한 벌이어야 합니다. */
create or replace function public.assert_cites_transferable(p_animal uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare a public.animals;
begin
  select * into a from public.animals where id = p_animal;
  if not found then
    raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501';
  end if;
  if private.legal_docs_required(a.legal_status)
     and not private.cites_docs_ok(a.id) then
    raise exception 'CITES_DOCS_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- 9) 만료 감시 ------------------------------------------------------------------
/* 트리거는 쓰기가 있어야 돕니다. 그래서 '공개 중인데 서류가 만료된 개체' 는
   저절로 잡히지 않습니다. 관리자가 주기적으로 이걸 돌려 찾습니다. */
create or replace function public.admin_cites_watchlist()
returns table (animal_id uuid, user_id uuid, legal_status text,
               is_public boolean, is_listed boolean, reason text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, a.legal_status,
         coalesce(a.is_public, false), coalesce(a.is_listed, false),
         case when not exists (select 1 from public.animal_documents d
                                where d.animal_id = a.id and d.archived_at is null)
              then 'NO_DOCUMENT' else 'EXPIRED_OR_INVALID' end
    from public.animals a
   where private.legal_docs_required(a.legal_status)
     and (coalesce(a.is_public, false) or coalesce(a.is_listed, false))
     and not private.cites_docs_ok(a.id);
$$;

/* 잘못 고른 종을 되돌리는 유일한 길입니다. 이유를 반드시 적게 합니다. */
create or replace function public.admin_release_legal_lock(p_animal uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.animal_legal_locks
     set released_at = now(), released_by = (select auth.uid()), release_reason = btrim(p_reason)
   where animal_id = p_animal and released_at is null;
  if not found then
    raise exception 'LOCK_NOT_FOUND' using errcode = '42501';
  end if;
  return jsonb_build_object('animal_id', p_animal, 'released', true);
end;
$$;

-- 10) 공개 카드에 붙는 표시 --------------------------------------------------------
/* v37 의 public_animal 에 legal 한 덩이만 더한 것입니다. 나머지는 그대로입니다.

   ⚠️ 서류번호·발급기관·파일 경로는 넣지 않습니다. 허가번호가 공개되면
      그대로 베껴 쓰는 위조에 쓰입니다. 사는 쪽에 필요한 것은 '이 개체는
      CITES 이고 서류가 등록돼 있다' 는 사실 하나뿐이고, 실제 번호 확인은
      계약 자리에서 원본을 보고 합니다. */
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
    'latest_weight', latest_weight, 'weight_history', weight_history,
    'legal', jsonb_build_object(
      'status', coalesce(a.legal_status, 'none'),
      'docs_required', private.legal_docs_required(a.legal_status),
      'docs_verified', private.cites_docs_ok(a.id))
  );
end $$;

-- 11) 권한 ----------------------------------------------------------------------
revoke all on function private.is_cites(text)              from public, anon, authenticated;
revoke all on function private.legal_docs_required(text)   from public, anon, authenticated;
revoke all on function private.cites_docs_ok(uuid)         from public, anon, authenticated;

revoke all on function public.save_animal_document(jsonb)      from public, anon;
revoke all on function public.archive_animal_document(uuid)    from public, anon;
revoke all on function public.my_animal_legal(uuid)            from public, anon;
revoke all on function public.assert_cites_transferable(uuid)  from public, anon;
revoke all on function public.admin_cites_watchlist()          from public, anon, authenticated;
revoke all on function public.admin_release_legal_lock(uuid, text) from public, anon, authenticated;

/* create or replace 는 기존 권한을 그대로 두지만, public_animal 은 익명이
   부르는 유일한 창구라 여기서 한 번 더 못 박아 둡니다. 이게 빠지면 QR 카드가
   통째로 안 열립니다. */
revoke all on function public.public_animal(text) from public;
grant execute on function public.public_animal(text) to anon, authenticated;

grant execute on function public.save_animal_document(jsonb)     to authenticated;
grant execute on function public.archive_animal_document(uuid)   to authenticated;
grant execute on function public.my_animal_legal(uuid)           to authenticated;
grant execute on function public.assert_cites_transferable(uuid) to authenticated;

/* 서류 표에 PostgREST 직접 접근을 허용합니다. RLS 가 본인 것만 통과시킵니다.
   delete 는 주지 않습니다 — 보관 처리만 있습니다. */
grant select, insert, update on public.animal_documents to authenticated;
grant select                 on public.animal_legal_locks to authenticated;

commit;

-- 12) 서류 보관함 (트랜잭션 밖) -------------------------------------------------------
/* animal-photos 와 다릅니다. 공개 읽기 정책이 없습니다 — 서류에는 상대방
   이름·주소·허가번호가 들어갑니다. 개체를 공개해도 서류는 주인만 봅니다.

   경로 규칙  d/u_<사용자 uuid>_<파일명>
   위 animal_documents_path_ck 와 같은 모양이어야 합니다. 한쪽만 고치면
   업로드는 되는데 표에 못 넣는 상태가 됩니다. */
do $bucket$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('animal-documents', 'animal-documents', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = 10485760,
          allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
exception when others then
  raise notice '[건너뜀] 버킷 생성 실패: % — Storage 화면에서 직접 만드세요 (Public 끄기).', sqlerrm;
end $bucket$;

do $docpolicy$
begin
  drop policy if exists ad_read   on storage.objects;
  drop policy if exists ad_insert on storage.objects;
  drop policy if exists ad_update on storage.objects;
  drop policy if exists ad_delete on storage.objects;

  create policy ad_read on storage.objects for select to authenticated
    using (bucket_id = 'animal-documents'
           and name like 'd/u\_' || auth.uid()::text || '\_%');

  create policy ad_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'animal-documents'
                and name like 'd/u\_' || auth.uid()::text || '\_%');

  create policy ad_update on storage.objects for update to authenticated
    using      (bucket_id = 'animal-documents' and name like 'd/u\_' || auth.uid()::text || '\_%')
    with check (bucket_id = 'animal-documents' and name like 'd/u\_' || auth.uid()::text || '\_%');

  create policy ad_delete on storage.objects for delete to authenticated
    using (bucket_id = 'animal-documents' and name like 'd/u\_' || auth.uid()::text || '\_%');

  raise notice '[완료] animal-documents 정책 적용됨';
exception when others then
  raise notice '[건너뜀] 정책 적용 실패: % — Storage → Policies 에서 직접 넣으세요.', sqlerrm;
end $docpolicy$;

-- 13) 확인 ----------------------------------------------------------------------
-- 아래를 실행해 결과를 확인하세요.
--
-- 칸이 생겼는지
--   select column_name from information_schema.columns
--    where table_name = 'animals' and column_name in ('legal_status','legal_ref');
--
-- 문지기가 붙었는지 (2개 나와야 합니다)
--   select tgname from pg_trigger where tgrelid = 'public.animals'::regclass
--    and tgname like '%cites%';
--
-- 서류 없이 공개가 막히는지 (CITES_DOCS_REQUIRED 가 나야 정상입니다)
--   update public.animals set legal_status = 'cites_ii', is_public = true
--    where id = '<내 개체 id>';
--
-- 강등이 막히는지 (CITES_DOWNGRADE_BLOCKED 가 나야 정상입니다)
--   update public.animals set legal_status = 'none' where id = '<위 개체 id>';
--
-- 공개 중인데 서류가 빈 개체 찾기
--   select * from public.admin_cites_watchlist();

-- 14) 되돌리기 -------------------------------------------------------------------
-- 문지기 둘만 떼면 됩니다. 이걸 돌린 직후부터 개체 저장은 v64 이전과
-- 똑같이 동작합니다. 칸(legal_status·legal_ref)과 표(animal_documents·
-- animal_legal_locks)는 남겨 두세요 — 남아 있어도 아무 일도 하지 않고,
-- 지우면 이미 올린 서류 기록이 사라집니다.
--
--   drop trigger if exists animals_cites_guard on public.animals;
--   drop trigger if exists animals_cites_lock  on public.animals;
--   drop trigger if exists animal_documents_guard on public.animal_documents;
--
-- 공개 카드를 v64 이전 모양으로 되돌리려면 supabase_v37.sql 의
-- public_animal 부분만 다시 실행하세요 (legal 덩이가 빠집니다).
--
-- 표까지 완전히 걷어낼 때만 — 서류가 지워집니다. 다시 생각해 보세요.
--   drop table if exists public.animal_documents;
--   drop table if exists public.animal_legal_locks;
--   alter table public.animals drop column if exists legal_status;
--   alter table public.animals drop column if exists legal_ref;
