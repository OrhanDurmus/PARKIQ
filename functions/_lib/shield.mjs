import { isPublicSupabaseKey } from './staff-permissions.mjs';

const policies = {
  tts: { normal: 30, defense: 10, daily: 3000 },
  'otp-preflight': { normal: 20, defense: 8, daily: 5000 },
};

export function shieldEnabled(env) {
  return env.SHIELD_STAGE === 'staging';
}

export function shieldIsStagingHost(request, env) {
  return Boolean(env.SHIELD_STAGING_HOST && new URL(request.url).hostname === env.SHIELD_STAGING_HOST);
}

export function shieldJson(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

export async function shieldRpc(env, name, body, accessToken) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '');
  if (!/^[a-z0-9-]+$/.test(env.SHIELD_SUPABASE_PROJECT_REF || '') ||
      url !== 'https://' + env.SHIELD_SUPABASE_PROJECT_REF + '.supabase.co' ||
      !isPublicSupabaseKey(key)) throw Error('Supabase unavailable');
  return fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
}

async function clientSubject(ip, secret, day) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(day + ':' + ip));
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('');
}

const reserveSql = `
  INSERT INTO shield_quota(route, bucket, subject, used) VALUES (?, ?, ?, 1)
  ON CONFLICT(route, bucket, subject) DO UPDATE SET used = used + 1 WHERE used < ?
`;

async function recordSignal(db, route, day, reason) {
  // Logging failures must never undo a protective decision.
  try {
    await db.prepare(`
      INSERT INTO shield_signals(route, bucket, reason, total) VALUES (?, ?, ?, 1)
      ON CONFLICT(route, bucket, reason) DO UPDATE SET total = total + 1
    `).bind(route, day, reason).run();
  } catch {
    console.error('SHIELD signal write failed');
  }
}

export async function shieldGuard({ request, env }, route, now = Date.now()) {
  if (!shieldEnabled(env)) return null;
  const policy = policies[route];
  const db = env.SHIELD_DB;
  const secret = env.SHIELD_IP_HMAC_KEY;
  const ip = request.headers.get('CF-Connecting-IP');
  if (!shieldIsStagingHost(request, env) || !policy || !db || !ip || typeof secret !== 'string' || secret.length < 32) {
    return shieldJson({ error: 'shield_unavailable' }, 503);
  }
  const day = Math.floor(now / 86400000);
  try {
    const window = Math.floor(now / 300000);
    const subject = await clientSubject(ip, secret, day);
    const client = await db.prepare(reserveSql).bind(route, window, subject, policy.normal).run();
    if (!client.success) throw Error('Quota unavailable');
    if (client.meta.changes === 0) {
      await recordSignal(db, route, day, 'client_quota');
      return shieldJson({ error: 'rate_limited' }, 429,
        { 'Retry-After': String(Math.ceil((300000 - now % 300000) / 1000)) });
    }
    const response = await shieldRpc(env, 'rotapark_shield_mode', {});
    if (!response.ok) throw Error('Mode unavailable');
    const mode = await response.json();
    if (!['normal', 'defense', 'emergency'].includes(mode)) throw Error('Invalid mode');
    if (mode === 'emergency' && route === 'tts') {
      await recordSignal(db, route, day, 'emergency');
      return shieldJson({ error: 'shield_emergency' }, 503);
    }
    if (mode !== 'normal') {
      const defensive = await db.prepare(reserveSql)
        .bind(route, window, 'defense:' + subject, policy.defense).run();
      if (!defensive.success) throw Error('Quota unavailable');
      if (defensive.meta.changes === 0) {
        await recordSignal(db, route, day, 'client_quota');
        return shieldJson({ error: 'rate_limited' }, 429,
          { 'Retry-After': String(Math.ceil((300000 - now % 300000) / 1000)) });
      }
    }
    const global = await db.prepare(reserveSql).bind(route, day, 'global', policy.daily).run();
    if (!global.success) throw Error('Quota unavailable');
    if (global.meta.changes === 0) {
      await recordSignal(db, route, day, 'daily_quota');
      return shieldJson({ error: 'daily_quota' }, 429,
        { 'Retry-After': String(Math.ceil((86400000 - now % 86400000) / 1000)) });
    }
    return null;
  } catch {
    return shieldJson({ error: 'shield_unavailable' }, 503);
  }
}

export async function shieldReadJson(request, maximumBytes = 4096) {
  if (!request.body) throw Error('Missing body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let value = '';
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) throw new RangeError('Body too large');
      value += decoder.decode(chunk, { stream: true });
    }
    return JSON.parse(value + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
