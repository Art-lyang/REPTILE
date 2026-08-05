const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadLoginI18n(search = '') {
  const document = {
    title: '',
    documentElement: { lang: 'ko' },
    querySelectorAll: () => [],
  };
  const location = {
    origin: 'https://ryangstudio.com',
    pathname: '/gecko/login.html',
    search,
    hash: '',
    href: `https://ryangstudio.com/gecko/login.html${search}`,
  };
  const context = {
    window: { document, location },
    document,
    location,
    URL,
    URLSearchParams,
    Intl,
    Date,
  };
  vm.createContext(context);
  for (const file of [
    'gecko/login-i18n-ko.js',
    'gecko/login-i18n-en.js',
    'gecko/login-i18n-zh.js',
    'gecko/login-i18n-ja.js',
    'gecko/login-i18n.js',
  ]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return {
    i18n: context.window.LoginI18n,
    locales: context.window.LoginI18nLocales,
    document,
  };
}

test('Given four account locales, when their contracts load, then every language has the same translated keys', () => {
  const { locales } = loadLoginI18n();
  const expected = Object.keys(locales.ko).sort();

  for (const language of ['en', 'zh', 'ja']) {
    assert.deepEqual(Object.keys(locales[language]).sort(), expected);
    const leaked = Object.entries(locales[language])
      .filter(([, value]) => /[가-힣]/.test(Array.isArray(value) ? value.join('') : String(value)))
      .map(([key]) => key);
    assert.deepEqual(leaked, [], `${language} contains Korean fallback keys: ${leaked.join(', ')}`);
  }
});

test('Given a selected account language, when the page initializes, then title and document language follow it', () => {
  const { i18n, document } = loadLoginI18n('?lang=zh');

  i18n.initialize();

  assert.equal(document.documentElement.lang, 'zh-Hans');
  assert.equal(document.title, '账户 · Ryang Studio');
  assert.equal(i18n.t('login'), '登录');
});

test('Given a return target, when it is parsed, then only a same-origin absolute path is accepted', () => {
  const valid = loadLoginI18n('?lang=en&next=%2Fcare%2F%3Flang%3Den%23plans').i18n;
  assert.equal(valid.safeNextPath(), '/care/?lang=en#plans');

  for (const unsafe of [
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    'javascript:alert(1)',
    '/gecko/login.html?lang=en',
  ]) {
    const query = `?lang=en&next=${encodeURIComponent(unsafe)}`;
    assert.equal(loadLoginI18n(query).i18n.safeNextPath(), null, unsafe);
  }
});

test('Given account navigation, when localized links are made, then language and safe return target are preserved', () => {
  const { i18n } = loadLoginI18n('?lang=ja');

  assert.equal(i18n.url('/care/'), '/care/?lang=ja');
  assert.equal(i18n.calculatorUrl(), '/ja/gecko/');
  assert.equal(
    i18n.loginUrl('/care/animal.html?id=animal-1#weight'),
    '/gecko/login.html?lang=ja&next=%2Fcare%2Fanimal.html%3Fid%3Danimal-1%23weight',
  );
  assert.equal(i18n.localizedPath('/care/?lang=en#plans', 'ja'), '/care/?lang=ja#plans');
  assert.equal(i18n.localizedPath('/care/?lang=en#plans', 'ko'), '/care/#plans');
});

test('Given the account entry page, when it boots, then locale modules initialize before UI and expose a language selector', () => {
  const html = read('gecko/login.html');

  for (const language of ['ko', 'en', 'zh', 'ja']) {
    assert.match(html, new RegExp(`login-i18n-${language}\\.js\\?v=`));
  }
  assert.match(html, /login-i18n\.js\?v=/);
  assert.match(html, /LoginI18n\.initialize\(\)/);
  assert.match(html, /data-login-language/);
  assert.ok(html.indexOf('LoginI18n.initialize') < html.indexOf('const SB'));
});

test('Given care or breeding requires authentication, when login is opened, then the current localized screen is a return target', () => {
  for (const file of ['care/care-ui.js', 'care/animal-ui.js', 'care/breeding-ui.js']) {
    const source = read(file);
    assert.match(source, /(?:next\s*:|set\('next')/, `${file} must pass a return target`);
    assert.match(source, /location\.pathname/, `${file} must preserve the current screen`);
    assert.match(source, /logVisit\([^)]*language\(\)\)/, `${file} must record the active language`);
  }
});

test('Given account messages contain user or server values, when HTML is rendered, then those values are escaped', () => {
  const { i18n } = loadLoginI18n('?lang=en');
  const hostile = '<img src=x onerror=alert(1)>';

  assert.equal(
    i18n.html('resetAccepted', { email: hostile }).includes('<img'),
    false,
  );
  assert.equal(
    i18n.html('deleteFailed', { error: hostile }).includes('<img'),
    false,
  );

  const login = read('gecko/login.html');
  assert.match(login, /function err\(e\)\{ return esc\(LoginLocale\.friendly\(e\)\); \}/);
  assert.match(login, /LoginLocale\.html\('consentGateBody',\{email:u\.email\|\|''\}\)/);
});

test('Given an unexpected account backend error, when it is shown, then raw server English is replaced by the selected language', () => {
  const korean = loadLoginI18n().i18n;
  const english = loadLoginI18n('?lang=en').i18n;
  const raw = 'Database internal error: relation secret_table failed';

  assert.equal(korean.friendly(new Error(raw)), '처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.');
  assert.equal(english.friendly(new Error(raw)), 'Something went wrong. Please try again shortly.');
  assert.notEqual(korean.friendly(new Error(raw)), raw);
});

test('Given signups and recovery requests are paused, when account I18n is added, then both server-facing guards remain intact', () => {
  const config = read('assets/studio-config.js');
  const login = read('gecko/login.html');

  assert.match(config, /var SIGNUPS_ENABLED\s*=\s*false\s*;/);
  assert.match(config, /var PASSWORD_RESET_REQUESTS_ENABLED\s*=\s*false\s*;/);
  assert.match(login, /if\s*\(!SIGNUPS_ENABLED\)\s*return signupPaused\(\);/);
  assert.match(login, /if\s*\(!PASSWORD_RESET_REQUESTS_ENABLED\)\s*return renderResetPaused\(\);/);
});
