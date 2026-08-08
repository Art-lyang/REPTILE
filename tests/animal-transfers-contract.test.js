/* 개체 양도(소유권 이전) 표에 미리 걸어 두는 가드레일
 * ---------------------------------------------------------------------------
 * 지금은 그런 표가 없습니다. 그래서 이 검사는 대부분 아무 일도 하지 않습니다.
 * 누군가 양도·거래 기록 표를 만드는 순간 깨어나서, 아래 세 가지를 지켰는지
 * 봅니다. 설계 배경은 plans/transfer-docs-roadmap.md 에 있습니다.
 *
 *   ① 개체로 향하는 on delete cascade 금지
 *      public.save_row 는 개체를 고칠 때 delete 후 같은 id 로 insert 합니다
 *      (supabase_v54.sql). cascade 를 걸면 개체 이름만 바꿔도 거래 이력이
 *      통째로 사라집니다. supabase_v64.sql 의 animal_documents 가 같은
 *      이유로 FK 를 뺐습니다.
 *
 *   ② 소유권을 옮기는 경로는 public.assert_cites_transferable 을 부를 것
 *      v64 가 '서류 없는 CITES 개체는 공개 못 한다' 를 걸어 두었습니다.
 *      양도가 그 검사를 안 부르면, 공개는 막혔는데 양도는 되는 두 번째 문이
 *      열립니다. 불법 양도 방지가 그대로 뚫립니다.
 *
 *   ③ 거래 이력은 지울 수 없을 것
 *      지울 수 있으면 추적 장부로서의 가치가 0 입니다.
 *
 * 왜 메모가 아니라 검사인가 — 메모는 한 번 읽히고 잊힙니다. 이건 표를 만드는
 * 사람 앞에서 바로 빨간불이 켜집니다.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

/* 이름을 하나로 못 박지 않습니다. animal_transfers 로 갈지 trades 로 갈지
   모르고, 이름을 조금 바꿔서 검사를 피하는 일이 생기면 안 됩니다. */
const TRANSFER_NAME = /(transfer|trade|handover|assignment|conveyance)/;

function sqlFiles() {
  return fs.readdirSync(root)
    .filter(name => /^supabase_.*\.sql$/.test(name))
    .map(name => ({ name, text: fs.readFileSync(path.join(root, name), 'utf8') }));
}

function stripped(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/* 양도로 보이는 표를 만든 파일들을 찾습니다. */
function transferTables() {
  const found = [];
  for (const file of sqlFiles()) {
    const sql = stripped(file.text);
    const re = /create table(?: if not exists)? public\.([a-z0-9_]+)\s*\(/g;
    let hit;
    while ((hit = re.exec(sql)) !== null) {
      const table = hit[1];
      if (!TRANSFER_NAME.test(table)) continue;
      /* 표 본문만 잘라 냅니다. */
      const body = sql.slice(hit.index).match(/create table(?: if not exists)? public\.[a-z0-9_]+\s*\([\s\S]*?\)\s*;/);
      found.push({ file: file.name, table, body: body ? body[0] : '', sql });
    }
  }
  return found;
}

test('Given the CITES gate exists, when someone tidies up, then it is not removed as unused', () => {
  /* 아직 부르는 곳이 없다는 이유로 지워지면, 나중에 양도를 만들 때 규칙을
     새로 쓰게 됩니다. 규칙은 한 벌이어야 합니다. */
  const v64 = sqlFiles().find(f => f.name === 'supabase_v64.sql');
  assert.ok(v64, 'supabase_v64.sql must exist — it carries the CITES document gate');
  assert.match(stripped(v64.text), /create or replace function public\.assert_cites_transferable/,
    'public.assert_cites_transferable must survive; the future transfer flow is required to call it');
});

test('Given a transfer ledger is added, when it references animals, then it must not cascade', () => {
  const tables = transferTables();
  if (!tables.length) return; // 아직 없습니다. 이 검사는 표가 생기면 깨어납니다.

  for (const { file, table, body } of tables) {
    assert.ok(!/references\s+public\.animals/.test(body),
      `${file}: ${table} must not carry a foreign key to animals — save_row deletes and re-inserts the ` +
      `animal row on every edit, so the cascade would erase the transfer history (see supabase_v64.sql)`);
    assert.ok(!/on delete cascade/.test(body),
      `${file}: ${table} must not carry on delete cascade for the same reason`);
  }
});

test('Given a transfer ledger is added, when ownership moves, then the CITES gate is called', () => {
  const tables = transferTables();
  if (!tables.length) return;

  for (const { file, table, sql } of tables) {
    assert.match(sql, /assert_cites_transferable/,
      `${file}: ${table} introduces a transfer path, so this migration must call ` +
      `public.assert_cites_transferable before moving ownership — otherwise a CITES animal that ` +
      `cannot be published can still be handed over, which is the exact hole v64 closes`);
  }
});

test('Given a transfer ledger is added, when it is written, then the history cannot be erased', () => {
  const tables = transferTables();
  if (!tables.length) return;

  for (const { file, table, sql } of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`),
      `${file}: ${table} must enable RLS`);
    assert.ok(!new RegExp(`create policy [a-z0-9_]*${table}[a-z0-9_]*_delete`).test(sql),
      `${file}: ${table} must not carry a delete policy — a transfer ledger is append-only`);
    assert.ok(!new RegExp(`grant[^;]*\\bdelete\\b[^;]*on public\\.${table}`).test(sql),
      `${file}: members must not be granted delete on ${table}`);
  }
});

test('Given an animal changes owner, when the pedigree is drawn, then the design note was read', () => {
  const tables = transferTables();
  if (!tables.length) return;

  /* 넘긴 개체를 부모로 쓴 자식의 혈통이 끊깁니다. 스냅샷 보존이 필요하고,
     그 결정을 안 하고 표부터 만들면 나중에 데이터가 이미 깨져 있습니다. */
  const roadmap = path.join(root, 'plans', 'transfer-docs-roadmap.md');
  assert.ok(fs.existsSync(roadmap),
    'plans/transfer-docs-roadmap.md must exist — it holds the pedigree-snapshot decision the ' +
    'transfer flow depends on');

  for (const { file, table, sql } of tables) {
    assert.ok(/parent|pedigree|혈통|snapshot/.test(sql),
      `${file}: ${table} moves an animal between owners, which orphans its children's pedigree. ` +
      `Record how parents are preserved (a snapshot column, or an explicit note) before shipping — ` +
      `see plans/transfer-docs-roadmap.md`);
  }
});
