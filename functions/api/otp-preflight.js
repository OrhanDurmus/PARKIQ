const json = (body, status = 200) => Response.json(body, {
 headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
 status,
});

function unavailable(diagnostics, reason, upstreamStatus = null) {
 if (diagnostics) {
  console.warn('otp-preflight unavailable', {reason, upstreamStatus});
 }
 return json({ok: false, error: 'preflight_unavailable'}, 503);
}

export async function onRequestPost({request, env}) {
 let email;
 try {
  const body = await request.json();
  email = String(body.email || '').trim().toLowerCase();
 } catch {
  return json({ok: false, error: 'invalid_request'}, 400);
 }
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  return json({ok: false, error: 'invalid_email'}, 400);
 }

 // Enable temporarily in the rotapark-staging Pages project.
 const host = new URL(request.url).hostname;
 const diagnostics = env.OTP_PREFLIGHT_DIAGNOSTICS === '1' &&
  (host === 'rotapark-staging.pages.dev' || host.endsWith('.rotapark-staging.pages.dev'));
 const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
 const service = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
 if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  return unavailable(diagnostics, 'invalid_supabase_url');
 }
 if (!service) {
  return unavailable(diagnostics, 'missing_service_key');
 }

 let upstreamStatus = null;
 let blocked;
 const signal = AbortSignal.timeout(6000);
 try {
  const response = await fetch(url + '/rest/v1/rpc/rotapark_email_is_blocked', {
   method: 'POST',
   headers: {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'},
   body: JSON.stringify({lookup_email: email}),
   signal,
  });
  upstreamStatus = response.status;
  if (!response.ok) {
   return unavailable(diagnostics, 'rpc_http_error', upstreamStatus);
  }
  blocked = await response.json();
 } catch (error) {
  const reason = signal.aborted ? 'rpc_timeout' :
   error instanceof SyntaxError ? 'rpc_invalid_json' : 'rpc_connection_error';
  return unavailable(diagnostics, reason, upstreamStatus);
 }
 if (typeof blocked !== 'boolean') {
  return unavailable(diagnostics, 'rpc_invalid_boolean', upstreamStatus);
 }

 try {
  if (blocked && env.ISPARK_SNAPSHOTS) {
   const ticket = crypto.randomUUID() + crypto.randomUUID();
   await env.ISPARK_SNAPSHOTS.put('support:ticket:' + ticket, JSON.stringify({email, createdAt: Date.now()}), {expirationTtl: 600});
   return json({ok: true, blocked, supportTicket: ticket});
  }
  return json({ok: true, blocked});
 } catch {
  return unavailable(diagnostics, 'support_ticket_error', upstreamStatus);
 }
}
