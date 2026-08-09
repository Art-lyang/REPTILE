const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function load() {
  const ctx = { window: {}, location: { origin: 'https://ryangstudio.com' } };
  ctx.window.location = ctx.location;
  vm.createContext(ctx);
  vm.runInContext(read('care/animal-transfer.js'), ctx, { filename: 'animal-transfer.js' });
  vm.runInContext(read('care/animal-transfer-ui.js'), ctx, { filename: 'animal-transfer-ui.js' });
  return ctx.window;
}

const I = {
  t: (k, v) => k + (v ? ':' + JSON.stringify(v) : ''),
  formatDate: d => String(d),
  url: (p, q) => p + '?t=' + q.t
};
const CTX = { i18n: I, esc: s => String(s == null ? '' : s), animal: {} };

test('Given a transfer link, when it is built, then it points at the receiving screen not the public profile', () => {
  /* 공개 프로필은 누구나 보는 것이고, 이건 한 번 쓰고 닫히는 주소입니다.
     둘을 같은 곳으로 보내면 아무나 양수 화면을 열게 됩니다. */
  const w = load();
  const link = w.AnimalTransfer.linkOf('abc123', I);
  assert.match(link, /\/care\/transfer\.html\?t=abc123$/);
  assert.doesNotMatch(link, /p\.html/);
});

test('Given the server refuses, when the reason is CITES, then the member is told which paperwork', () => {
  const w = load();
  assert.equal(w.AnimalTransfer.reasonKey({ message: 'CITES_DOCS_REQUIRED' }), 'tfErrCites');
  assert.equal(w.AnimalTransfer.reasonKey({ message: 'ALREADY_TRANSFERRED' }), 'tfErrAlready');
  assert.equal(w.AnimalTransfer.reasonKey({ message: 'something else' }), null);
});

test('Given no transfer yet, when the block renders, then it warns before the link is made', () => {
  /* 되돌릴 수 없다는 말은 만들기 전에 보여야 합니다. 만든 뒤에 말하면
     안내가 아니라 통보입니다. */
  const w = load();
  const html = w.AnimalTransferUi.html(null, CTX);
  assert.match(html, /tf_create/);
  assert.match(html, /tfWarn/);
  assert.ok(html.indexOf('tfWarn') < html.indexOf('tf_create'), '경고가 버튼보다 먼저 와야 합니다');
  assert.doesNotMatch(html, /tf_cancel/);
});

test('Given a pending transfer, when the block renders, then it shows the link and a way to stop it', () => {
  const w = load();
  const html = w.AnimalTransferUi.html({ status: 'pending', token: 'tok', gens: 3 }, CTX);
  assert.match(html, /tf_link/);
  assert.match(html, /tf_copy/);
  assert.match(html, /tf_cancel/);
  assert.match(html, /tok/);
  /* 이미 발의했으면 다시 만들 자리가 없어야 합니다 — 링크가 둘이 되면
     누가 먼저 받는지 겨루게 됩니다. */
  assert.doesNotMatch(html, /tf_create/);
});

test('Given the animal was handed over, when the block renders, then it offers nothing but the fact', () => {
  const w = load();
  const html = w.AnimalTransferUi.html({ status: 'accepted', accepted_at: '2026-08-09' },
    { i18n: I, esc: CTX.esc, animal: { transferred_at: '2026-08-09' } });
  assert.match(html, /tfDone/);
  assert.match(html, /tfLocked/);
  assert.doesNotMatch(html, /tf_create|tf_cancel/);
});

test('Given the receiving screen does not exist yet, when the page renders, then the block stays hidden', () => {
  /* 켜면 열 곳 없는 링크를 만들게 됩니다. 그건 기능이 아니라 함정입니다. */
  assert.match(read('assets/studio-config.js'), /var TRANSFER_ENABLED = false;/);
  const ui = read('care/animal-ui.js');
  assert.match(ui, /typeof TRANSFER_ENABLED === 'undefined' \|\| !TRANSFER_ENABLED\) return '';/);
});

test('Given the ledger rules, when the client calls the server, then it never writes the table directly', () => {
  /* 거래 이력은 append-only 입니다. 화면이 표를 직접 건드리면 그 약속이
     깨집니다 — 반드시 RPC 로만 갑니다. */
  const src = read('care/animal-transfer.js');
  assert.doesNotMatch(src, /from\('animal_transfers'\)/);
  assert.match(src, /rpc\('start_animal_transfer'/);
  assert.match(src, /rpc\('cancel_animal_transfer'/);
  assert.match(src, /rpc\('my_animal_transfers'/);
});
