const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Given closed beta access, when the calculator renders, then login is visible while signup stays disabled', () => {
  const core = read('gecko/gecko-core.js');
  const config = read('assets/studio-config.js');
  const login = read('gecko/login.html');

  assert.match(core, /const SHOW_ACCOUNT_UI\s*=\s*true\s*;/);
  assert.match(config, /var SIGNUPS_ENABLED\s*=\s*false\s*;/);
  assert.match(login, /SIGNUPS_ENABLED\s*\?\s*'<button id="tSignup"/);
  assert.match(login, /if\s*\(!SIGNUPS_ENABLED\)\s*return signupPaused\(\);/);
});

test('Given a closed beta login screen, when it renders in any supported language, then testing guidance is visible', () => {
  const login = read('gecko/login.html');
  assert.match(login, /class="beta-notice"/);
  assert.match(login, /t\('closedBetaTitle'\)/);
  assert.match(login, /t\('closedBetaBody'\)/);

  for (const language of ['ko', 'en', 'zh', 'ja']) {
    const locale = read(`gecko/login-i18n-${language}.js`);
    assert.match(locale, /closedBetaTitle\s*:/, `${language} needs a beta notice title`);
    assert.match(locale, /closedBetaBody\s*:/, `${language} needs beta notice guidance`);
  }
});

test('Given a localized calculator, when login becomes visible, then the account label follows the selected language', () => {
  const app = read('gecko/gecko-app.js');
  assert.match(app, /ko:\{login:'로그인',account:'내 정보'\}/);
  assert.match(app, /en:\{login:'Log in',account:'Account'\}/);
  assert.match(app, /zh:\{login:'登录',account:'账户'\}/);
  assert.match(app, /ja:\{login:'ログイン',account:'アカウント'\}/);
  assert.match(app, /accountLabels\[LANG\]\|\|accountLabels\.ko/);
});

test('Given admin-created test accounts, when Auth inserts a user, then only an unexpired exact permit is consumed', () => {
  for (const file of ['supabase_v51.sql', 'supabase_setup.sql']) {
    const sql = read(file);
    assert.match(sql, /create table if not exists private\.auth_user_creation_permits/i);
    assert.match(sql, /delete from private\.auth_user_creation_permits/i);
    assert.match(sql, /lower\(email\)\s*=\s*lower\(new\.email\)/i);
    assert.match(sql, /expires_at\s*>\s*now\(\)/i);
    assert.match(sql, /returning email into permitted_email/i);
    assert.match(sql, /raise exception 'signups temporarily disabled'/i);
    assert.match(sql, /revoke all on table private\.auth_user_creation_permits from public, anon, authenticated/i);
  }
});
