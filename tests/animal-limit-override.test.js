const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

test('Given a per-member limit, when it is stored, then the range is checked in the database', () => {
  const sql = read('supabase_v58.sql');

  assert.match(sql, /add column if not exists animal_limit_override integer/);
  /* 0 이나 음수를 넣으면 그 회원은 아무것도 등록할 수 없게 됩니다. 그건
     '제한' 이 아니라 '차단' 이라 다른 기능이고, 실수로 그렇게 되면 안 됩니다. */
  assert.match(sql, /animal_limit_override between 1 and 100/);
  /* 화면 조건문만 믿으면 개발자도구로 넘어갑니다. */
  assert.match(sql, /raise exception 'ADMIN_LIMIT_OUT_OF_RANGE'/);
});

test('Given an adjusted member, when limits are decided, then the override wins over the tier default', () => {
  const sql = read('supabase_v58.sql');

  assert.match(sql, /create or replace function private\.care_effective_limit/);
  /* coalesce 순서가 뒤집히면 조정값이 무시되고 늘 기본값이 나옵니다. */
  assert.match(sql, /coalesce\(\s*\(select p\.animal_limit_override[\s\S]*?care_premium_limit\(\)[\s\S]*?care_free_limit\(\)/);

  /* 활성 판정도 조정값을 따라야 합니다. v54 판은 무료면 무조건 10 이라,
     상한을 30 으로 올려 준 무료 회원이 여전히 10마리만 쓸 수 있었습니다. */
  assert.match(sql, /limit private\.care_effective_limit\(p_user\)/);
});

test('Given only an owner may adjust, when the function runs, then it checks the caller itself', () => {
  const sql = read('supabase_v58.sql');

  /* 회원 제한·탈퇴는 Auth Admin API 가 필요해 Worker 를 거치지만, 이건 우리 표의
     컬럼 하나라 화면이 바로 부릅니다. 그래서 권한 확인이 함수 안에 있어야 합니다. */
  assert.match(sql, /create or replace function public\.admin_set_animal_limit/);
  assert.match(sql, /actor uuid := auth\.uid\(\)/);
  assert.match(sql, /not public\.is_owner_user\(actor\)[\s\S]*?ADMIN_OWNER_REQUIRED/);
  assert.match(sql, /grant execute on function public\.admin_set_animal_limit\(uuid,integer\) to authenticated/);
  assert.doesNotMatch(sql, /to anon;/);
});

test('Given a member without a profile row, when a limit is set, then the row is created instead of failing', () => {
  const sql = read('supabase_v58.sql');
  /* 동의만 하고 정보를 안 적은 회원은 profiles 줄이 없습니다. update 만 하면
     아무 일도 일어나지 않고 관리자는 저장된 줄 압니다. */
  assert.match(sql, /insert into public\.profiles\(user_id, animal_limit_override\)[\s\S]*?on conflict \(user_id\) do update/);
});

test('Given the admin screen, when a limit is edited, then it is validated before the round trip', () => {
  const ui = read('admin/admin-members.js');

  assert.match(ui, /function saveLimit/);
  assert.match(ui, /value < 1 \|\| value > 100/);
  assert.match(ui, /Number\.isInteger\(value\)/);
  /* 비우면 조정 해제입니다 — 0 으로 저장하면 그 회원이 막힙니다. */
  assert.match(ui, /raw === '' \? null : Number\(raw\)/);
  /* 관리자 자신과 다른 관리자에게는 칸이 나오지 않아야 합니다. */
  assert.match(ui, /if \(member\.is_admin \|\| member\.user_id === state\.adminUser\.id\) return '';/);
});

test('Given v58 is not applied yet, when the admin screen loads, then it still renders', () => {
  const ui = read('admin/admin-members.js');
  /* 함수가 없으면 목록 조회가 실패합니다. 그때 화면 전체가 멈추면 안 됩니다. */
  assert.match(ui, /state\.limits = \(!limits\.error && limits\.data\) \|\| \{\}/);
});

test('Given an adjusted member, when the care banner explains the limit, then it does not repeat the tier default', () => {
  const ui = read('care/care-ui.js');
  const app = read('care/care-app.js');

  /* 10마리라고 적혀 있는데 30마리를 쓰고 있으면 문의가 옵니다. */
  assert.match(ui, /q\.custom \? I\.t\('quotaCustomHint'/);
  assert.match(app, /custom: !!q\.custom/);

  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    assert.match(read('care/care-i18n-' + lang + '.js'), /quotaCustomHint\s*:/, lang);
  });
});

test('Given the admin dictionary, when a language is missing a key, then the screens disagree', () => {
  const keys = ['animalLimit', 'save', 'animalLimitDefault', 'animalLimitHintDefault',
    'animalLimitHintCustom', 'animalLimitRange', 'animalLimitFailed'];
  const source = read('admin/admin-members-i18n.js');
  ['ko', 'en', 'zh', 'ja'].forEach(function (lang) {
    const start = source.indexOf('\n    ' + lang + ': {');
    assert.notEqual(start, -1, lang + ' 사전이 없습니다');
    const block = source.slice(start, source.indexOf('\n    },', start));
    keys.forEach(function (key) {
      assert.match(block, new RegExp(key + '\\s*:'), lang + ' 에 ' + key + ' 가 없습니다');
    });
  });
});
