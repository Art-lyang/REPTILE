import { MESSAGES, SUPPORTED } from './member-action-messages.mjs';
import { recordSecurityEvent } from '../security-log.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['restrict', 'restore', 'set_tier', 'delete']);

/* 보안 기록에 남길 실패.
   여기에 401(토큰 없음·형식 불량)을 넣으면 안 됩니다. 그러면 인증도 하지 않은
   요청이 우리 쪽 DB 호출을 하나씩 만들어 내서, 기록 기능 자체가 증폭 수단이
   됩니다. 그 경우는 아래에서 통째로 막고, 인증을 통과한 뒤 권한에서 걸린
   것만 남깁니다 — 이미 로그인한 부관리자가 최고관리자 동작을 시도한 경우라
   오히려 이쪽이 볼 가치가 큽니다.
   ADMIN_RECENT_AUTH_REQUIRED 는 정당한 관리자의 세션 만료라 빠집니다. */
const RECORDED_AUTH_FAILURES = new Set(['ADMIN_OWNER_REQUIRED']);

class AdminActionError extends Error {
  constructor(code, status, cause) {
    super(code, { cause });
    this.code = code;
    this.status = status;
  }
}

function languageOf(request) {
  const first = (request.headers.get('Accept-Language') || 'ko').toLowerCase().split(',')[0].split('-')[0];
  return SUPPORTED.includes(first) ? first : 'ko';
}

function message(language, code) {
  return MESSAGES[language]?.[code] || MESSAGES.ko[code] || MESSAGES.ko.ADMIN_UPSTREAM_FAILED;
}

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

function bearerToken(request) {
  const matched = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('Authorization') || '');
  return matched ? matched[1] : '';
}

function subjectFromToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('JWT parts');
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    const subject = String(payload?.sub || '').toLowerCase();
    if (!UUID_RE.test(subject)) throw new Error('JWT subject');
    return subject;
  } catch (cause) {
    throw new AdminActionError('ADMIN_SESSION_TOKEN_INVALID', 401, cause);
  }
}

function hasRecentSignIn(user, maximumAgeMs = 30 * 60 * 1000) {
  const signedInAt = Date.parse(user?.last_sign_in_at || '');
  return Number.isFinite(signedInAt) && Date.now() - signedInAt >= 0 && Date.now() - signedInAt <= maximumAgeMs;
}

async function readInput(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
  }
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > 16_384) throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
  const raw = await request.text();
  if (!raw || raw.length > 16_384) throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
  let value;
  try { value = JSON.parse(raw); } catch { throw new AdminActionError('ADMIN_INPUT_INVALID', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
  }
  const action = String(value.action || '');
  const targetId = String(value.targetId || '').toLowerCase();
  const reason = String(value.reason || '').trim();
  const tier = value.tier == null ? '' : String(value.tier);
  const grantType = value.grantType == null ? '' : String(value.grantType);
  const durationDays = value.durationDays == null ? null : value.durationDays;
  const confirmEmail = value.confirmEmail == null ? '' : String(value.confirmEmail).trim().toLowerCase();
  if (!ACTIONS.has(action) || !UUID_RE.test(targetId) || reason.length < 2 || reason.length > 500) {
    throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
  }
  if (action === 'set_tier' && !['general', 'premium'].includes(tier)) {
    throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
  }
  if (action === 'set_tier' && tier === 'premium') {
    const boundedDuration = Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 3650;
    if (!['trial', 'timed', 'permanent'].includes(grantType)
        || (grantType === 'permanent' ? durationDays !== null : !boundedDuration)) {
      throw new AdminActionError('ADMIN_INPUT_INVALID', 400);
    }
  }
  return { action, targetId, reason, tier, grantType, durationDays, confirmEmail };
}

function requiredConfig(env) {
  const url = String(env?.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const secret = String(env?.SUPABASE_SECRET_KEY || '').trim();
  const publishable = String(env?.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)
      || secret.length < 8 || !publishable.startsWith('sb_publishable_')) {
    throw new AdminActionError('ADMIN_CONFIG_MISSING', 503);
  }
  const fetcher = env?.ADMIN_FETCH || ((input, init) => globalThis.fetch(input, init));
  return { url, secret, publishable, fetcher };
}

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function call(config, pathname, { method = 'POST', token, body } = {}) {
  let response;
  try {
    const apiKey = token ? config.publishable : config.secret;
    const authorizationToken = token || (apiKey.startsWith('sb_') ? '' : apiKey);
    response = await config.fetcher(`${config.url}${pathname}`, {
      method,
      headers: {
        apikey: apiKey,
        ...(authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : {}),
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw new AdminActionError('ADMIN_UPSTREAM_FAILED', 502, cause);
  }
  const data = await parseResponse(response);
  if (!response.ok) {
    const upstreamCode = typeof data === 'object' && data ? String(data.message || data.code || '') : String(data || '');
    const mapped = upstreamCode.includes('ADMIN_MEMBER_NOT_FOUND') ? 'ADMIN_MEMBER_NOT_FOUND'
      : upstreamCode.includes('ADMIN_MEMBER_ADMIN_ACTION_FORBIDDEN') ? 'ADMIN_MEMBER_ADMIN_ACTION_FORBIDDEN'
        : upstreamCode.includes('ADMIN_OWNER_REQUIRED') ? 'ADMIN_OWNER_REQUIRED' : 'ADMIN_UPSTREAM_FAILED';
    const error = new AdminActionError(mapped, mapped === 'ADMIN_MEMBER_NOT_FOUND' ? 404 : mapped === 'ADMIN_UPSTREAM_FAILED' ? 502 : 403);
    error.upstreamStatus = response.status;
    error.upstreamCode = upstreamCode.slice(0, 80);
    throw error;
  }
  return data;
}

const rpc = (config, name, body, token) =>
  call(config, `/rest/v1/rpc/${name}`, { method: 'POST', token, body });

async function authenticateOwner(config, request) {
  const token = bearerToken(request);
  if (!token) throw new AdminActionError('ADMIN_AUTH_REQUIRED', 401);
  const actorId = subjectFromToken(token);
  let role;
  try { role = await rpc(config, 'my_admin_role', {}, token); }
  catch (cause) { throw new AdminActionError('ADMIN_SESSION_VERIFY_FAILED', 401, cause); }
  if (role !== 'owner') throw new AdminActionError('ADMIN_OWNER_REQUIRED', 403);
  return { token, user: { id: actorId } };
}

async function guardTarget(config, actorId, targetId) {
  const target = await rpc(config, 'admin_assert_member_target_service', {
    p_actor: actorId,
    p_target: targetId,
  });
  if (!target?.email) throw new AdminActionError('ADMIN_MEMBER_NOT_FOUND', 404);
  return target;
}

async function updateBan(config, targetId, banDuration) {
  return call(config, `/auth/v1/admin/users/${targetId}`, {
    method: 'PUT',
    body: { ban_duration: banDuration },
  });
}

async function record(config, actorId, input, action = input.action, status = 'success', details = {}) {
  return rpc(config, 'admin_record_member_action_service', {
    p_actor: actorId,
    p_target: input.targetId,
    p_action: action,
    p_reason: input.reason,
    p_status: status,
    p_details: details,
  });
}

export async function handleAdminMemberAction(request, env, ctx) {
  const language = languageOf(request);
  try {
    if (request.method !== 'POST') throw new AdminActionError('ADMIN_METHOD_NOT_ALLOWED', 405);
    const input = await readInput(request);
    const config = requiredConfig(env);
    const { user } = await authenticateOwner(config, request);
    if (user.id === input.targetId) throw new AdminActionError('ADMIN_SELF_ACTION_FORBIDDEN', 400);
    if (input.action === 'delete') {
      const actor = await call(config, `/auth/v1/admin/users/${user.id}`, { method: 'GET' });
      if (!hasRecentSignIn(actor)) throw new AdminActionError('ADMIN_RECENT_AUTH_REQUIRED', 403);
    }

    if (input.action === 'set_tier') {
      await rpc(config, 'admin_set_member_tier_service', {
        p_actor: user.id,
        p_target: input.targetId,
        p_tier: input.tier,
        p_reason: input.reason,
        p_grant_type: input.tier === 'premium' ? input.grantType : null,
        p_duration_days: input.tier === 'premium' ? input.durationDays : null,
      });
    } else {
      const target = await guardTarget(config, user.id, input.targetId);
      if (input.action === 'restrict' || input.action === 'restore') {
        await updateBan(config, input.targetId, input.action === 'restrict' ? '876000h' : 'none');
        await record(config, user.id, input);
      } else if (input.action === 'delete') {
        if (!input.confirmEmail || input.confirmEmail !== String(target.email).toLowerCase()) {
          throw new AdminActionError('ADMIN_DELETE_CONFIRM_INVALID', 400);
        }
        await updateBan(config, input.targetId, '876000h');
        await rpc(config, 'admin_prepare_member_deletion_service', {
          p_actor: user.id,
          p_target: input.targetId,
          p_reason: input.reason,
        });
        await call(config, `/auth/v1/admin/users/${input.targetId}`, { method: 'DELETE' });
        await record(config, user.id, input);
      }
    }

    return json({ ok: true, code: 'ADMIN_OK', message: message(language, 'ADMIN_OK') });
  } catch (error) {
    const safe = error instanceof AdminActionError
      ? error : new AdminActionError('ADMIN_UPSTREAM_FAILED', 500, error);
    if (safe.status >= 500) console.error('admin member action failed', safe.cause || safe);
    /* 남의 자격으로 들어오려 한 것만 남깁니다.
       ADMIN_RECENT_AUTH_REQUIRED 는 정당한 최고관리자인데 로그인이 오래돼서
       다시 하라는 뜻이라 공격이 아닙니다. 그것까지 모으면 진짜 시도가 묻힙니다.
       코드만 남기고 본문은 남기지 않습니다 — 요청에는 대상 회원 정보가 들어
       있어서 그대로 쌓으면 그게 또 유출입니다. */
    if (RECORDED_AUTH_FAILURES.has(safe.code)) {
      recordSecurityEvent(request, env, ctx, 'admin_auth_fail', { code: safe.code });
    }
    return json({ ok: false, code: safe.code, message: message(language, safe.code) }, safe.status);
  }
}
