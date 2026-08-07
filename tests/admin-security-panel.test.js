const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

function loadPanel() {
  const context = { window: {}, Date, Math, Number, String, Object, Array, JSON, Promise };
  vm.createContext(context);
  vm.runInContext(read('admin/admin-security.js'), context);
  return context.window.AdminSecurity;
}

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fakeBody() {
  return { innerHTML: '' };
}

function client(map) {
  return { rpc: async name => map[name] };
}

const NOW = Date.parse('2026-08-07T12:00:00+09:00');

test('Given recorded attempts, when the security panel renders, then each kind is counted separately', async () => {
  const panel = loadPanel();
  const body = fakeBody();
  await panel.render({
    esc, body, now: NOW,
    SB: client({
      admin_security_summary: { data: [{ day: '2026-08-07', kind: 'admin_probe', n: 2 }] },
      admin_security_events: {
        data: [
          { ts: NOW, kind: 'admin_probe', path: '/api/admin/users', ip: '1.1.1.1', country: 'RU', ua: 'curl' },
          { ts: NOW, kind: 'admin_probe', path: '/api/admin/.env', ip: '1.1.1.1', country: 'RU', ua: 'curl' },
          { ts: NOW, kind: 'billing_probe', path: '/api/billing/checkout', ip: '2.2.2.2', country: 'CN', ua: 'bot' },
        ],
      },
      admin_audit_log: { data: [] },
    }),
  });

  assert.match(body.innerHTML, /<div class="statn">3<\/div><div class="statl">전체 시도/);
  assert.match(body.innerHTML, /<div class="statn">2<\/div><div class="statl">관리자 경로 탐색/);
  assert.match(body.innerHTML, /<div class="statn">1<\/div><div class="statl">결제 경로 접근/);
});

test('Given a hostile user agent, when it is shown in the table, then the markup is escaped', async () => {
  const panel = loadPanel();
  const body = fakeBody();
  await panel.render({
    esc, body, now: NOW,
    SB: client({
      admin_security_summary: { data: [] },
      admin_security_events: {
        data: [{ ts: NOW, kind: 'admin_probe', path: '/x', ip: '1.1.1.1', country: 'US',
          ua: '<img src=x onerror=alert(1)>' }],
      },
      admin_audit_log: { data: [] },
    }),
  });

  /* 공격자가 보내는 값을 그대로 화면에 넣습니다. 여기서 새면 관리자 화면이
     공격자의 코드를 실행하게 됩니다. */
  assert.doesNotMatch(body.innerHTML, /<img src=x/);
  assert.match(body.innerHTML, /&lt;img src=x/);
});

test('Given the migration has not been applied, when the panel loads, then it says what to run', async () => {
  const panel = loadPanel();
  const body = fakeBody();
  const notFound = { error: { message: 'Could not find the function in the schema cache' } };
  await panel.render({
    esc, body, now: NOW,
    SB: client({ admin_security_summary: notFound, admin_security_events: notFound, admin_audit_log: notFound }),
  });

  assert.match(body.innerHTML, /supabase_v53\.sql/);
});

test('Given a non-admin caller, when the functions return null, then nothing is rendered but a refusal', async () => {
  const panel = loadPanel();
  const body = fakeBody();
  await panel.render({
    esc, body, now: NOW,
    SB: client({
      admin_security_summary: { data: null },
      admin_security_events: { data: null },
      admin_audit_log: { data: null },
    }),
  });

  assert.match(body.innerHTML, /볼 권한이 없습니다/);
  assert.doesNotMatch(body.innerHTML, /secbar/);
});

test('Given fourteen days of history, when the trend is drawn, then quiet days still take a slot', () => {
  const panel = loadPanel();
  const days = panel.lastDays(14, { '2026-08-07': 3 }, NOW);

  assert.equal(days.length, 14, '조용한 날이 빠지면 그래프가 날짜를 건너뜁니다');
  assert.equal(days[days.length - 1][0], '2026-08-07');
  assert.equal(days[days.length - 1][1], 3);
  assert.equal(days[0][1], 0);
});

test('Given the worker sees a probe, when it responds, then recording never blocks the response', () => {
  const worker = read('worker/index.mjs');
  const logger = read('worker/security-log.mjs');

  /* 기록을 await 하면 Supabase 가 느릴 때 방문자 응답까지 같이 느려집니다. */
  assert.doesNotMatch(worker, /await recordSecurityEvent/);
  assert.match(logger, /ctx\.waitUntil/);
  /* 서비스 키는 Worker 안에서만 씁니다. */
  assert.match(logger, /SUPABASE_SECRET_KEY/);
});
