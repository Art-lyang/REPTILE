const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 이미지 검수 화면
   ---------------------------------------------------------------------------
   사진은 아무거나 올라올 수 있고 지금까지 아무도 보지 않았습니다. QR·링크로
   돌고 크롤러가 주워 가면 걸리는 곳이 우리 도메인입니다. */

const ROOT = path.resolve(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

function load() {
  const ctx = { window: {}, document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(read('admin/admin-moderation.js'), ctx);
  return ctx.window.AdminModeration;
}

test('Given a category is chosen, when it is severe, then the action is deletion not a hold', () => {
  /* 유예를 두는 이유는 회원이 고칠 기회입니다. 성인물·도박은 고쳐서 될 성질이
     아니고, 유예 기간 동안 우리 서버에 두는 것 자체가 문제입니다. */
  const M = load();
  const severe = M.CATEGORIES.filter(c => c.severe).map(c => c.id);
  assert.deepEqual(Array.from(severe), ['adult', 'gambling', 'illegal', 'harm']);
  const mild = M.CATEGORIES.filter(c => !c.severe).map(c => c.id);
  assert.deepEqual(Array.from(mild), ['unrelated', 'copyright', 'other']);

  const src = read('admin/admin-moderation.js');
  assert.match(src, /severe \? 'admin_purge_photos' : 'admin_hold_animal'/);
  /* 되돌릴 수 없는 쪽은 한 번 더 묻습니다. */
  assert.match(src, /if \(severe && !confirm\(/);
});

test('Given the categories, when the server checks them, then both lists agree', () => {
  /* 화면에만 있는 분류를 고르면 CHECK 제약에 걸려 저장이 거절됩니다. */
  const sql = read('supabase_v68.sql');
  load().CATEGORIES.forEach(c => assert.match(sql, new RegExp("'" + c.id + "'"), c.id));
});

test('Given the queue, when it is fetched, then only published animals are listed', () => {
  /* 비공개까지 목록으로 훑는 것은 공개 페이지를 책임진다는 목적을 넘습니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /rpc\('admin_photo_queue'/);
  const sql = read('supabase_v70.sql');
  assert.match(sql, /coalesce\(a\.is_public, false\) or coalesce\(a\.is_listed, false\) or a\.held_at is not null/);
});

test('Given a private animal is opened, when it is, then a reason is asked and recorded', () => {
  /* 목록으로 훑는 것과 사유를 남기고 한 건 보는 것은 다릅니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /prompt\('열람 사유를 남깁니다/);
  assert.match(src, /rpc\('admin_animal_detail', \{ p_animal: d\.mddetail, p_reason: why \}\)/);
  assert.match(read('supabase_v70.sql'), /values \(p_animal, a\.user_id, auth\.uid\(\), 'view', p_reason\)/);
});

test('Given photos are private, when a thumbnail shows, then it goes through a signed URL', () => {
  const src = read('admin/admin-moderation.js');
  assert.match(src, /createSignedUrl/);
  assert.match(src, /from\('animal-photos'\)/);
  /* 서명을 기다리며 빈 화면을 보여 주지 않습니다 — 먼저 그리고 나중에 채웁니다. */
  assert.match(src, /function hydrate\(\)/);
});

test('Given the admin writes a reason, when the member sees it, then it is the same sentence', () => {
  /* 여기 적은 문장이 그대로 회원 배너에 뜹니다. 회원 쪽은 사유가 없을 때만
     분류 기본 문구로 넘어갑니다. */
  assert.match(read('admin/admin-moderation.js'), /회원에게 보일 사유/);
  assert.match(read('care/animal-hold.js'), /hold\.reason\s*\r?\n?\s*\? esc\(hold\.reason\)/);
});

test('Given the admin page, when it loads, then the tab is registered in all three places', () => {
  /* 하나만 빠져도 버튼은 보이는데 눌러도 아무 일이 없습니다. */
  const html = read('admin/index.html');
  assert.match(html, /\['mod','검수',true\]/);
  assert.match(html, /mod:tabModeration/);
  assert.match(html, /async function tabModeration\(\)/);
  assert.match(html, /admin-moderation\.js\?v=/);
  assert.match(html, /admin-moderation\.css\?v=/);
});
