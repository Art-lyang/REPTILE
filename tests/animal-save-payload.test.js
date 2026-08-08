const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/* 개체를 새로 만들 때 보내야 하는 칸
   ---------------------------------------------------------------------------
   save_row 는 insert 를 이렇게 합니다 (supabase_v54.sql).

     insert into animals select * from jsonb_populate_record(null::animals, p_row)

   select * 라서 컬럼 기본값이 안 먹습니다. 화면이 안 보낸 칸은 NULL 로 들어가고,
   not null 이면 23502 로 거절됩니다. 화면에는 '입력한 정보를 저장할 수 없습니다'
   라는 뭉뚱그린 문구만 떠서 무엇이 빠졌는지 알 수 없습니다.

   고칠 때는 안 드러납니다 — save_row 가 기존 줄을 먼저 병합하니 빠진 칸이 옛
   값으로 채워집니다. 새로 만들 때만 깨집니다. 실제로 v54 가 free_pinned 를
   not null 로 더한 뒤 개체 등록이 막혀 있었고, 수정이 멀쩡해서 한참 뒤에야
   드러났습니다.

   그래서 마이그레이션을 훑어 not null 칸을 모으고, 화면이 보내는 목록과
   대조합니다. 다음에 누가 not null 칸을 더하면 여기서 걸립니다. */

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

function migrations() {
  return fs.readdirSync(ROOT)
    .filter(name => /^supabase_.*\.sql$/.test(name))
    .map(name => ({ name, sql: read(name) }));
}

/* animals 에 더해진 not null 칸을 모읍니다. 'add column [if not exists] <이름>
   <타입> ... not null' 형태만 봅니다 — 표를 처음 만드는 create table 안쪽은
   setup 에 있고, 거기 있는 칸은 화면이 이미 다 보내고 있습니다. */
function notNullAnimalColumns() {
  const found = new Map();
  for (const { name, sql } of migrations()) {
    const re = /alter\s+table\s+public\.animals\s+([\s\S]*?);/gi;
    let block;
    while ((block = re.exec(sql)) !== null) {
      const body = block[1];
      const colRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+([^,]*)/gi;
      let col;
      while ((col = colRe.exec(body)) !== null) {
        const [, column, rest] = col;
        if (!/\bnot\s+null\b/i.test(rest)) continue;
        if (!found.has(column)) found.set(column, name);
      }
    }
  }
  return found;
}

/* care-app.js 의 saveAnimal 이 채우는 기본값 키. */
function clientDefaults() {
  const app = read('care/care-app.js');
  const at = app.indexOf('async saveAnimal(');
  assert.ok(at > 0, 'saveAnimal 을 찾지 못했습니다');
  const chunk = app.slice(at, at + 700);
  const block = chunk.match(/Object\.assign\(\{([\s\S]*?)\},\s*row/);
  assert.ok(block, 'saveAnimal 의 기본값 묶음을 찾지 못했습니다');
  return new Set([...block[1].matchAll(/([a-z0-9_]+)\s*:/g)].map(m => m[1]));
}

/* 폼이 늘 채워 보내는 칸. 기본값 묶음에 없어도 이쪽에 있으면 괜찮습니다 —
   종처럼 사용자가 반드시 고르는 값이 그렇습니다. */
function formFields() {
  const keys = new Set();
  [['care/care-animal-form.js', 'const fields = {'],
   ['care/breeding-animal-panel.js', 'const row = {']].forEach(function (pair) {
    const src = read(pair[0]);
    const at = src.indexOf(pair[1]);
    if (at < 0) return;
    const chunk = src.slice(at, at + 900);
    const body = chunk.slice(0, chunk.indexOf('};') + 1);
    [...body.matchAll(/([a-z0-9_]+)\s*:/g)].forEach(m => keys.add(m[1]));
  });
  return keys;
}

test('Given a migration adds a not null column, when a new animal is saved, then the screen sends it', () => {
  const required = notNullAnimalColumns();
  const sent = clientDefaults();
  /* save_row 가 스스로 채우는 것들은 화면이 보낼 필요가 없습니다. */
  const filledByServer = new Set(['id', 'user_id', 'device', 'created_at']);

  const fields = formFields();
  const missing = [...required.keys()]
    .filter(c => !sent.has(c) && !fields.has(c) && !filledByServer.has(c));

  assert.deepEqual(missing, [],
    'care-app.js 의 saveAnimal 기본값에 없는 not null 칸: '
    + missing.map(c => c + ' (' + required.get(c) + ')').join(', ')
    + ' — 이 상태로는 개체를 새로 만들 때 23502 로 거절됩니다');
});

test('Given the regression that started this, when free_pinned is checked, then it is sent', () => {
  /* v54 가 더한 칸입니다. 이것 하나 때문에 개체 등록이 막혀 있었습니다. */
  assert.match(read('supabase_v54.sql'), /add column if not exists free_pinned boolean not null/);
  assert.ok(clientDefaults().has('free_pinned'));
});

test('Given both screens create animals, when they save, then they go through one place', () => {
  /* 케어와 브리딩이 각자 save_row 를 부르면 한쪽만 고치게 됩니다. 둘 다
     A.saveAnimal 을 거쳐야 기본값이 한 곳에서 채워집니다. */
  assert.match(read('care/breeding-animal-panel.js'), /A\.saveAnimal\(/);
  assert.match(read('care/care-animal-form.js'), /A\.saveAnimal\(/);
  /* 개체를 save_row 로 직접 넣는 곳이 있으면 안 됩니다. */
  ['care/care-animal-form.js', 'care/breeding-animal-panel.js'].forEach(function (file) {
    assert.doesNotMatch(read(file), /saveRow\(\s*'animals'/, file);
  });
});

test('Given save_row bypasses column defaults, when someone reads the code, then it says so', () => {
  /* 이 함정은 코드만 봐서는 안 보입니다. 다음 사람이 같은 것을 밟지 않게
     이유를 적어 둡니다. */
  const app = read('care/care-app.js');
  assert.match(app, /jsonb_populate_record/);
  assert.match(app, /23502/);
});
