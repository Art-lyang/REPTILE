/* v64 — CITES 개체 서류 필수 등록 계약 검사
 *
 * 이 검사는 "SQL 이 이렇게 생겼는가" 를 봅니다. 실제 Postgres 를 띄우지
 * 않으므로 문법이 도는지까지는 보증하지 못합니다. 대신 나중에 누가
 * v64 을 손댔을 때 잠금이 조용히 풀리는 것을 잡는 것이 목적입니다.
 *
 * 특히 지키려는 것 세 가지입니다.
 *   ① animal_documents 에 개체로 향하는 on delete cascade 가 생기지 않을 것
 *      — save_row 가 개체를 지웠다 다시 넣기 때문에 서류가 통째로 날아갑니다
 *   ② 강등 차단이 old/new 비교에만 기대지 않을 것 — 잠금 표가 있어야 합니다
 *   ③ 서류 내용이 공개 카드로 새지 않을 것
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function rawSql(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function sqlFrom(relativePath) {
  return rawSql(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function functionsIn(sql) {
  return sql.match(/create or replace function (?:public|private)\.[a-z0-9_]+\s*\([\s\S]*?\$\$\s*;/g) || [];
}

function functionNamed(sql, name) {
  const found = functionsIn(sql).find(source =>
    new RegExp(`create or replace function (?:public|private)\\.${name}\\s*\\(`).test(source));
  return found || '';
}

function tableNamed(sql, name) {
  const found = sql.match(
    new RegExp(`create table(?: if not exists)? public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*;`));
  return found ? found[0] : '';
}

const v64 = sqlFrom('supabase_v64.sql');

test('Given a fresh checkout, when v64 is read, then the migration exists and is transactional', () => {
  assert.notEqual(v64, '', 'supabase_v64.sql must exist');
  assert.match(v64, /\bbegin\s*;/, 'v64 must open a transaction');
  assert.match(v64, /\bcommit\s*;/, 'v64 must commit');

  /* $$ 는 짝이 맞아야 합니다. 홀수면 함수 본문이 열린 채로 끝난 것입니다. */
  const dollars = (rawSql('supabase_v64.sql').match(/\$\$/g) || []).length;
  assert.equal(dollars % 2, 0, 'every $$ body in v64 must be closed');

  /* do 블록의 이름표도 짝이 맞아야 합니다. */
  const tags = rawSql('supabase_v64.sql').match(/\$[a-z_]+\$/g) || [];
  const counts = tags.reduce((acc, tag) => (acc[tag] = (acc[tag] || 0) + 1, acc), {});
  for (const [tag, n] of Object.entries(counts)) {
    assert.equal(n % 2, 0, `dollar-quote tag ${tag} must be balanced`);
  }
});

test('Given an animal record, when v64 is applied, then the legal status column is bounded', () => {
  assert.match(v64, /add column if not exists legal_status text default 'none'/,
    'v64 must add animals.legal_status defaulting to none');
  assert.match(v64, /add column if not exists legal_ref\s+text/,
    'v64 must add animals.legal_ref');
  assert.match(v64, /animals_legal_status_ck[\s\S]{0,300}'cites_i'[\s\S]{0,80}'cites_ii'[\s\S]{0,80}'cites_iii'/,
    'v64 must constrain legal_status to the known values');

  /* save_row 는 jsonb_populate_record 로 넣기 때문에 payload 에 없는 칸에
     기본값이 아니라 NULL 이 들어갑니다. legal_status 에 not null 을 걸면
     새 개체 등록이 통째로 막힙니다. 한 번 걸렸으므로 못 박습니다. */
  assert.ok(!/add column if not exists legal_status text not null/.test(v64),
    'legal_status must stay nullable — save_row inserts NULL for absent keys, so NOT NULL breaks animal creation');
  assert.match(v64, /animals_legal_status_ck[\s\S]{0,120}legal_status is null/,
    'the status check constraint must accept NULL');
  assert.match(v64, /coalesce\(p_status, 'none'\)/,
    'is_cites must read NULL as none');
  for (const fn of ['my_animal_legal', 'public_animal']) {
    assert.match(functionNamed(v64, fn), /coalesce\(a\.legal_status, 'none'\)/,
      `${fn} must present NULL as none rather than leaking a null status`);
  }

  /* 기본값이 none 이어야 합니다. unknown 이 기본이면 기존 개체 전부가
     '확인 필요' 가 되어 경고가 배경 소음이 됩니다. */
  assert.ok(!/legal_status text not null default 'unknown'/.test(v64),
    'legal_status must not default to unknown');
});

test('Given the CITES predicate, when v64 is applied, then the rule lives in one place', () => {
  const isCites = functionNamed(v64, 'is_cites');
  assert.notEqual(isCites, '', 'v64 must define private.is_cites');
  assert.match(isCites, /'cites_i'[\s\S]*'cites_ii'[\s\S]*'cites_iii'/, 'is_cites must cover all three appendices');

  const required = functionNamed(v64, 'legal_docs_required');
  assert.notEqual(required, '', 'v64 must define private.legal_docs_required');
  assert.match(required, /private\.is_cites/, 'legal_docs_required must delegate to is_cites');

  /* 게이트를 거는 곳은 전부 legal_docs_required 또는 is_cites 를 불러야 합니다.
     상태 문자열을 직접 비교하는 곳이 생기면 규칙이 갈라집니다. */
  for (const fn of ['animals_cites_guard', 'assert_cites_transferable']) {
    const body = functionNamed(v64, fn);
    assert.notEqual(body, '', `v64 must define public.${fn}`);
    assert.match(body, /private\.(legal_docs_required|is_cites)/,
      `${fn} must ask the shared predicate, not compare status strings itself`);
  }
});

test('Given save_row deletes and re-inserts animals, when v64 is applied, then documents survive', () => {
  const table = tableNamed(v64, 'animal_documents');
  assert.notEqual(table, '', 'v64 must create public.animal_documents');

  /* ① 이 검사가 이 파일에서 가장 중요합니다.
     save_row (supabase_v54.sql) 는 개체를 고칠 때 delete 후 insert 합니다.
     여기에 cascade 를 걸면 개체 이름만 바꿔도 서류가 사라집니다. */
  assert.ok(!/references\s+public\.animals/.test(table),
    'animal_documents must NOT reference animals — save_row delete+insert would cascade the documents away');
  assert.ok(!/on delete cascade/.test(table),
    'animal_documents must not carry on delete cascade');

  assert.match(table, /animal_id\s+uuid not null/, 'animal_documents must record the animal id');
  assert.match(table, /user_id\s+uuid not null/, 'animal_documents must record the owner');
  assert.match(table, /file_path\s+text not null/, 'animal_documents must record the stored file path');
  assert.match(table, /archived_at\s+timestamptz/, 'animal_documents must archive rather than delete');

  /* 경로 규칙이 버킷 정책과 같은 모양이어야 합니다. */
  assert.match(table, /file_path ~ '\^d\/u_/, 'animal_documents must pin file_path to the d/u_<uid>_ convention');
  assert.match(v64, /name like 'd\/u\\_' \|\| auth\.uid\(\)::text/,
    'the storage policy must use the same d/u_<uid>_ convention');
});

test('Given a CITES animal, when documents are missing, then publishing is refused', () => {
  const guard = functionNamed(v64, 'animals_cites_guard');
  assert.notEqual(guard, '', 'v64 must define the animals guard');
  assert.match(guard, /cites_docs_required/, 'the guard must raise CITES_DOCS_REQUIRED');
  assert.match(guard, /is_public[\s\S]{0,120}is_listed|is_listed[\s\S]{0,120}is_public/,
    'the guard must cover both the public card and the listing');
  assert.match(guard, /private\.cites_docs_ok/, 'the guard must consult cites_docs_ok');

  assert.match(v64, /before insert or update on public\.animals\s+for each row execute function public\.animals_cites_guard/,
    'the guard must fire before insert and update on animals');
});

test('Given a locked animal, when someone downgrades the status, then the lock holds', () => {
  const locks = tableNamed(v64, 'animal_legal_locks');
  assert.notEqual(locks, '', 'v64 must create public.animal_legal_locks');
  assert.match(locks, /animal_id\s+uuid primary key/, 'the lock is one row per animal');
  assert.match(locks, /released_at\s+timestamptz/, 'releases must be recorded, not deleted');
  assert.match(locks, /release_reason\s+text/, 'releasing a lock must carry a reason');

  const guard = functionNamed(v64, 'animals_cites_guard');
  /* ② 잠금 표를 보고 막아야 합니다. old/new 비교만으로는 save_row 의
     delete+insert 가 INSERT 로 들어와 그냥 통과합니다. */
  assert.match(guard, /animal_legal_locks/,
    'the guard must consult the out-of-row lock, not just OLD.legal_status');
  assert.match(guard, /cites_downgrade_blocked/, 'the guard must raise CITES_DOWNGRADE_BLOCKED');

  assert.match(v64, /after insert or update of legal_status on public\.animals/,
    'v64 must set the lock after the status is written');
});

test('Given a published CITES animal, when the last document is archived, then it is refused', () => {
  const guard = functionNamed(v64, 'animal_documents_guard');
  assert.notEqual(guard, '', 'v64 must define the documents guard');
  assert.match(guard, /cites_docs_last_one/, 'archiving the last valid document must raise CITES_DOCS_LAST_ONE');
  assert.match(guard, /animal_not_mine/, 'the documents guard must reject documents attached to someone else\'s animal');
});

test('Given a document set, when completeness is judged, then only core documents count', () => {
  const ok = functionNamed(v64, 'cites_docs_ok');
  assert.notEqual(ok, '', 'v64 must define private.cites_docs_ok');
  assert.match(ok, /archived_at is null/, 'archived documents must not count');
  assert.match(ok, /expires_on is null or d\.expires_on >= current_date/, 'expired documents must not count');
  assert.match(ok, /btrim\(d\.doc_number\)[\s\S]{0,20}<> ''/, 'a document without a number must not count');

  /* 계약서나 '기타' 로 잠금이 풀리면 안 됩니다. */
  for (const weak of ["'purchase_contract'", "'other'", "'transfer_report'"]) {
    assert.ok(!ok.includes(weak), `${weak} must not satisfy the CITES document requirement`);
  }
  for (const core of ["'cites_import'", "'cites_export'", "'cites_reexport'",
                      "'cites_certificate'", "'artificial_propagation'"]) {
    assert.ok(ok.includes(core), `${core} must satisfy the CITES document requirement`);
  }
});

test('Given a member reads their own animal, when the private helpers are revoked, then the door still opens', () => {
  /* private.legal_docs_required / cites_docs_ok 는 회원에게서 execute 를
     회수합니다. 그것들을 부르는 함수가 invoker 로 남으면 회원이 부를 때마다
     permission denied 가 납니다. 한 번 겪었으므로 검사로 못 박습니다. */
  for (const name of ['my_animal_legal', 'assert_cites_transferable']) {
    const body = functionNamed(v64, name);
    assert.notEqual(body, '', `v64 must define public.${name}`);
    if (/private\.(legal_docs_required|cites_docs_ok|is_cites)/.test(body)) {
      assert.match(body, /security definer/,
        `${name} calls a revoked private helper, so it must be security definer`);
    }
  }

  /* definer 로 열어 준 만큼 소유자 확인이 함수 안에 있어야 합니다. */
  assert.match(functionNamed(v64, 'my_animal_legal'), /user_id = u/,
    'my_animal_legal must filter to the caller\'s own animal');

  /* 익명이 부르는 공개 카드의 실행 권한이 살아 있어야 합니다. */
  assert.match(v64, /grant execute on function public\.public_animal\(text\) to anon, authenticated/,
    'republishing public_animal must keep the anon grant');
});

test('Given the public card, when a CITES animal is shown, then paperwork details stay private', () => {
  const card = functionNamed(v64, 'public_animal');
  assert.notEqual(card, '', 'v64 must republish public_animal');
  assert.match(card, /'docs_verified'/, 'the public card must expose whether documents are on file');
  assert.match(card, /'status', coalesce\(a\.legal_status, 'none'\)/, 'the public card must expose the legal status');

  /* ③ 번호·발급기관·파일 경로가 새면 위조에 쓰입니다. */
  for (const leak of ['doc_number', 'file_path', 'issuer', 'legal_ref']) {
    assert.ok(!card.includes(leak), `public_animal must not expose ${leak}`);
  }
  assert.ok(!card.includes('animal_documents'),
    'public_animal must not read the documents table directly — only the boolean via cites_docs_ok');
});

test('Given anonymous callers, when v64 grants execute, then the doors fail closed', () => {
  const table = tableNamed(v64, 'animal_documents');
  assert.notEqual(table, '', 'animal_documents must exist');
  assert.match(v64, /alter table public\.animal_documents enable row level security/,
    'animal_documents must enable RLS');
  assert.match(v64, /alter table public\.animal_legal_locks enable row level security/,
    'animal_legal_locks must enable RLS');

  /* 서류는 지울 수 없어야 합니다 — 정책이 없으면 RLS 가 막습니다. */
  assert.ok(!/create policy animal_documents_delete/.test(v64),
    'animal_documents must not carry a delete policy');
  assert.ok(!/grant[^;]*delete[^;]*on public\.animal_documents/.test(v64),
    'authenticated users must not be granted delete on animal_documents');

  /* 잠금은 회원이 못 씁니다. */
  assert.ok(!/create policy animal_legal_locks_(insert|update|delete)/.test(v64),
    'members must not be able to write the lock table');
  assert.match(v64, /grant select\s+on public\.animal_legal_locks to authenticated/,
    'members may only read their own locks');

  for (const fn of ['save_animal_document\\(jsonb\\)', 'archive_animal_document\\(uuid\\)',
                    'my_animal_legal\\(uuid\\)']) {
    assert.match(v64, new RegExp(`revoke all on function public\\.${fn}\\s+from public, anon`),
      `${fn} must be revoked from anon`);
    assert.match(v64, new RegExp(`grant execute on function public\\.${fn}\\s+to authenticated`),
      `${fn} must be granted to authenticated`);
  }

  for (const admin of ['admin_cites_watchlist\\(\\)', 'admin_release_legal_lock\\(uuid, text\\)']) {
    assert.match(v64, new RegExp(`revoke all on function public\\.${admin}\\s+from public, anon, authenticated`),
      `${admin} must be closed to members`);
  }

  for (const helper of ['is_cites\\(text\\)', 'legal_docs_required\\(text\\)', 'cites_docs_ok\\(uuid\\)']) {
    assert.match(v64, new RegExp(`revoke all on function private\\.${helper}\\s+from public, anon, authenticated`),
      `private.${helper} must not be callable from the client`);
  }
});

test('Given the document bucket, when v64 is applied, then it is private with no public read', () => {
  assert.match(v64, /insert into storage\.buckets[\s\S]{0,200}'animal-documents'[\s\S]{0,120}false/,
    'the animal-documents bucket must be created private');
  assert.match(v64, /on conflict \(id\) do update\s+set public = false/,
    'an existing animal-documents bucket must be forced back to private');
  assert.match(v64, /application\/pdf/, 'the bucket must accept PDF');

  /* animal-photos 와 달리 공개 개체에 딸린 파일이라도 익명 읽기를 주면 안 됩니다. */
  const readPolicy = (v64.match(/create policy ad_read on storage\.objects[\s\S]*?;/) || [''])[0];
  assert.notEqual(readPolicy, '', 'the bucket needs a read policy');
  assert.ok(!readPolicy.includes('anon'), 'documents must never be readable by anon');
  assert.ok(!readPolicy.includes('is_public'),
    'document reads must not open up just because the animal is public');
});

test('Given the future transfer flow, when v64 is applied, then the same gate is ready', () => {
  const fn = functionNamed(v64, 'assert_cites_transferable');
  assert.notEqual(fn, '', 'v64 must ship the transfer gate so Phase 2 reuses one rule');
  assert.match(fn, /cites_docs_required/, 'the transfer gate must raise the same error as the publish gate');
});
