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

test('Given transfer is a paid feature, when the block renders, then the tier decides', () => {
  assert.match(read('assets/studio-config.js'), /var TRANSFER_ACCESS = 'premium';/);
  const ui = read('care/animal-ui.js');
  assert.match(ui, /function transferVisible\(\)/);
  assert.match(ui, /A\.premium && A\.premium\.active/);
  /* 스위치를 모르는 옛 캐시는 꺼짐으로 봅니다. */
  assert.match(ui, /typeof TRANSFER_ACCESS === 'undefined' \? 'off'/);
  assert.match(ui, /if \(!transferVisible\(\)\) return '';/);
});

test('Given a premium keeper hands to a free member, when the link opens, then the tier is not asked again', () => {
  /* 받는 쪽까지 프리미엄을 물으면 파는 사람을 막는 셈이 됩니다. 받는 쪽은
     개체 상한만 봅니다 — 그건 서버가 accept 안에서 셉니다. */
  const rc = read('care/transfer-ui.js');
  assert.doesNotMatch(rc, /premium/i, '받는 화면은 등급을 묻지 않습니다');
  assert.match(read('supabase_v65.sql'), /ANIMAL_LIMIT_REACHED/);
});

test('Given it is sold as a premium feature, when someone reads the pricing, then it is listed there', () => {
  /* 돈을 받는 기능이면 요금 안내에 적혀 있어야 합니다. */
  const t = read('pricing-i18n.js');
  for (const w of ['개체 양도', 'Hand an animal over', '個体の譲渡', '个体转让']) {
    assert.ok(t.indexOf(w) >= 0, '요금 문구 없음: ' + w);
  }
  const html = read('pricing.html');
  assert.match(html, /data-pt="p8"/, '혜택 줄이 밀려나야 합니다');
  assert.match(html, /data-pt="r14"/, '비교표 줄이 밀려나야 합니다');
});

test('Given a link is opened, when the visitor is not signed in, then login comes before the preview', () => {
  /* peek_animal_transfer 가 익명에게 닫혀 있습니다(supabase_v65 에서 일부러
     revoke). 미리보기에 이름·모프·거래 금액이 들어가는데, 링크가 어디로
     굴러갈지는 보낸 사람도 모릅니다. */
  const src = read('care/transfer-ui.js');
  const boot = src.slice(src.indexOf('async function boot()'));
  assert.ok(boot.indexOf('rcLoginTitle') < boot.indexOf("rpc('peek_animal_transfer'"),
    '로그인 확인이 미리보기보다 먼저 와야 합니다');
  assert.match(boot, /next: next/, '돌아올 주소를 실어야 합니다');
});

test('Given the sender opens their own link, when the screen loads, then it does not offer to accept', () => {
  const src = read('care/transfer-ui.js');
  const boot = src.slice(src.indexOf('async function boot()'));
  assert.match(boot, /if \(p\.mine\)/);
  assert.ok(boot.indexOf('p.mine') < boot.indexOf("p.status !== 'pending'"),
    '본인 링크 검사가 먼저여야 합니다');
  /* 되돌릴 수 없으니 한 번 더 묻습니다. */
  assert.match(src, /confirm\(I\.t\('rcConfirm'\)\)/);
});

test('Given the receiving screen, when it talks to the server, then it only calls the two allowed functions', () => {
  /* 받는 화면이 animals 표에 직접 붙으면 RLS 로도 못 막는 실수가 생깁니다. */
  const src = read('care/transfer-ui.js');
  assert.match(src, /rpc\('peek_animal_transfer'/);
  assert.match(src, /rpc\('accept_animal_transfer'/);
  assert.doesNotMatch(src, /\.from\(/);
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
