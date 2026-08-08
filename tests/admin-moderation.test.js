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

test('Given the queue, when nothing is asked for, then private animals stay out', () => {
  const src = read('admin/admin-moderation.js');
  assert.match(src, /rpc\('admin_photo_queue'/);
  /* 기본값은 공개된 것만입니다. */
  assert.match(src, /withPrivate: false/);
  assert.match(read('supabase_v72.sql'), /p_include_private boolean default false/);
});

test('Given a report only comes after harm, when nothing is reported, then private can still be swept', () => {
  /* v70 은 공개된 것만 목록에 올렸습니다. 비공개는 개체 id 를 알아야 열 수
     있었는데, id 를 알려면 누군가 신고를 해야 합니다 — 신고 전에는 아무것도
     확인할 수 없는 구조였고, 그건 검수가 아니라 민원 처리입니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /data-mdprivate/);
  assert.match(src, /state\.withPrivate = !state\.withPrivate/);
  /* 켜기 전에 한 번 묻습니다 — 기록이 남는 행동입니다. */
  assert.match(src, /!confirm\('비공개 개체까지 목록에 올립니다/);
  /* 목록에 섞이면 어느 것이 비공개인지 보여야 합니다. */
  assert.match(src, /mdprivtag/);
});

test('Given private animals are swept, when the list loads, then one log row records it', () => {
  /* 한 장마다 남기면 목록을 한 번 열 때 수십 줄이 쌓여 조치 기록이 묻힙니다.
     남겨야 할 사실은 '누가 언제 비공개까지 훑었는가' 입니다. */
  const sql = read('supabase_v72.sql');
  assert.match(sql, /if p_include_private then/);
  assert.match(sql, /'비공개 포함 검수 목록 열람'/);
  /* 옛 서명을 남기면 화면이 어느 쪽을 부를지 모호해집니다. */
  assert.match(sql, /drop function if exists public\.admin_photo_queue\(boolean, int, int\);/);
});

test('Given a private animal is opened, when it is, then a reason is asked and recorded', () => {
  /* 목록으로 훑는 것과 사유를 남기고 한 건 보는 것은 다릅니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /prompt\('열람 사유를 남깁니다/);
  assert.match(src, /rpc\('admin_animal_detail', \{ p_animal: id, p_reason: why \}\)/);
  assert.match(read('supabase_v70.sql'), /values \(p_animal, a\.user_id, auth\.uid\(\), 'view', p_reason\)/);
});

test('Given photos are private, when a thumbnail shows, then it goes through a signed URL', () => {
  const src = read('admin/admin-moderation.js');
  assert.match(src, /createSignedUrl/);
  assert.match(src, /const BUCKET = 'animal-photos'/);
  assert.match(src, /storage\.from\(BUCKET\)\.createSignedUrl/);
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

test('Given the list only shows published animals, when one is private, then it can still be opened', () => {
  /* '자세히' 는 카드 위에만 있습니다. 목록에 안 뜨는 비공개 개체를 열 방법이
     없으면 '비공개는 사유가 있을 때 본다' 는 규칙이 실제로는 '못 본다' 가
     됩니다. 직접 여는 자리를 둡니다 — 같은 길이라 열람 기록도 똑같이 남습니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /id="mdFind"/);
  assert.match(src, /if \(d\.mdfind\)/);
  assert.match(src, /function openDetail\(id\)/);
  /* 목록의 '자세히' 와 조회창이 같은 함수를 씁니다 — 한쪽만 기록을 남기면 안 됩니다. */
  assert.match(src, /if \(d\.mddetail\) return openDetail\(d\.mddetail\);/);
  assert.match(src, /prompt\('열람 사유를 남깁니다/);
});

test('Given an old public URL was stored, when a thumbnail loads, then the path is re-signed', () => {
  /* 옛 판은 전체 공개 URL 을 저장했습니다. 버킷이 비공개로 바뀐 뒤로 그 주소를
     그대로 열면 404 Bucket not found 가 납니다. 경로만 뽑아 다시 서명받습니다
     — assets/photo.js 가 같은 일을 합니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /function pathOf\(value\)/);
  assert.match(src, /const mark = '\/' \+ BUCKET \+ '\/'/);
  /* 옛 방식 — 전체 URL 을 그대로 돌려주던 줄이 남아 있으면 안 됩니다. */
  assert.ok(!src.includes('.test(path)) return path;'),
    '전체 URL 을 그대로 여는 코드가 남아 있습니다');
});

test('Given the log exists, when an admin wants to check it, then a screen shows it', () => {
  /* 남기기만 하고 볼 수 없으면 기록이 아니라 그냥 표입니다. 부관리자를 두면
     '누가 언제 무엇을 왜' 에 답할 수 있어야 합니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /data-mdlog/);
  assert.match(src, /rpc\('admin_moderation_log'/);
  assert.match(src, /function logHtml\(\)/);
  /* 코드가 아니라 사람 말로 보여야 읽힙니다. */
  assert.match(src, /const ACTIONS = \{/);
  assert.match(src, /delete_photos: '사진 삭제'/);
});

test('Given a photo alone is not enough, when one animal is opened, then its data shows beside it', () => {
  /* 레오파드로 등록해 놓고 전혀 다른 동물 사진을 올린 경우는 사진만 봐서는
     모릅니다. 등록된 값을 나란히 놓아야 판단이 됩니다. */
  const src = read('admin/admin-moderation.js');
  assert.match(src, /function detailHtml\(\)/);
  ['species', 'sex', 'morphs', 'hets', 'note'].forEach(function (k) {
    assert.match(src, new RegExp('a\.' + k), k);
  });
  const sql = read('supabase_v73.sql');
  ['morphs', 'hets', 'life_stage', 'clutch_label', 'note'].forEach(function (k) {
    assert.match(sql, new RegExp("'" + k + "'"), k);
  });
});

test('Given a sweep and a detail differ, when either happens, then the log tells them apart', () => {
  /* 목록을 스친 것과 한 건을 열어 데이터까지 본 것은 무게가 다릅니다. 같은
     이름으로 쌓이면 '이 개체를 실제로 들여다본 적이 있는가' 에 답할 수 없습니다. */
  const sql = read('supabase_v73.sql');
  assert.match(sql, /'detail',\s*--/);
  assert.match(sql, /auth\.uid\(\), 'detail', p_reason/);
  assert.match(read('admin/admin-moderation.js'), /detail: '세부조회'/);
});
