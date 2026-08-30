const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const importModule = file => import(pathToFileURL(path.join(root, file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('Given an Inicis test order, when checkout fields are built, then hashes use the server order amount', async () => {
  const { buildInicisCheckoutFields, INICIS_TEST } = await importModule('worker/billing/inicis.mjs');
  const order = {
    id: '11111111-2222-4333-8444-555555555555',
    amount_minor: 1004,
    currency: 'KRW',
    status: 'pending',
  };

  const fields = await buildInicisCheckoutFields({
    order,
    timestamp: '1361252896871',
    buyer: { name: '테스트', email: 'buyer@example.com', tel: '010-1234-5678' },
    goodName: '케어로그 프리미엄 테스트',
    returnUrl: 'https://ryangstudio.com/api/billing/inicis/auth-result',
    closeUrl: 'https://ryangstudio.com/api/billing/inicis/close',
    config: INICIS_TEST,
  });

  assert.equal(fields.mid, 'INIpayTest');
  assert.equal(fields.oid, order.id);
  assert.equal(fields.price, '1004');
  assert.equal(fields.currency, 'WON');
  assert.equal(fields.signature, sha256(`oid=${order.id}&price=1004&timestamp=1361252896871`));
  assert.equal(fields.verification,
    sha256(`oid=${order.id}&price=1004&signKey=${INICIS_TEST.signKey}&timestamp=1361252896871`));
  assert.equal(fields.mKey, sha256(INICIS_TEST.signKey));
  assert.equal(Object.hasOwn(fields, 'signKey'), false);
});

test('Given a non-KRW or non-pending order, when checkout fields are built, then it fails closed', async () => {
  const { buildInicisCheckoutFields } = await importModule('worker/billing/inicis.mjs');
  const base = {
    id: '11111111-2222-4333-8444-555555555555',
    amount_minor: 1004,
    currency: 'KRW',
    status: 'pending',
  };
  const request = {
    timestamp: '1361252896871',
    buyer: { name: '테스트', email: 'buyer@example.com', tel: '010-1234-5678' },
    goodName: '테스트 상품',
    returnUrl: 'https://ryangstudio.com/api/billing/inicis/auth-result',
    closeUrl: 'https://ryangstudio.com/api/billing/inicis/close',
  };

  await assert.rejects(() => buildInicisCheckoutFields({ ...request, order: { ...base, currency: 'USD' } }),
    /BILLING_CURRENCY_UNSUPPORTED/);
  await assert.rejects(() => buildInicisCheckoutFields({ ...request, order: { ...base, status: 'paid' } }),
    /BILLING_ORDER_STATE_INVALID/);
});

test('Given payments are not approved, when the billing API is queried, then sales remain disabled in every locale', async () => {
  const { handleRequest } = await importModule('worker/index.mjs');
  const assets = { fetch: async () => new Response('asset', { status: 200 }) };

  for (const [language, phrase] of [
    ['ko', '아직 결제를 시작할 수 없습니다'],
    ['en', 'Payments are not available yet'],
    ['zh', '暂未开放支付'],
    ['ja', 'お支払いはまだご利用いただけません'],
  ]) {
    const response = await handleRequest(new Request('https://ryangstudio.com/api/billing/status', {
      headers: { 'Accept-Language': language },
    }), { ASSETS: assets });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.sales_enabled, false);
    assert.equal(body.mode, 'disabled');
    assert.equal(body.merchant_contract_required, true);
    assert.match(body.message, new RegExp(phrase));
  }
});

test('Given an unapproved checkout request, when it reaches the Worker, then it cannot fall through to assets', async () => {
  const { handleRequest } = await importModule('worker/index.mjs');
  let assetCalls = 0;
  const response = await handleRequest(new Request('https://ryangstudio.com/api/billing/checkout', {
    method: 'POST',
    headers: { 'Accept-Language': 'ko', 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceCode: 'premium_month', amountMinor: 1 }),
  }), {
    ASSETS: { fetch: async () => { assetCalls += 1; return new Response('asset'); } },
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.code, 'BILLING_NOT_AVAILABLE');
  assert.equal(assetCalls, 0);
});

test('Given a normal static route, when the Worker receives it, then assets remain unchanged', async () => {
  const { handleRequest } = await importModule('worker/index.mjs');
  let forwardedUrl = '';
  const response = await handleRequest(new Request('https://ryangstudio.com/care/'), {
    ASSETS: { fetch: async request => { forwardedUrl = request.url; return new Response('care asset'); } },
  });

  assert.equal(await response.text(), 'care asset');
  assert.equal(forwardedUrl, 'https://ryangstudio.com/care/');
});

test('Given server-only billing code, when deployment is configured, then it runs as Worker code and never becomes a public asset', () => {
  const wrangler = read('wrangler.jsonc');
  const build = read('build.sh');

  assert.match(wrangler, /"main"\s*:\s*"\.\/worker\/index\.mjs"/);
  assert.match(wrangler, /"binding"\s*:\s*"ASSETS"/);
  assert.match(wrangler, /"run_worker_first"\s*:\s*\[[^\]]*"\/api\/billing\/\*"/);
  assert.match(wrangler, /"run_worker_first"\s*:\s*\[[^\]]*"\/api\/admin\/\*"/);
  assert.match(build, /worker\/\*/,
    'server modules must be excluded from the static dist directory');
});
