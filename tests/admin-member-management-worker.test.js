const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const importWorker = () => import(`${pathToFileURL(path.join(root, 'worker/index.mjs')).href}?t=${Date.now()}-${Math.random()}`);

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const jwtFor = subject => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: subject })).toString('base64url')}.signature`;
const ownerToken = jwtFor(actorId);

function request(body, token = ownerToken, language = 'ko') {
  return new Request('https://ryangstudio.com/api/admin/members/action', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': language,
    },
    body: JSON.stringify(body),
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ownerFetch(calls, extra = {}) {
  return async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ pathname, method: init.method || 'GET', body, headers: init.headers });
    if (pathname.endsWith('/rpc/my_admin_role')) return json('owner');
    if (pathname === `/auth/v1/admin/users/${actorId}`) {
      return json({ id: actorId, email: 'owner@example.com', last_sign_in_at: new Date().toISOString() });
    }
    if (pathname.endsWith('/rpc/admin_assert_member_target_service')) {
      return json({ user_id: targetId, email: 'member@example.com' });
    }
    if (extra[pathname]) return extra[pathname](body, init);
    return json({ ok: true });
  };
}

const envFor = (fetcher, secret = 'server-secret') => ({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: secret,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_worker_browser_example',
  ADMIN_FETCH: fetcher,
  ASSETS: { fetch: async () => new Response('asset') },
});

test('Given no bearer token, when an admin mutation is requested, then it is rejected before Supabase is called', async () => {
  const { handleRequest } = await importWorker();
  let calls = 0;
  const response = await handleRequest(request({ action: 'restrict', targetId, reason: 'abuse' }, '', 'en'),
    envFor(async () => { calls += 1; return json({}); }));

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  assert.equal((await response.json()).code, 'ADMIN_AUTH_REQUIRED');
});

test('Given a malformed bearer token, when an admin mutation is requested, then the localized token error is returned before Supabase is called', async () => {
  const { handleRequest } = await importWorker();
  let calls = 0;
  const response = await handleRequest(
    request({ action: 'restrict', targetId, reason: 'abuse' }, 'opaque-token'),
    envFor(async () => { calls += 1; return json({}); }),
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  assert.equal((await response.json()).code, 'ADMIN_SESSION_TOKEN_INVALID');
});

test('Given Supabase rejects a valid-shaped owner token, when the role is verified, then a localized session verification error is returned', async () => {
  const { handleRequest } = await importWorker();
  const response = await handleRequest(
    request({ action: 'restrict', targetId, reason: 'abuse' }),
    envFor(async () => json({ message: 'JWT expired' }, 401)),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'ADMIN_SESSION_VERIFY_FAILED');
});

test('Given the Cloudflare global fetch binding, when an owner action calls Supabase, then fetch keeps the runtime global as its receiver', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const fetcher = ownerFetch(calls);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function (url, init) {
    assert.equal(this, globalThis);
    return fetcher(url, init);
  };
  const env = envFor(fetcher);
  delete env.ADMIN_FETCH;

  try {
    const response = await handleRequest(request({ action: 'restrict', targetId, reason: 'runtime binding' }), env);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Given a non-owner account, when an admin mutation is requested, then it is forbidden', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    calls.push(pathname);
    if (pathname.endsWith('/rpc/my_admin_role')) return json('staff');
    return json({ ok: true });
  };
  const response = await handleRequest(request({ action: 'restrict', targetId, reason: 'policy violation' }), envFor(fetcher));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ADMIN_OWNER_REQUIRED');
  /* 권한 확인에서 막히고, 회원을 건드리는 호출은 하나도 나가지 않아야 합니다.
     보안 기록(record_security_event)은 남습니다 — 부관리자가 최고관리자 동작을
     시도한 것이라 관리자 화면의 보안 탭에 보여야 합니다. */
  assert.deepEqual(calls, ['/rest/v1/rpc/my_admin_role', '/rest/v1/rpc/record_security_event']);
  assert.equal(calls.filter(c => c.startsWith('/auth/v1/admin/users')).length, 0);
});

test('Given an owner, when a member is restricted, then the target is guarded, banned through Auth Admin, and audited', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const response = await handleRequest(request({ action: 'restrict', targetId, reason: 'Repeated image misuse' }),
    envFor(ownerFetch(calls)));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  const meaningful = calls.slice(1).map(call => `${call.method} ${call.pathname}`);
  assert.deepEqual(meaningful, [
    'POST /rest/v1/rpc/admin_assert_member_target_service',
    `PUT /auth/v1/admin/users/${targetId}`,
    'POST /rest/v1/rpc/admin_record_member_action_service',
  ]);
  const banCall = calls.find(call => call.pathname === `/auth/v1/admin/users/${targetId}`);
  const auditCall = calls.find(call => call.pathname.endsWith('/rpc/admin_record_member_action_service'));
  assert.deepEqual(banCall.body, { ban_duration: '876000h' });
  assert.equal(auditCall.body.p_action, 'restrict');
  assert.ok(banCall.headers.Authorization.includes('server-secret'));
});

test('Given a restricted member, when an owner restores access, then the Auth ban is lifted with none', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const response = await handleRequest(request({ action: 'restore', targetId, reason: 'Appeal accepted' }),
    envFor(ownerFetch(calls)));

  assert.equal(response.status, 200);
  assert.deepEqual(calls.find(call => call.pathname.includes('/auth/v1/admin/users/')).body, { ban_duration: 'none' });
});

test('Given an owner, when the tier changes, then only the service-role tier RPC performs the mutation', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const response = await handleRequest(request({
    action: 'set_tier', targetId, tier: 'premium', grantType: 'trial', durationDays: 14,
    reason: 'Manual premium grant',
  }), envFor(ownerFetch(calls)));

  assert.equal(response.status, 200);
  const rpc = calls.find(call => call.pathname.endsWith('/rpc/admin_set_member_tier_service'));
  assert.ok(rpc);
  assert.equal(rpc.body.p_tier, 'premium');
  assert.equal(rpc.body.p_actor, actorId);
  assert.equal(rpc.body.p_grant_type, 'trial');
  assert.equal(rpc.body.p_duration_days, 14);
  assert.ok(rpc.headers.Authorization.includes('server-secret'));
});

test('Given a new Supabase secret key, when the tier service RPC runs, then the secret stays out of the bearer header', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const secret = 'sb_secret_worker_admin_example';
  const response = await handleRequest(request({
    action: 'set_tier', targetId, tier: 'premium', grantType: 'timed', durationDays: 30,
    reason: 'Manual premium grant',
  }), envFor(ownerFetch(calls), secret));

  assert.equal(response.status, 200);
  const ownerLookup = calls.find(call => call.pathname.endsWith('/rpc/my_admin_role'));
  const tierRpc = calls.find(call => call.pathname.endsWith('/rpc/admin_set_member_tier_service'));
  assert.equal(ownerLookup.headers.apikey, 'sb_publishable_worker_browser_example');
  assert.equal(ownerLookup.headers.Authorization, `Bearer ${ownerToken}`);
  assert.equal(tierRpc.headers.apikey, secret);
  assert.equal('Authorization' in tierRpc.headers, false);
});

test('Given a secret copied through a BOM-producing shell, when a service RPC runs, then the key is normalized before headers are built', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const secret = 'sb_secret_worker_admin_example';
  const response = await handleRequest(request({
    action: 'set_tier', targetId, tier: 'premium', grantType: 'trial', durationDays: 7,
    reason: 'Trial access',
  }), envFor(ownerFetch(calls), `\uFEFF${secret}\r\n`));

  assert.equal(response.status, 200);
  const tierRpc = calls.find(call => call.pathname.endsWith('/rpc/admin_set_member_tier_service'));
  assert.equal(tierRpc.headers.apikey, secret);
  assert.equal('Authorization' in tierRpc.headers, false);
});

test('Given a permanent premium grant, when the owner applies it, then no duration is sent to the service RPC', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const response = await handleRequest(request({
    action: 'set_tier', targetId, tier: 'premium', grantType: 'permanent', durationDays: null,
    reason: 'Partner access',
  }), envFor(ownerFetch(calls)));

  assert.equal(response.status, 200);
  const rpc = calls.find(call => call.pathname.endsWith('/rpc/admin_set_member_tier_service'));
  assert.equal(rpc.body.p_grant_type, 'permanent');
  assert.equal(rpc.body.p_duration_days, null);
});

test('Given an invalid premium duration, when the owner submits it, then the request is rejected before Supabase is called', async () => {
  const { handleRequest } = await importWorker();
  let calls = 0;
  const response = await handleRequest(request({
    action: 'set_tier', targetId, tier: 'premium', grantType: 'trial', durationDays: 0,
    reason: 'Invalid trial',
  }), envFor(async () => { calls += 1; return json({}); }));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'ADMIN_INPUT_INVALID');
  assert.equal(calls, 0);
});

test('Given a confirmed deletion, when the owner deletes a member, then ban and cleanup happen before Auth deletion', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const response = await handleRequest(request({
    action: 'delete', targetId, reason: 'Member requested deletion', confirmEmail: 'member@example.com',
  }), envFor(ownerFetch(calls)));

  assert.equal(response.status, 200);
  const meaningful = calls.slice(1).map(call => `${call.method} ${call.pathname}`);
  assert.deepEqual(meaningful, [
    `GET /auth/v1/admin/users/${actorId}`,
    'POST /rest/v1/rpc/admin_assert_member_target_service',
    `PUT /auth/v1/admin/users/${targetId}`,
    'POST /rest/v1/rpc/admin_prepare_member_deletion_service',
    `DELETE /auth/v1/admin/users/${targetId}`,
    'POST /rest/v1/rpc/admin_record_member_action_service',
  ]);
});

test('Given an old owner session, when account deletion is requested, then recent authentication is required before any target call', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    calls.push(pathname);
    if (pathname.endsWith('/rpc/my_admin_role')) return json('owner');
    if (pathname === `/auth/v1/admin/users/${actorId}`) {
      return json({ id: actorId, email: 'owner@example.com', last_sign_in_at: '2020-01-01T00:00:00Z' });
    }
    return json({ ok: true });
  };
  const response = await handleRequest(request({
    action: 'delete', targetId, reason: 'Member requested deletion', confirmEmail: 'member@example.com',
  }), envFor(fetcher));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ADMIN_RECENT_AUTH_REQUIRED');
  assert.deepEqual(calls, ['/rest/v1/rpc/my_admin_role', `/auth/v1/admin/users/${actorId}`]);
});

test('Given the owner targets themself, when a destructive action is requested, then it fails before target mutation', async () => {
  const { handleRequest } = await importWorker();
  const calls = [];
  const response = await handleRequest(request({ action: 'delete', targetId: actorId, reason: 'mistake', confirmEmail: 'owner@example.com' }),
    envFor(ownerFetch(calls)));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'ADMIN_SELF_ACTION_FORBIDDEN');
  assert.equal(calls.some(call => call.pathname.includes('/admin/users/')), false);
});

test('Given invalid input, when the endpoint validates it, then a localized safe error is returned', async () => {
  const { handleRequest } = await importWorker();
  const response = await handleRequest(request({ action: 'set_tier', targetId, tier: 'vip', reason: '' }, 'owner-token', 'ko'),
    envFor(async () => json({})));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, 'ADMIN_INPUT_INVALID');
  assert.match(body.message, /입력/);
});
