const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 사전 파일 하나에 문법 오류가 나면 그 화면이 통째로 죽습니다. 실제로
   영어 문구에 어포스트로피를 그대로 넣었다가 관리자 페이지가 백지가 됐습니다.
   정규식으로 키 존재만 보는 검사는 그걸 못 잡습니다 — 깨진 파일에도 키
   글자는 그대로 들어 있기 때문입니다. 그래서 여기서는 진짜로 실행합니다. */

const GROUPS = [
  { name: '관리자 회원 사전', files: ['admin/admin-members-i18n.js'] },
  {
    name: '로그인 사전',
    files: ['gecko/login-i18n-ko.js', 'gecko/login-i18n-en.js',
      'gecko/login-i18n-ja.js', 'gecko/login-i18n-zh.js'],
  },
  {
    name: '케어 사전',
    files: ['care/care-i18n-ko.js', 'care/care-i18n-en.js',
      'care/care-i18n-ja.js', 'care/care-i18n-zh.js'],
  },
];

function runInSandbox(files) {
  const window = {};
  const sandbox = { window, self: window, globalThis: window, document: undefined };
  sandbox.window = window;
  const context = vm.createContext(sandbox);
  files.forEach(function (file) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    /* 파일이 window 를 인자로 받는 IIFE 라 컨텍스트의 전역이 곧 window 여야 합니다. */
    vm.runInContext(source, context, { filename: file });
  });
  return window;
}

GROUPS.forEach(function (group) {
  test(`Given ${group.name}, when each file is executed, then none has a syntax error`, () => {
    assert.doesNotThrow(() => runInSandbox(group.files));
  });
});

/* 로그인 사전은 Object.assign({}, locales.ko, {...}) 로 한국어를 상속합니다.
   그래서 '키가 있는가' 는 늘 참이라 검사가 되지 않습니다. 실제 위험은
   '키는 있는데 한국어 문장이 그대로 나오는' 쪽이라 값을 비교합니다. */
test('Given the login dictionaries, when a language omits a new string, then Korean leaks into that screen', () => {
  const w = runInSandbox(GROUPS[1].files);
  const locales = w.LoginI18nLocales;
  assert.ok(locales && locales.ko, '한국어 사전이 만들어지지 않았습니다');
  const keys = ['nicknameRequired', 'nickNeeded', 'nickChangesLeft', 'nickChangesNone',
    'nickHistory', 'nickHistoryEmpty', 'errNickTaken', 'errNickLimit',
    'adminProfileNote', 'adminOnlySummary'];
  keys.forEach(key => assert.ok(key in locales.ko, 'ko 에 ' + key + ' 가 없습니다'));
  ['en', 'ja', 'zh'].forEach(function (lang) {
    const untranslated = keys.filter(key => locales[lang][key] === locales.ko[key]);
    assert.deepEqual(untranslated, [], lang + ' 에서 번역되지 않은 키: ' + untranslated.join(', '));
  });
  /* {n} 자리를 지우면 '앞으로 번' 처럼 숫자가 빠진 문장이 나갑니다. */
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    assert.match(locales[lang].nickChangesLeft, /\{n\}/, lang + ' 의 nickChangesLeft 에 {n} 이 없습니다');
  });
});

test('Given the admin dictionary, when it loads, then every language carries the same keys', () => {
  const w = runInSandbox(GROUPS[0].files);
  const copy = w.AdminMemberI18n && w.AdminMemberI18n.COPY;
  assert.ok(copy && copy.ko, '관리자 사전이 만들어지지 않았습니다');
  const base = Object.keys(copy.ko);
  ['en', 'ja', 'zh'].forEach(function (lang) {
    const missing = base.filter(key => !(key in copy[lang]));
    assert.deepEqual(missing, [], lang + ' 에 빠진 키: ' + missing.join(', '));
  });
  ['nickSet', 'nickSetHint', 'nickSetFailed', 'nickBlankAuto',
    'nickReset', 'nickResetConfirm'].forEach(function (key) {
    assert.ok(key in copy.ko, 'ko 에 ' + key + ' 가 없습니다');
  });
});
