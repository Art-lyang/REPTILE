/* =============================================================================
   보안 이벤트 기록 — Worker 가 보고도 버리던 것을 남깁니다
   -----------------------------------------------------------------------------
   관리자 API 를 찔러보는 요청과 아직 닫아 둔 결제 경로 접근은 지금까지 그냥
   404·503 을 돌려주고 끝이었습니다. 그래서 "누가 우리 시스템을 노렸는가" 를
   나중에 볼 방법이 없었습니다. (Cloudflare 무료 플랜은 막은 위협의 개수만 주고
   상세는 주지 않습니다 — supabase_v53.sql 의 설명 참고)

   지켜야 할 것
     · 기록이 실패해도 응답은 그대로 나가야 합니다. 기록 때문에 사이트가
       느려지거나 죽으면 본말전도입니다. 그래서 await 하지 않고 waitUntil 로
       흘려보내고, 실패는 조용히 삼킵니다.
     · 기록 자체가 공격 표면이 되면 안 됩니다. 같은 (종류, IP) 를 1분에 한 줄로
       묶는 것은 DB 함수(private.record_security_event)가 합니다.
     · 서비스 키는 Worker 안에서만 씁니다. 브라우저로 나가면 안 됩니다.
   ============================================================================= */

/* Cloudflare 가 붙여 주는 헤더입니다. 프록시 뒤라 request 에서 직접 알 수 없습니다. */
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || null;
}

function clientCountry(request) {
  return (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || null;
}

/* 같은 곳에서 쏟아지는 요청을 Worker 안에서 먼저 걸러 냅니다.
   -----------------------------------------------------------------------------
   DB 함수도 1분에 한 줄로 묶지만, 그건 이미 DB 까지 다녀온 뒤의 이야기입니다.
   누군가 초당 수백 번 두드리면 그만큼 Supabase 요청이 나가서, 기록 기능이
   오히려 우리를 때리는 수단이 됩니다. 그래서 여기서 한 번 더 막습니다.

   isolate 마다 따로 기억하므로 완벽하지는 않습니다. 다만 한 곳에서 쏟아지는
   요청은 대개 같은 isolate 가 받으므로 대부분 걸러집니다. 남는 것은 DB 쪽
   1분 규칙이 받습니다. */
const WINDOW_MS = 60000;
const MAX_KEYS = 500;
const seen = new Map();

function throttled(key, now) {
  const last = seen.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return true;
  /* 오래된 것부터 버려서 메모리가 무한정 늘지 않게 합니다. */
  if (seen.size >= MAX_KEYS) {
    for (const [k, t] of seen) {
      if (now - t >= WINDOW_MS) seen.delete(k);
      if (seen.size < MAX_KEYS) break;
    }
    if (seen.size >= MAX_KEYS) seen.delete(seen.keys().next().value);
  }
  seen.set(key, now);
  return false;
}

/* 기록 한 줄을 보냅니다. 반환값은 쓰지 않습니다 — 부르는 쪽은 기다리지 않습니다. */
async function send(env, payload) {
  const url = String(env?.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const secret = String(env?.SUPABASE_SECRET_KEY || '').trim();
  /* 키가 없으면 조용히 넘어갑니다. 로컬이나 설정 전 환경에서 요청이 실패하는
     것보다, 기록만 빠지는 편이 낫습니다. */
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || secret.length < 8) return;

  const fetcher = env?.ADMIN_FETCH || ((input, init) => globalThis.fetch(input, init));
  await fetcher(`${url}/rest/v1/rpc/record_security_event`, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'private',
      'Content-Profile': 'private',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 보안 이벤트를 남깁니다. 응답을 막지 않습니다.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx     waitUntil 을 쓰기 위한 실행 컨텍스트 (없으면 그냥 흘림)
 * @param {string}  kind    admin_probe | admin_auth_fail | billing_probe | other
 * @param {object}  detail  추가로 남길 것 (선택)
 */
export function recordSecurityEvent(request, env, ctx, kind, detail) {
  let url;
  try { url = new URL(request.url); } catch { return; }

  const ip = clientIp(request);
  if (throttled(kind + '|' + (ip || '?'), Date.now())) return;

  const payload = {
    p_kind: kind,
    p_method: request.method,
    p_path: url.pathname,
    p_ip: ip,
    p_country: clientCountry(request),
    p_ua: request.headers.get('User-Agent'),
    p_detail: detail && typeof detail === 'object' ? detail : {},
  };

  const task = send(env, payload).catch(() => {});
  /* waitUntil 이 있으면 응답을 보낸 뒤에도 끝까지 보내고, 없으면 그냥 둡니다. */
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
}
