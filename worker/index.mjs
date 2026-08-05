import { billingUnavailableMessage } from './billing/messages.mjs';
import { handleAdminMemberAction } from './admin/member-actions.mjs';

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

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/members/action') {
    return handleAdminMemberAction(request, env);
  }

  if (url.pathname.startsWith('/api/admin/')) {
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
