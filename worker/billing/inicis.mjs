export const INICIS_TEST = Object.freeze({
  mid: 'INIpayTest',
  signKey: 'SU5JTElURV9UUklQTEVERVNfS0VZU1RS',
});

export class BillingAdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BillingAdapterError';
    this.code = code;
  }
}

function fail(code) {
  throw new BillingAdapterError(code);
}

function utf8Slice(value, maxBytes) {
  let result = '';
  let bytes = 0;
  for (const character of String(value || '').trim()) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseOrder(order) {
  if (!order || typeof order !== 'object') fail('BILLING_ORDER_INVALID');
  const id = String(order.id || '');
  if (!/^[A-Za-z0-9._:-]{1,40}$/.test(id)) fail('BILLING_ORDER_ID_INVALID');
  if (order.status !== 'pending') fail('BILLING_ORDER_STATE_INVALID');
  if (String(order.currency || '').toUpperCase() !== 'KRW') fail('BILLING_CURRENCY_UNSUPPORTED');
  if (!Number.isSafeInteger(order.amount_minor) || order.amount_minor < 1 || order.amount_minor > 999999999999) {
    fail('BILLING_AMOUNT_INVALID');
  }
  return { id, price: String(order.amount_minor) };
}

export async function buildInicisCheckoutFields(input) {
  const order = parseOrder(input?.order);
  const timestamp = String(input?.timestamp || '');
  if (!/^\d{13,20}$/.test(timestamp)) fail('BILLING_TIMESTAMP_INVALID');

  const config = input?.config || INICIS_TEST;
  const mid = String(config.mid || '');
  const signKey = String(config.signKey || '');
  if (!/^[A-Za-z0-9]{10}$/.test(mid) || !signKey) fail('BILLING_PROVIDER_CONFIG_INVALID');

  const goodName = utf8Slice(input?.goodName, 40);
  const buyerName = utf8Slice(input?.buyer?.name, 30);
  const buyerEmail = utf8Slice(input?.buyer?.email, 60);
  const buyerTel = utf8Slice(input?.buyer?.tel, 20);
  if (!goodName || !buyerName || !buyerEmail || !buyerTel) fail('BILLING_BUYER_INPUT_INVALID');

  const returnUrl = validHttpsUrl(input?.returnUrl);
  const closeUrl = validHttpsUrl(input?.closeUrl);
  if (!returnUrl || !closeUrl) fail('BILLING_RETURN_URL_INVALID');

  const signatureSource = `oid=${order.id}&price=${order.price}&timestamp=${timestamp}`;
  const verificationSource = `oid=${order.id}&price=${order.price}&signKey=${signKey}&timestamp=${timestamp}`;
  return {
    version: '1.0',
    gopaymethod: '',
    mid,
    oid: order.id,
    price: order.price,
    timestamp,
    use_chkfake: 'Y',
    signature: await sha256Hex(signatureSource),
    verification: await sha256Hex(verificationSource),
    mKey: await sha256Hex(signKey),
    currency: 'WON',
    goodname: goodName,
    buyername: buyerName,
    buyertel: buyerTel,
    buyeremail: buyerEmail,
    returnUrl,
    closeUrl,
  };
}

