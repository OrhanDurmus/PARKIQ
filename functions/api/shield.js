import { shieldEnabled, shieldIsStagingHost, shieldJson, shieldRpc, shieldReadJson } from '../_lib/shield.mjs';

export async function onRequest({ request, env }) {
  if (!shieldEnabled(env) || !shieldIsStagingHost(request, env)) return shieldJson({ error: 'shield_unconfigured' }, 404);
  if (!['GET', 'POST'].includes(request.method)) {
    return shieldJson({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return shieldJson({ error: 'authentication_required' }, 401);

  let params = {};
  const changing = request.method === 'POST';
  if (changing) {
    try {
      const { mode, revision } = await shieldReadJson(request, 1024);
      if (!['normal', 'defense', 'emergency'].includes(mode) ||
          !Number.isSafeInteger(revision) || revision < 0 || revision > 2147483647) {
        return shieldJson({ error: 'invalid_request' }, 400);
      }
      params = { p_mode: mode, p_revision: revision };
    } catch {
      return shieldJson({ error: 'invalid_request' }, 400);
    }
  }

  try {
    const method = changing ? 'rotapark_shield_set_mode' : 'rotapark_shield_status';
    const response = await shieldRpc(env, method, params, token);
    if ([401, 403, 409].includes(response.status)) {
      return shieldJson({ error: 'shield_request_denied' }, response.status);
    }
    if (!response.ok) return shieldJson({ error: 'shield_unavailable' }, 503);
    const state = await response.json();
    if (changing) return shieldJson(state);

    // A read failure is reported independently so a founder can still restore Normal.
    try {
      const day = Math.floor(Date.now() / 86400000);
      const result = await env.SHIELD_DB.prepare(
        'SELECT route, reason, total FROM shield_signals WHERE bucket = ? ORDER BY route, reason',
      ).bind(day).all();
      if (!result.success) throw Error('Signals unavailable');
      return shieldJson({ ...state, signals: result.results });
    } catch {
      return shieldJson({ ...state, signals: null });
    }
  } catch {
    return shieldJson({ error: 'shield_unavailable' }, 503);
  }
}
