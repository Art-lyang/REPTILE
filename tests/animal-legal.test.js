const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 법적 지위와 서류 (CITES) — 화면
   ---------------------------------------------------------------------------
   supabase_v64.sql 이 DB 를 다 만들어 두었는데 화면이 없었습니다. 그래서
   legal_status 를 고를 자리조차 없었고, 손 검증도 SQL 로만 할 수 있었습니다. */

const ROOT = path.resolve(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

function load() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('care/animal-legal.js'), ctx);
  return ctx.window.AnimalLegal;
}

test('Given the server decides, when the screen renders, then it does not judge again', () => {
  /* my_animal_legal 이 docs_required · docs_ok · locked 를 계산해서 줍니다.
     화면이 따로 세면 서버와 어긋나고, 어긋난 쪽은 늘 화면입니다. */
  const ui = read('care/animal-legal-ui.js');
  assert.match(ui, /info\.docs_required/);
  assert.match(ui, /info\.docs_ok/);
  assert.match(ui, /info\.locked/);
  assert.doesNotMatch(ui, /cites_docs_ok|legal_docs_required/);
});

test('Given a document is core or supporting, when the list renders, then they are told apart', () => {
  /* 섞어 두면 수입신고필증을 올리고 왜 아직 막히는지 알 수 없습니다. */
  const L = load();
  /* vm 안에서 만든 배열이라 프로토타입이 달라 deepEqual 이 그대로는 안 맞습니다. */
  assert.deepEqual(Array.from(L.CORE_KINDS), ['cites_import', 'cites_export', 'cites_reexport',
    'cites_certificate', 'artificial_propagation']);
  /* supabase_v64.sql 의 cites_docs_ok 와 같은 목록이어야 합니다. */
  const sql = read('supabase_v64.sql');
  L.CORE_KINDS.forEach(k => assert.match(sql, new RegExp(k), k));
  assert.match(read('care/animal-legal-ui.js'), /legalCoreDocs[\s\S]{0,80}legalExtraDocs/);
});

test('Given a file name, when it is uploaded, then the path matches what the server accepts', () => {
  /* 서버 CHECK 가 'd/u_<uuid>_<파일명>' 만 받습니다. 한글 파일명이 그대로
     올라가면 거절되는데, 그 이유는 화면에 안 보입니다. */
  const L = load();
  const uuid = '11111111-1111-4111-8111-111111111111';
  const rule = /^d\/u_[0-9a-f-]{36}_[A-Za-z0-9._-]{1,80}$/;
  ['허가서.pdf', 'a b/c.PNG', 'no-extension', '../escape.pdf'].forEach(function (name) {
    assert.match(L.pathFor(uuid, name), rule, name);
  });
  assert.match(read('supabase_v64.sql'), /\^d\/u_\[0-9a-f-\]\{36\}_\[A-Za-z0-9\._-\]\{1,80\}\$/);
});

test('Given marking CITES cannot be undone, when it is chosen, then the screen asks first', () => {
  /* 누른 뒤에 알려주면 늦습니다 — 되돌리는 것은 관리자만 할 수 있습니다. */
  const ui = read('care/animal-ui.js');
  assert.match(ui, /isCites\(status\)[\s\S]{0,120}confirm\(I\.t\('legalOneWayHint'\)\)/);
});

test('Given documents are private, when one is opened, then it goes through a signed URL', () => {
  /* 서류에는 상대방 이름·주소·허가번호가 들어갑니다. 공개 주소가 있으면
     안 됩니다 — 버킷도 비공개입니다. */
  const L = load();
  assert.equal(L.BUCKET, 'animal-documents');
  assert.match(read('care/animal-legal.js'), /createSignedUrl/);
  assert.match(read('supabase_v64.sql'), /'animal-documents', 'animal-documents', false/);
});

test('Given v64 may not be applied, when the screen loads, then it simply omits the section', () => {
  /* 아직 안 올린 환경에서 화면 전체가 죽으면 안 됩니다. */
  const ui = read('care/animal-ui.js');
  assert.match(ui, /catch \(e\) \{ S\.legal = null; \}/);
  assert.match(ui, /if \(!Ui \|\| !S\.legal\) return '';/);
});

test('Given four languages, when the section renders, then none falls back to Korean', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  ['ko', 'en', 'zh', 'ja'].forEach(l => vm.runInContext(read('care/care-i18n-' + l + '.js'), ctx));
  const L = ctx.window.CareI18nLocales;
  const keys = Object.keys(L.ko).filter(k => /^(legal|doc_)/.test(k));
  assert.ok(keys.length >= 40, '문구가 ' + keys.length + '개뿐입니다');
  ['en', 'ja', 'zh'].forEach(function (lang) {
    const same = keys.filter(k => L[lang][k] === L.ko[k]);
    assert.deepEqual(same, [], lang + ' 번역 누락: ' + same.join(', '));
  });
  /* 서류 종류는 서버 CHECK 의 목록과 하나도 빠짐없이 짝이 맞아야 합니다. */
  load().ALL_KINDS.forEach(k => assert.ok(L.ko['doc_' + k], 'doc_' + k + ' 문구 없음'));
});
