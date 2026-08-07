const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const SQL = read('supabase_v61.sql');
const LOGIN = read('gecko/login.html');

/* 허용 글자 목록은 화면과 서버 두 곳에 있습니다. 갈라지면 화면은 통과시키고
   서버가 막는, 사용자에게 설명할 수 없는 상태가 됩니다. */
const PATTERN = '[A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣぁ-ゖァ-ヺー一-鿿 ._-]';

test('Given the allowed characters, when both sides check, then they use the same list', () => {
  assert.ok(SQL.includes("'^" + PATTERN + "+$'"), 'SQL 쪽 목록이 다릅니다');
  assert.ok(LOGIN.includes('/^' + PATTERN + '+$/'), '화면 쪽 목록이 다릅니다');
});

test('Given a name, when it holds pictographs, then it is refused', () => {
  const re = new RegExp('^' + PATTERN + '+$');
  [['행복한 집사 001', true], ['Ryang Gecko', true], ['ryang_studio', true],
   ['gecko-2', true], ['량.스튜디오', true], ['すずめ', true], ['小龙', true],
   ['량스튜디오 🐍', false], ['🦎', false], ['ㅋㅋ^^', false], ['hi :)', false],
   ['hello♥', false], ['집사👍', false], ['Ryang™', false]].forEach(function (pair) {
    assert.equal(re.test(pair[0]), pair[1], JSON.stringify(pair[0]));
  });
});

test('Given the rule lives in the database, when a client skips the form, then it still holds', () => {
  /* 화면 검사는 개발자도구로 넘어갑니다. */
  assert.match(SQL, /create or replace function private\.is_plain_name/);
  assert.match(SQL, /NICKNAME_CHARSET/);
  assert.match(SQL, /NAME_CHARSET/);
  /* 이름은 닉네임 트리거에 얹으면 안 됩니다 — 그 트리거는 nickname 이 바뀔
     때만 돌아서, 이름만 고치는 저장에서는 검사가 새어 나갑니다. */
  assert.match(SQL, /create trigger profiles_name_guard\s*\n\s*before insert or update of name on public\.profiles/);
});

test('Given an admin sets a nickname, when it holds emoji, then the bypass does not excuse it', () => {
  /* 관리자가 넣어 준 이모지도 공개 화면에서는 똑같이 깨집니다. */
  const guard = SQL.slice(SQL.indexOf('function public.profiles_nickname_guard'));
  const body = guard.slice(0, guard.indexOf('$$;'));
  assert.ok(body.indexOf('NICKNAME_CHARSET') < body.indexOf('if bypass then'),
    '우회 검사보다 먼저 걸러야 합니다');
});

test('Given rows already hold emoji, when the migration runs, then they are cleaned instead of stuck', () => {
  /* 그대로 두면 그 회원이 다른 항목을 고칠 때마다 트리거가 막아 세웁니다.
     본인은 왜 막히는지 모릅니다. */
  assert.match(SQL, /regexp_replace\(r\.name/);
  assert.match(SQL, /regexp_replace\(r\.nickname/);
  /* 정리하다 빈 이름이 되면 새로 지어 줍니다. */
  assert.match(SQL, /if fixed is null or exists[\s\S]{0,200}generate_nickname\(\)/);
  /* 정리는 본인 변경 횟수를 쓰면 안 됩니다. */
  assert.match(SQL, /\$cleanup\$[\s\S]{0,400}set_config\('app\.nickname_bypass', '1', true\)/);
});

test('Given signup is split, when someone picks business, then the extra fields appear', () => {
  assert.match(LOGIN, /let JOIN_KIND='personal';/);
  assert.match(LOGIN, /function bizSignupHTML\(\)\{\s*\n\s*if\(JOIN_KIND!=='business'\) return '';/);
  assert.match(LOGIN, /joinKindHTML\(\)\+profileHTML\(\)\+bizSignupHTML\(\)/);
});

test('Given the three signup paths, when any is used, then the same checks run', () => {
  /* 이메일 가입 · 구글 가입 · 이미 가입했지만 동의를 안 한 계정.
     하나만 막으면 나머지로 이모지나 빈 상호명이 들어옵니다. */
  const hits = LOGIN.match(/\{ const p=joinProblem\(c\); if\(p\) return say\('e',p\); \}/g) || [];
  assert.equal(hits.length, 3, '가입 경로 3곳 모두에서 검사해야 합니다');
  assert.equal((LOGIN.match(/function joinProblem/g) || []).length, 1);
});

test('Given a business signup, when the application fails, then the account still stands', () => {
  /* 계정은 이미 만들어졌고 무료로 쓸 수 있습니다. 신청 실패로 가입을
     되돌리면 그 사람은 아무것도 못 가진 채 남습니다. */
  assert.match(LOGIN, /async function submitJoinBusiness[\s\S]{0,400}catch\(e\)\{/);
  assert.match(LOGIN, /if\(!r\.error\) await submitJoinBusiness\(c\);/);
});

test('Given a brand-new business account, when it applies, then premium is not required', () => {
  /* v60 은 신청에 프리미엄을 요구했습니다. 가입 화면에서 바로 신청하는데
     갓 만든 계정이 프리미엄일 수는 없어, 그 자리에서 막혔을 것입니다. */
  const fn = SQL.slice(SQL.indexOf('function public.apply_business_verification'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.doesNotMatch(body, /care_is_premium/);
  assert.doesNotMatch(body, /BIZ_PREMIUM_REQUIRED/);
  /* 승인은 여전히 사람이 합니다 — 신청을 여는 것과 인증이 붙는 것은 다릅니다. */
  assert.match(body, /status = 'pending'/);
});

test('Given the new copy, when a language is missing a line, then Korean shows through', () => {
  const keys = ['joinKind', 'joinPersonal', 'joinBusiness', 'joinPersonalHint',
    'joinBusinessHint', 'joinBizNote', 'nameCharset', 'nickCharset'];
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const dict = read('gecko/login-i18n-' + lang + '.js');
    keys.forEach(key => assert.match(dict, new RegExp(key + '\s*:'), lang + ' 에 ' + key + ' 가 없습니다'));
  });
});
