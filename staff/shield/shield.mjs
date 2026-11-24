const status = document.querySelector('#status');
const panel = document.querySelector('#panel');
const mfaForm = document.querySelector('#mfa');
const change = document.querySelector('#change');
const next = document.querySelector('#next');
const modes = { normal: 'Normal', defense: 'Savunma', emergency: 'Acil Durum Güvenli Modu' };
const routes = { tts: 'Ses API', 'otp-preflight': 'OTP ön kontrolü' };
const reasons = { client_quota: 'İstemci kotası', daily_quota: 'Günlük kota', emergency: 'Acil Durum' };
let client;
let factor;
let state;
let busy = false;

function list(id, entries, empty) {
  document.querySelector(id).replaceChildren(...(entries.length ? entries : [empty]).map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

async function api(params) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw Error('Önce ROTAPARK hesabına giriş yapın.');
  return fetch('/api/shield', {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + data.session.access_token,
      ...(params ? { 'Content-Type': 'application/json' } : {}) },
    body: params ? JSON.stringify(params) : undefined,
    cache: 'no-store',
  });
}

async function refresh() {
  const response = await api();
  if (response.status === 404) throw Error('SHIELD bu ortamda yapılandırılmamış.');
  if (response.status === 403 || response.status === 401) {
    panel.hidden = true;
    state = undefined;
    const { data: levels } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: role } = await client.rpc('rotapark_my_role');
    if (role === 'founder' && levels?.currentLevel === 'aal1') {
      const { data: factors } = await client.auth.mfa.listFactors();
      factor = factors?.totp.find(item => item.status === 'verified');
      mfaForm.hidden = !factor;
      throw Error(factor ? 'SHIELD işlemleri için ek doğrulama gerekli.' :
        'SHIELD erişimi için kurucu hesabında doğrulanmış TOTP faktörü gerekli.');
    }
    throw Error('SHIELD erişimi doğrulanamadı.');
  }
  if (!response.ok) {
    panel.hidden = true;
    state = undefined;
    throw Error('SHIELD durumu doğrulanamadı.');
  }
  const updated = await response.json();
  const total = signals => signals?.reduce((sum, signal) => sum + signal.total, 0);
  if (state && (state.revision !== updated.revision || state.mode !== updated.mode ||
      total(updated.signals) > total(state.signals))) {
    document.querySelector('#alert').textContent = 'Güvenlik olayları güncellendi.';
  }
  state = updated;
  const expiry = state.expiresAt ? ' · Bitiş ' + new Date(state.expiresAt).toLocaleTimeString('tr-TR') : '';
  document.querySelector('#mode').textContent = 'Veritabanındaki mod: ' + modes[state.mode] + expiry;
  list('#events', state.events.map(event =>
    new Date(event.occurred_at).toLocaleString('tr-TR') + ' · ' + modes[event.mode]), 'Mod değişikliği kaydı yok.');
  list('#signals', (state.signals || []).map(signal =>
    routes[signal.route] + ' · ' + reasons[signal.reason] + ' · ' + signal.total),
  state.signals ? 'Bugün engelleme kaydı yok.' : 'Otomatik olay kaynağı doğrulanamadı.');
  status.textContent = 'Staging güvenlik durumu';
  mfaForm.hidden = true;
  panel.hidden = false;
}

async function run(form, action) {
  if (busy) return;
  busy = true;
  const button = form?.querySelector('button');
  if (button) button.disabled = true;
  try {
    await action();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
    busy = false;
  }
}

mfaForm.addEventListener('submit', event => {
  event.preventDefault();
  void run(mfaForm, async () => {
    const code = mfaForm.elements.code;
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.value });
    code.value = '';
    if (error) throw Error('İkinci doğrulama tamamlanamadı.');
    await refresh();
  });
});

change.addEventListener('submit', event => {
  event.preventDefault();
  const mode = next.value;
  if (!state || !modes[mode] || !confirm(modes[mode] + ' moduna geçilsin mi?')) return;
  void run(change, async () => {
    const response = await api({ mode, revision: state.revision });
    await refresh();
    if (response.status === 409) throw Error('Mod bu sırada değişti. Güncel durumu kontrol edin.');
    if (!response.ok) throw Error('Mod değişikliği doğrulanamadı.');
    next.value = '';
  });
});

void run(null, async () => {
  const response = await fetch('/api/auth-config', { cache: 'no-store' });
  const config = await response.json();
  if (!config.configured) throw Error('Giriş yapılandırması bulunamadı.');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(config.url, config.anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: false } });
  setInterval(() => { if (!document.hidden) void run(null, refresh); }, 15000);
  await refresh();
});
