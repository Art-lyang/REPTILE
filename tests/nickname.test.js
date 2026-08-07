const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const SQL = read('supabase_v59.sql');
const LOGIN = read('gecko/login.html');

test('Given a blank nickname, when a profile row is written, then the database names it', () => {
  /* 닉네임이 들어오는 길이 여럿입니다 — save_consent, set_my_nickname, profiles
     직접 수정, 앞으로 생길 화면. 각 길목에서 검사하면 하나를 빠뜨리는 순간
     이름 없는 계정이 다시 생깁니다. 그래서 표에 트리거를 답니다. */
  assert.match(SQL, /create trigger profiles_nickname_guard[\s\S]*?before insert or update of nickname on public\.profiles/);
  assert.match(SQL, /create or replace function private\.generate_nickname/);
});

test('Given a member clears the nickname, when it regenerates, then it does not consume a change', () => {
  /* 지웠다 저장하기를 반복하면 원하는 이름이 나올 때까지 돌릴 수 있습니다.
     그걸 'user' 로 세면 2회 제한이 그대로 우회됩니다. */
  const guard = SQL.slice(SQL.indexOf('function public.profiles_nickname_guard'));
  const blank = guard.slice(guard.indexOf('if cleaned is null then'));
  assert.match(blank.slice(0, 400), /'auto'/);
  assert.doesNotMatch(blank.slice(0, 400), /'user'/);
});

test('Given an account that never had a nickname, when one is assigned, then it is not a change', () => {
  /* 기존 가입자 채우기가 이 길로 지납니다. '본인 변경' 으로 세면 첫 이름을
     받자마자 2번 중 1번을 잃습니다. */
  const guard = SQL.slice(SQL.indexOf('function public.profiles_nickname_guard'));
  assert.match(guard, /if previous is null then[\s\S]{0,220}'auto'/);
});

test('Given duplicate nicknames are cleaned up, when the loser is renamed, then it costs them nothing', () => {
  const dedupe = SQL.slice(SQL.indexOf('row_number() over (partition by lower(nickname)') - 500);
  assert.match(dedupe.slice(0, 900), /set_config\('app\.nickname_bypass', '1', true\)/);
  assert.match(dedupe.slice(0, 1200), /set_config\('app\.nickname_bypass', '0', true\)/);
});

test('Given the two-change limit, when it is counted, then an admin reset excludes older changes', () => {
  assert.match(SQL, /NICKNAME_CHANGE_LIMIT/);
  /* 초기화가 '이력 삭제' 면 공개 이력이 사라집니다. 기준 시각을 옮깁니다. */
  assert.match(SQL, /nickname_reset_at/);
  assert.match(SQL, /c\.created_at > coalesce\([\s\S]*?nickname_reset_at/);
  assert.doesNotMatch(SQL, /delete from public\.nickname_changes/);
});

test('Given duplicate nicknames, when one is saved, then it is rejected case-insensitively', () => {
  assert.match(SQL, /NICKNAME_TAKEN/);
  assert.match(SQL, /create unique index[\s\S]*?profiles_nickname_unique[\s\S]*?lower\(nickname\)/);
});

test('Given RAISE is used, when the message is built, then no format string meets USING message', () => {
  /* v55 에서 이 조합으로 42601 이 나 마이그레이션 전체가 되돌아갔습니다. */
  assert.doesNotMatch(SQL, /raise exception '[^']*'[^;]*using[^;]*message/i);
});

test('Given the history is read, when a caller asks, then each function is scoped to who may see it', () => {
  /* 본인 이력은 definer 여야 합니다 — nickname_changes 는 authenticated 에서
     회수했으므로 invoker 로 두면 늘 0 이 나옵니다. */
  assert.match(SQL, /function public\.my_nickname_status\(\)\s*\nreturns jsonb language sql stable security definer/);
  /* 공개 이력의 입구는 공유 토큰입니다. 아무 회원이나 남의 이력을 못 봅니다. */
  assert.match(SQL, /function public\.public_nickname_history\(p_token text\)/);
  assert.match(SQL, /where a\.share_token = p_token and a\.is_public = true and a\.public_breeder = true/);
  /* 관리자 전용은 함수 안에서 스스로 확인해야 합니다. */
  assert.match(SQL, /function public\.admin_nickname_changes[\s\S]*?is_owner/);
  assert.match(SQL, /function public\.admin_reset_nickname_changes[\s\S]*?is_owner/);
  assert.match(SQL, /function public\.admin_set_nickname[\s\S]*?is_owner/);
  assert.doesNotMatch(SQL, /grant execute on function public\.admin_[a-z_]*nickname[a-z_]*\([^)]*\) to anon/);
});

test('Given the table is new, when privileges are set, then anon and authenticated cannot touch it', () => {
  /* v57 에서 참조표 8개에 anon 쓰기가 열려 있던 걸 발견했습니다. 같은 실수를
     새 표에서 반복하지 않습니다. */
  assert.match(SQL, /revoke all on public\.nickname_changes from anon, authenticated;/);
});

test('Given signup, when the nickname is empty, then the form refuses before the round trip', () => {
  assert.match(LOGIN, /nicknameRequired/);
  /* 가입 갈래가 셋입니다 — 이메일 가입, 구글 가입, 이미 가입했지만 동의를 안 한
     계정. 하나만 막으면 나머지로 빈 닉네임이 들어옵니다. */
  const hits = LOGIN.match(/if\(!c\.nickname\) return say\('e',t\('nickNeeded'\)\);/g) || [];
  assert.equal(hits.length, 3, '가입 경로 3곳 모두에서 막아야 합니다');
});

test('Given the account screen, when the nickname is cleared, then it is not merged away by save_consent', () => {
  /* save_consent 는 nullif(trim(...),'') 로 빈 값을 NULL 로 바꾼 뒤
     coalesce(excluded.nickname, p.nickname) 로 합칩니다. 그 길로 보내면
     '지우고 저장' 이 '건드리지 않음' 과 구별되지 않습니다. */
  assert.match(SQL, /create or replace function public\.set_my_nickname\(p_nickname text\)/);
  assert.match(LOGIN, /SB\.rpc\('set_my_nickname',\{p_nickname:wanted\}\)/);
  assert.match(LOGIN, /nickname:legacy\?\(wanted\|\|null\):null/);
  /* 서버가 지어 준 이름을 칸에 되돌려 주지 않으면 저장이 안 된 것처럼 보입니다. */
  assert.match(LOGIN, /function applyNickResult\(data\)[\s\S]{0,220}input\.value=data\.nickname\|\|''/);
  /* 저장 절차를 두 화면(일반 계정 · 관리자)이 같이 씁니다. 한쪽에 복사해 두면
     그 화면에서만 조용히 옛 동작이 남습니다. */
  assert.equal((LOGIN.match(/async function submitNickname/g) || []).length, 1);
  assert.equal((LOGIN.match(/await submitNickname\(/g) || []).length, 2);
  assert.equal((LOGIN.match(/applyNickResult\(/g) || []).length, 3); // 정의 1 + 호출 2
});

test('Given v59 is not applied yet, when the account screen saves, then it falls back instead of losing the edit', () => {
  assert.match(LOGIN, /set_my_nickname\|does not exist\|PGRST202/);
  /* 상태 조회가 실패해도 계정 화면 전체가 멈추면 안 됩니다. */
  assert.match(LOGIN, /return r\.error\? null : r\.data/);
});

test('Given a server-side nickname error, when it reaches the user, then it is not a raw English code', () => {
  const shared = read('gecko/login-i18n.js');
  assert.match(shared, /NICKNAME_TAKEN/);
  assert.match(shared, /NICKNAME_CHANGE_LIMIT/);
});

test('Given the admin card, when the change count is reset, then the history survives', () => {
  const ui = read('admin/admin-members.js');
  assert.match(ui, /admin_reset_nickname_changes/);
  /* 초기화는 되돌릴 수 없습니다. 물어보지 않으면 옆 회원을 누르는 실수가 그대로 반영됩니다. */
  assert.match(ui, /window\.confirm\(t\('nickResetConfirm'/);
  /* 이미 0회인 회원에게 버튼이 살아 있으면 눌러 보고 아무 일도 없는 줄 압니다. */
  assert.match(ui, /data-nick-reset="\$\{member\.user_id\}"\$\{used \? '' : ' disabled'\}/);
});

test('Given the member list is redrawn by search, when a card button is clicked, then it still works', () => {
  const ui = read('admin/admin-members.js');
  /* 목록을 다시 그리는 곳이 둘(전체 렌더 / 검색 결과)입니다. 배선을 양쪽에
     적어 두면 한쪽만 고치게 되고, 검색한 뒤 버튼이 죽습니다. */
  assert.match(ui, /function bindCards\(\)/);
  assert.equal((ui.match(/\bbindCards\(\);/g) || []).length, 2);
  assert.equal((ui.match(/\[data-nick-reset\]/g) || []).length, 1);
  assert.equal((ui.match(/\[data-limit-save\]/g) || []).length, 1);
});

test('Given v59 is not applied yet, when the admin list loads, then the member list still renders', () => {
  const ui = read('admin/admin-members.js');
  assert.match(ui, /state\.nicknames = \(!nicknames\.error && nicknames\.data\) \|\| \{\}/);
});

test('Given a buyer opens a breeder page, when the name is clicked, then the history loads once', () => {
  const ui = read('care/breeder-ui.js');
  assert.match(ui, /public_nickname_history/);
  assert.match(ui, /aria-expanded="false" aria-controls="nickHist"/);
  /* 대부분은 열어 보지 않습니다. 페이지를 열 때마다 부르면 헛일입니다. */
  assert.match(ui, /if \(!open \|\| nickLoaded\) return;/);
  /* 실패했으면 다시 열 때 재시도해야 합니다 — 안 그러면 오류 문구가 영구히 남습니다. */
  assert.match(ui, /nickHistoryError[\s\S]{0,80}nickLoaded = false;/);
});

test('Given the care dictionary, when a language is missing a key, then the breeder page shows a key name', () => {
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const dict = read('care/care-i18n-' + lang + '.js');
    ['nickHistory', 'nickHistoryEmpty', 'nickHistoryError'].forEach(function (key) {
      assert.match(dict, new RegExp(key + '\\s*:'), lang + ' 에 ' + key + ' 가 없습니다');
    });
  });
});

test('Given the admin dictionary, when a language is missing a key, then the card breaks', () => {
  const keys = ['nickHistory', 'nickHistoryEmpty', 'nickUsed', 'nickReset',
    'nickKindAuto', 'nickKindUser', 'nickKindAdmin', 'nickResetConfirm', 'nickResetFailed'];
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

test('Given an admin account, when they open their account page, then they can change their own nickname', () => {
  const shell = read('gecko/account-shell.js');
  /* 예전에는 관리자면 개요 말고는 아무 칸도 안 그렸습니다. 닉네임이 필수가 된
     뒤로는 관리자도 본인 이름을 바꿀 길이 있어야 합니다 — 개체를 공개하면
     그 닉네임이 브리더명으로 그대로 나갑니다. */
  assert.match(shell, /if \(options\.isAdmin\) \{[\s\S]*?data-account-pane="profile"/);
  /* 동의·보안·탈퇴는 여전히 관리자에게 보여 주지 않습니다.
     분기 안에도 같은 'return <nav class="account-tabs"' 가 있어서, 그걸 끝으로
     삼으면 정작 검사할 부분이 잘려 나갑니다. 블록의 닫는 괄호까지 자릅니다. */
  const start = shell.indexOf('if (options.isAdmin) {');
  const adminBranch = shell.slice(start, shell.indexOf('\n    }\n', start));
  assert.match(adminBranch, /data-account-pane="profile"/, '슬라이스가 잘못 잘렸습니다');
  assert.doesNotMatch(adminBranch, /data-account-pane="(privacy|security)"/);

  assert.match(LOGIN, /async function renderAdminProfile/);
  assert.match(LOGIN, /isAdmin\? renderAdminProfile\(run\) : renderConsentSettings\(run\)/);
  /* 관리자 칸은 set_my_nickname 만 씁니다. save_consent 를 거치면 동의 기록이
     같이 건드려집니다. */
  const branch = LOGIN.slice(LOGIN.indexOf('async function renderAdminProfile'));
  const body = branch.slice(0, branch.indexOf('\n}\n'));
  assert.doesNotMatch(body, /saveConsent/);
});

test('Given an admin fixes a nickname on request, when they save it, then it does not spend the member quota', () => {
  const ui = read('admin/admin-members.js');
  assert.match(ui, /admin_set_nickname/);
  assert.match(ui, /data-nick-save/);
  /* 비우면 서버가 새로 지어 줍니다 — 그 안내가 자리표시자에 있어야 합니다. */
  assert.match(ui, /placeholder="\$\{escape\(t\('nickBlankAuto'\)\)\}"/);
  /* 배선은 한 곳(bindCards)에만 있어야 합니다. */
  assert.equal((ui.match(/\[data-nick-save\]/g) || []).length, 1);
});

test('Given the admin summary text, when the profile tab exists, then it tells the admin where the nickname lives', () => {
  /* 이 문구는 '관리자에게는 무엇을 안 보여 주는지' 를 설명합니다. 프로필 칸이
     생겼는데 문구를 그대로 두면, 안 보여 준다고 적힌 것이 눈앞에 있는 셈이라
     관리자가 자기 눈을 의심합니다. 닉네임을 어디서 바꾸는지 말해 줘야 합니다. */
  const wants = { ko: '닉네임', en: 'nickname', ja: 'ニックネーム', zh: '昵称' };
  Object.keys(wants).forEach(function (lang) {
    const dict = read('gecko/login-i18n-' + lang + '.js');
    const value = /adminOnlySummary: '([^']*)'/.exec(dict);
    assert.ok(value, lang + ' 에 adminOnlySummary 가 없습니다');
    assert.ok(value[1].includes(wants[lang]),
      lang + ' 문구가 닉네임을 어디서 바꾸는지 알려 주지 않습니다: ' + value[1]);
  });
});

test('Given the login dictionary, when a language is missing a key, then the screens disagree', () => {
  const keys = ['nicknameRequired', 'nickNeeded', 'nickChangesLeft', 'nickChangesNone',
    'nickHistory', 'nickHistoryEmpty', 'nickKindAuto', 'nickKindUser', 'nickKindAdmin',
    'errNickTaken', 'errNickLimit'];
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const dict = read('gecko/login-i18n-' + lang + '.js');
    keys.forEach(function (key) {
      assert.match(dict, new RegExp(key + '\\s*:'), lang + ' 에 ' + key + ' 가 없습니다');
    });
  });
  /* {n} 자리를 안 채우면 '앞으로 {n}번' 이 그대로 보입니다. */
  assert.match(LOGIN, /replace\('\{n\}', String\(left\)\)/);
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const dict = read('gecko/login-i18n-' + lang + '.js');
    const line = dict.slice(dict.indexOf('nickChangesLeft'));
    assert.match(line.slice(0, 200), /\{n\}/, lang + ' 의 nickChangesLeft 에 {n} 이 없습니다');
  });
});
