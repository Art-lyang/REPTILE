const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

/* 2026-08-09 가입을 열었습니다. 이 파일은 이제 '잠겨 있는가' 가 아니라
   '열린 채로 있는가' 를 지킵니다. 숨김은 hidden 한 글자로 되돌아가고,
   그렇게 되돌아간 것을 알아차릴 방법이 이것 말고는 없습니다. */

test('Given signups are open, when public pages render, then the way in is visible', () => {
  const galleryPages = [
    'gecko/index.html',
    'crested/index.html',
    'fattail/index.html',
    'ballpython/index.html',
  ];

  for (const page of galleryPages) {
    assert.doesNotMatch(
      read(page),
      /<a[^>]+href="\/care\/gallery\.html"[^>]+hidden/,
      `${page} must show the public gallery link`,
    );
  }

  assert.doesNotMatch(
    read('index.html'),
    /<a[^>]+href="\.\/care\/"[^>]+hidden/,
    'studio home must show the care log card',
  );
  assert.doesNotMatch(
    read('care/gallery.html'),
    /<a[^>]+href="\/care\/"[^>]+hidden/,
    'gallery must lead back into the care log',
  );
});

test('Given the public gallery is empty, when its empty state renders, then it does not recreate a care log entry point', () => {
  assert.doesNotMatch(
    read('care/gallery-ui.js'),
    /<a[^>]+href=["']\/care\/["']/,
    'the empty gallery state must not inject a care log link',
  );
  assert.match(
    read('care/gallery.html'),
    /gallery-ui\.js\?v=20260802d/,
    'the gallery must request the fixed script with a new cache key',
  );
});

test('Given members can sign up, when public pages render, then the terms are reachable', () => {
  const pages = [
    'gecko/index.html',
    'crested/index.html',
    'fattail/index.html',
    'ballpython/index.html',
    'care/index.html',
    'care/animal.html',
    'care/breeding.html',
    'care/gallery.html',
    'care/p.html',
  ];

  /* 가입을 받으면서 약관 링크를 숨겨 두면, 동의 화면에서 한 번 본 뒤로는
     찾을 길이 없다는 뜻이 됩니다. */
  for (const page of pages) {
    assert.doesNotMatch(
      read(page),
      /<div class="legal"[^>]*hidden/,
      `${page} must show its legal links`,
    );
  }

  assert.doesNotMatch(
    read('gecko/index.html'),
    /<div class="cookiebar"[^>]*hidden/,
    'the privacy notice bar must be reachable',
  );
});

test('Given component styles set display, when an element is hidden, then hidden still wins', () => {
  for (const stylesheet of ['assets/base.css', 'care/care.css']) {
    assert.match(
      read(stylesheet),
      /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/,
      `${stylesheet} must preserve the native hidden contract`,
    );
  }
});

test('Given signups are open, when the login page renders, then the switch and its guard both stay', () => {
  const config = read('assets/studio-config.js');
  const login = read('gecko/login.html');

  assert.match(config, /var SIGNUPS_ENABLED\s*=\s*true\s*;/);
  /* 스위치를 켰다고 해서 다시 잠글 길을 지우면 안 됩니다 — 사고가 나면
     한 글자로 닫을 수 있어야 합니다. */
  assert.match(login, /SIGNUPS_ENABLED\s*\?\s*'<button id="tSignup"/);
  assert.match(login, /if\s*\(!SIGNUPS_ENABLED\)\s*return signupPaused\(\);/);
});

test('Given ads are paused, when the leopard calculator renders, then the ad slot stays hidden', () => {
  assert.match(
    read('gecko/gecko-core.js'),
    /const AD_ENABLED\s*=\s*false\s*;/,
  );
  assert.match(
    read('gecko/index.html'),
    /<div class="adslot"[^>]*hidden/,
  );
});

test('Given the screen switch is on, when a new member signs up, then the DB lock is gone too', () => {
  /* 자물쇠가 셋입니다 — 화면 스위치, 이 트리거, 그리고 Supabase 대시보드.
     화면만 켜면 가입 버튼은 보이는데 누르는 순간 떨어집니다. 대시보드는
     여기서 확인할 수 없어 v75 의 주석이 그 사실을 적어 둡니다. */
  const open = read('supabase_v75.sql');

  assert.match(open, /drop trigger if exists block_new_auth_users on auth\.users/i);
  assert.match(open, /Allow new users to sign up/i);
  /* 되돌릴 함수는 남겨 둡니다. 지우면 v26 을 통째로 다시 읽어야 합니다. */
  assert.doesNotMatch(open, /drop function[^;]*block_new_auth_users/i);
  assert.match(read('supabase_v26.sql'), /raise exception 'signups temporarily disabled'/i);
});

test('Given the public morph bucket, when storage hardening is applied, then anonymous uploads and listing stay blocked', () => {
  const migration = read('supabase_v27.sql');

  assert.match(migration, /file_size_limit\s*=\s*5242880/i);
  assert.match(
    migration,
    /allowed_mime_types\s*=\s*array\['image\/jpeg','image\/png','image\/webp'\]/i,
  );
  assert.match(
    migration,
    /create policy mi_insert[\s\S]*?for insert to authenticated[\s\S]*?public\.is_admin\(\)[\s\S]*?storage\.foldername\(name\)\)\[1\]\s*=\s*'m'/i,
  );
  assert.match(
    migration,
    /create policy mi_read[\s\S]*?for select to authenticated[\s\S]*?public\.is_admin\(\)/i,
  );
  assert.doesNotMatch(migration, /for insert to anon/i);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
});

test('Given a fresh Supabase setup, when storage policies are created, then the unsafe legacy upload rule is not restored', () => {
  for (const sqlFile of ['supabase_setup.sql', 'supabase_v2.sql']) {
    const sql = read(sqlFile);
    const policyStart = sql.indexOf('create policy mi_insert');
    const policyEnd = sql.indexOf(';', policyStart);
    const insertPolicy = sql.slice(policyStart, policyEnd + 1);

    assert.notEqual(policyStart, -1, `${sqlFile} must define mi_insert`);
    assert.match(insertPolicy, /for insert to authenticated/i);
    assert.match(insertPolicy, /public\.is_admin\(\)/i);
    assert.match(insertPolicy, /storage\.foldername\(name\)\)\[1\]\s*=\s*'m'/i);
    assert.doesNotMatch(insertPolicy, /\banon\b/i);
    assert.doesNotMatch(insertPolicy, /a\/%/i);
    assert.match(sql, /file_size_limit[\s\S]*allowed_mime_types/i);
  }
});

test('Given signups are open, when crawlers read the terms page, then it can be found', () => {
  /* 가입 전에 약관을 읽어 보려는 사람이 검색으로 닿을 수 있어야 합니다. */
  assert.doesNotMatch(read('terms.html'), /content="noindex/);
});

test('Given the terms are public, when the sitemap is built, then it lists them', () => {
  const generator = read('tools/build_langs.py');
  const writerStart = generator.indexOf('def write_sitemap');
  const writerEnd = generator.indexOf("if __name__ == '__main__'");
  const sitemapWriter = generator.slice(writerStart, writerEnd);

  assert.match(sitemapWriter, /terms\.html/);
});

test('Given account features are private, when API grants are applied, then anonymous callers only keep public gallery access', () => {
  const migration = read('supabase_v28.sql');
  const privateFunctions = [
    'my_rows\\(text,text\\)',
    'save_row\\(text,text,jsonb\\)',
    'delete_row\\(text,text,uuid\\)',
    'claim_device\\(text,text\\)',
    'redeem_code\\(text,text\\)',
    'is_premium\\(text\\)',
    'premium_status\\(text\\)',
    'request_password_reset\\(text,text\\)',
  ];

  for (const signature of privateFunctions) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature} from public`, 'i'),
      `${signature} must lose the implicit PUBLIC grant`,
    );
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${signature} from anon`, 'i'),
      `${signature} must reject anonymous calls`,
    );
  }

  for (const signature of [
    'public_animal\\(text\\)',
    'public_animals\\(text,integer,integer\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature} to anon, authenticated`, 'i'),
      `${signature} must remain available to the public gallery`,
    );
  }
});

test('Given signups are open, when a member forgets their password, then they have a way back', () => {
  /* 새로 들어온 회원이 비밀번호를 잊었을 때 돌아올 길이 없으면, 계정을
     하나 더 만들거나 그냥 떠납니다. */
  const config = read('assets/studio-config.js');
  const login = read('gecko/login.html');

  assert.match(config, /var PASSWORD_RESET_REQUESTS_ENABLED\s*=\s*true\s*;/);
  assert.match(login, /PASSWORD_RESET_REQUESTS_ENABLED\s*\?\s*'<div class="sub">/);
  assert.match(login, /if\s*\(!PASSWORD_RESET_REQUESTS_ENABLED\)\s*return renderResetPaused\(\);/);
});

test('Given a visitor is signed out, when the leopard calculator boots, then it does not query private premium APIs', () => {
  const app = read('gecko/gecko-app.js');
  const start = app.indexOf('async function refreshPrem()');
  const end = app.indexOf('window.openPrem', start);
  const refreshPremium = app.slice(start, end);

  assert.notEqual(start, -1);
  assert.match(refreshPremium, /if\s*\(!USER\)[\s\S]*?return\s*;/);
  assert.ok(
    refreshPremium.indexOf('if(!USER)') < refreshPremium.indexOf("SB.rpc('premium_status'"),
    'the signed-out guard must run before premium_status',
  );
});

test('Given public analytics remain enabled, when events are recorded, then writes go through validated RPCs only', () => {
  const analytics = read('assets/analytics.js');
  const migration = read('supabase_v28.sql');

  assert.match(analytics, /sb\.rpc\('log_visit'/);
  assert.match(analytics, /sb\.rpc\('log_combo_query'/);
  assert.doesNotMatch(analytics, /sb\.from\(['"]visits['"]\)\.insert/);
  assert.doesNotMatch(analytics, /sb\.from\(['"]combo_queries['"]\)\.insert/);

  assert.match(migration, /drop policy if exists visits_insert_anyone on public\.visits/i);
  assert.match(migration, /drop policy if exists combo_insert_anyone on public\.combo_queries/i);
  assert.match(migration, /create or replace function public\.log_visit/i);
  assert.match(migration, /create or replace function public\.log_combo_query/i);
  assert.match(migration, /char_length\(p_device\)\s*>\s*96/i);
  assert.match(migration, /p_service not in \('gecko','crested','fattail','ballpython','care'\)/i);
  assert.match(migration, /count\(\*\)[\s\S]*?interval '1 day'/i);
});

test('Given browser dependencies are loaded from a CDN, when pages are built, then Supabase JS uses one reviewed version', () => {
  const pages = [
    'admin/index.html',
    'ballpython/index.html',
    'crested/index.html',
    'fattail/index.html',
    'gecko/index.html',
    'gecko/login.html',
    'care/index.html',
    'care/animal.html',
    'care/breeding.html',
    'care/gallery.html',
    'care/p.html',
  ];

  for (const page of pages) {
    assert.match(
      read(page),
      /@supabase\/supabase-js@2\.110\.8\/dist\/umd\/supabase\.js/,
      `${page} must pin the reviewed Supabase JS build`,
    );
  }
});

test('Given security-sensitive browser code changes, when pages load, then they request the reviewed cache versions', () => {
  const configuredPages = [
    'admin/index.html',
    'ballpython/index.html',
    'crested/index.html',
    'fattail/index.html',
    'gecko/index.html',
    'gecko/login.html',
    'care/index.html',
    'care/animal.html',
    'care/breeding.html',
    'care/gallery.html',
    'care/p.html',
  ];
  const analyticsPages = [
    'ballpython/index.html',
    'crested/index.html',
    'fattail/index.html',
    'gecko/index.html',
    'care/index.html',
    'care/animal.html',
    'care/breeding.html',
  ];

  for (const page of configuredPages) {
    assert.match(
      read(page),
      /assets\/studio-config\.js\?v=[0-9a-z]+/,
      `${page} must request the paused-account configuration with a new cache key`,
    );
  }
  for (const page of analyticsPages) {
    assert.match(
      read(page),
      /assets\/analytics\.js\?v=20260731b/,
      `${page} must request RPC-based analytics with a new cache key`,
    );
  }
  assert.match(read('gecko/index.html'), /gecko-app\.js\?v=20260809a/);
});

test('Given the crested calculator needs analytics and live morph data, when it boots, then both features share one Supabase client', () => {
  const app = read('crested/crested-app.js');
  const clientCreations = app.match(/createClient\(/g) || [];

  assert.equal(clientCreations.length, 1);
  assert.match(read('crested/index.html'), /crested-app\.js\?v=20260806c/);
});
