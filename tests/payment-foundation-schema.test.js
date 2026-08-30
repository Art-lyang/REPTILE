const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function assertPaymentFoundation(sql, label) {
  for (const table of [
    'billing_products',
    'billing_prices',
    'billing_orders',
    'billing_payments',
    'billing_refunds',
    'billing_subscriptions',
    'user_entitlements',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'), `${label} creates ${table}`);
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${label} enables RLS on ${table}`);
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'), `${label} closes direct ${table} access first`);
  }

  assert.match(sql, /name_i18n\s+jsonb/i, `${label} keeps product copy translatable`);
  assert.match(sql, /description_i18n\s+jsonb/i, `${label} keeps product descriptions translatable`);
  assert.match(sql, /amount_minor\s+bigint[\s\S]*check\s*\(amount_minor\s*>=\s*0\)/i, `${label} stores money as bounded minor units`);
  assert.match(sql, /billing_orders_user_id_idempotency_key_key/i, `${label} deduplicates order creation`);
  assert.match(sql, /billing_payments_provider_transaction_key/i, `${label} deduplicates provider captures`);
  assert.match(sql, /billing_payments_webhook_event_key/i, `${label} binds one capture to one verified webhook`);
  assert.match(sql, /billing_refunds_provider_refund_key/i, `${label} deduplicates provider refunds`);
  assert.match(sql, /billing_webhook_events_provider_event_key/i, `${label} deduplicates provider webhooks`);
  assert.match(sql, /billing_orders[\s\S]*entitlement_key[\s\S]*product_code[\s\S]*access_days/i,
    `${label} snapshots the purchased entitlement on the order`);

  assert.match(sql, /create schema if not exists private/i, `${label} has a non-exposed schema`);
  assert.match(sql, /grant usage on schema private to anon, authenticated, service_role/i,
    `${label} preserves the existing anonymous public-photo helper`);
  assert.doesNotMatch(sql, /revoke all on schema private from public, anon/i,
    `${label} does not break anonymous QR photo access`);
  assert.match(sql, /create table if not exists private\.billing_webhook_events/i, `${label} keeps webhook state private`);
  assert.doesNotMatch(sql, /private\.billing_webhook_events[\s\S]{0,1000}\bpayload\s+jsonb/i, `${label} does not persist raw payment payloads`);
  assert.match(sql, /signature_verified\s+boolean\s+not null/i, `${label} records server-side signature verification`);
  assert.match(sql, /processing_started_at[\s\S]*interval '5 minutes'/i, `${label} allows safe retry after an abandoned processing lease`);
  assert.match(sql, /BILLING_WEBHOOK_REPLAY_MISMATCH/i, `${label} rejects a changed payload for the same event id`);
  assert.match(sql, /insert into private\.billing_webhook_events[\s\S]*on conflict[\s\S]*do nothing[\s\S]*returning \*/i,
    `${label} claims a first webhook without a select-then-insert race`);

  assert.match(sql, /create or replace function private\.create_billing_order/i, `${label} creates orders through a private server boundary`);
  assert.match(sql, /from public\.billing_prices[\s\S]*join public\.billing_products/i, `${label} derives prices from server data`);
  assert.match(sql, /price_row\.entitlement_key[\s\S]*price_row\.product_code[\s\S]*price_row\.access_days/i,
    `${label} copies entitlement terms into the order snapshot`);
  assert.doesNotMatch(sql, /create_billing_order\([^)]*amount/i, `${label} never accepts a browser-supplied amount`);
  assert.match(sql, /count\(\*\)[\s\S]*interval '1 hour'[\s\S]*BILLING_ORDER_RATE_LIMIT/i, `${label} limits order spam`);
  assert.match(sql, /pg_advisory_xact_lock/i, `${label} serializes each user's order-rate check`);
  assert.match(sql, /BILLING_IDEMPOTENCY_CONFLICT/i, `${label} rejects reuse of one idempotency key for another price`);

  assert.match(sql, /create or replace function private\.capture_billing_order/i, `${label} captures a verified order atomically`);
  assert.match(sql, /for update/i, `${label} locks mutable billing rows`);
  assert.match(sql, /signature_verified\s*=\s*true/i, `${label} requires a verified webhook`);
  assert.match(sql, /event_row\.status\s*<>\s*'processing'/i, `${label} captures only a claimed webhook`);
  assert.match(sql, /BILLING_CAPTURE_INPUT_INVALID/i, `${label} validates server adapter capture inputs`);
  assert.match(sql, /BILLING_AMOUNT_MISMATCH/i, `${label} rejects amount mismatches`);
  assert.match(sql, /BILLING_CURRENCY_MISMATCH/i, `${label} rejects currency mismatches`);
  assert.match(sql, /insert into public\.user_entitlements[\s\S]*on conflict/i, `${label} grants each entitlement idempotently`);

  assert.match(sql, /create or replace function private\.redeem_code_for_user/i, `${label} routes premium codes into entitlements`);
  const redeemBody = sql.match(/create or replace function private\.redeem_code_for_user[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] || '';
  assert.match(redeemBody, /update public\.access_codes/i,
    `${label} lets the access-code trigger own entitlement synchronization`);
  assert.doesNotMatch(redeemBody, /insert into public\.user_entitlements/i,
    `${label} does not duplicate entitlement writes after the access-code trigger`);
  assert.match(sql, /create or replace function private\.sync_access_code_entitlement/i,
    `${label} keeps revocation and expiry changes synchronized`);
  assert.match(sql, /if tg_op = 'DELETE'[\s\S]*status = 'revoked'/i,
    `${label} revokes an entitlement when an access code is deleted`);
  assert.match(sql, /p_user_id\s+is distinct from\s+\(select auth\.uid\(\)\)/i, `${label} binds code redemption to the caller`);
  assert.match(sql, /create or replace function public\.premium_status/i, `${label} keeps the existing premium API`);
  assert.match(sql, /from public\.user_entitlements/i, `${label} reads premium state from unified entitlements`);

  assert.match(sql, /on delete set null/i, `${label} keeps payment records compatible with account deletion`);
  assert.match(sql, /on delete cascade/i, `${label} removes active entitlements with the account`);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)[^;]*billing_(orders|payments|refunds|subscriptions)[^;]*authenticated/i,
    `${label} never lets the browser mutate billing state directly`);
  assert.match(sql, /grant execute on function public\.create_billing_order\(text,text\) to authenticated/i,
    `${label} exposes only trusted order creation to signed-in users`);
  assert.match(sql, /grant execute on function public\.billing_claim_webhook[\s\S]*to service_role/i,
    `${label} keeps webhook processing server-only`);
  assert.match(sql, /order by[\s\S]*=\s*'sub'\s*\) desc[\s\S]*ends_at desc nulls first/i,
    `${label} keeps subscription priority compatible with the legacy premium API`);
  assert.match(sql, /status = 'expired'[\s\S]*BILLING_ORDER_EXPIRED[\s\S]*return jsonb_build_object\(\s*'status', 'expired'/i,
    `${label} persists expiry without rolling the update back through an exception`);
}

test('Given the next production upgrade, when v49 is applied, then billing remains provider-independent and server-authoritative', () => {
  assertPaymentFoundation(read('supabase_v49.sql'), 'v49');
});

test('Given a fresh database, when setup runs, then it includes the same payment foundation', () => {
  assertPaymentFoundation(read('supabase_setup.sql'), 'setup');
});

test('Given payments are not connected yet, when project status is read, then it distinguishes schema readiness from live sales', () => {
  const status = read('docs/PROJECT_STATUS.md');
  assert.match(status, /v49/i);
  assert.match(status, /결제 기반/i);
  assert.match(status, /실결제[^\n]*(미연결|연결 전|아직)/i);
});
