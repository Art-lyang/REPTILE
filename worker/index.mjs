import { billingUnavailableMessage } from './billing/messages.mjs';
import { handleAdminMemberAction } from './admin/member-actions.mjs';
import { recordSecurityEvent } from './security-log.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/members/action') {
    return handleAdminMemberAction(request, env, ctx);
  }

  if (url.pathname.startsWith('/api/admin/')) {
    /* 없는 관리자 경로를 찾아다니는 요청입니다. 정상 이용자는 여기 오지 않습니다.
       기록은 응답을 막지 않습니다(worker/security-log.mjs 참고). */
    recordSecurityEvent(request, env, ctx, 'admin_probe');
    return json({ code: 'ADMIN_API_NOT_FOUND', message: 'Admin API route not found.' }, 404);
  }

  if (url.pathname === '/api/billing/status' && request.method === 'GET') {
    return json({
      sales_enabled: false,
      checkout_ready: false,
      schema_ready: true,
      request_builder_ready: true,
      merchant_contract_required: true,
      provider: 'none',
      mode: 'disabled',
      message: billingUnavailableMessage(request),
    });
  }

  if (url.pathname.startsWith('/api/billing/')) {
    /* 아직 열지 않은 결제 경로입니다. 화면 어디에서도 부르지 않으므로,
       여기로 오는 것은 사람이 주소를 찍었거나 자동으로 훑는 쪽입니다.
       (status 는 상태를 알리는 정상 경로라 위에서 먼저 처리하고 기록하지 않습니다) */
    recordSecurityEvent(request, env, ctx, 'billing_probe');
    return json({
      code: 'BILLING_NOT_AVAILABLE',
      message: billingUnavailableMessage(request),
    }, 503);
  }

  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return new Response('Static asset binding is unavailable.', { status: 503 });
  }
  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
