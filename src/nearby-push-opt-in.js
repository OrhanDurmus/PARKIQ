// ROTAPARK nearby parking Web Push opt-in helper.
// Call enableNearbyParkingPush() ONLY from a user-initiated click/tap.
// iOS 16.4+ requires the website to be installed on the Home Screen.
const decodeKey = key => {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};
export async function enableNearbyParkingPush({ latitude, longitude }) {
  if (!isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('push_not_supported');
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('location_required');
  if (Notification.permission === 'denied') throw new Error('permission_denied');
  // Must be called directly from a click handler; don't auto-prompt on page load.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission_not_granted');
  const keyResponse = await fetch('/api/nearby-push', { cache: 'no-store', credentials: 'same-origin' });
  if (!keyResponse.ok) throw new Error('push_not_configured');
  const { publicKey } = await keyResponse.json();
  if (typeof publicKey !== 'string') throw new Error('push_not_configured');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const ready = await navigator.serviceWorker.ready;
  const subscription = await ready.pushManager.getSubscription() ||
    await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
  const response = await fetch('/api/nearby-push', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), latitude, longitude })
  });
  if (!response.ok) throw new Error('subscription_save_failed');
  return { enabled: true };
}

export async function disableNearbyParkingPush() {
  if (!('serviceWorker' in navigator)) return { enabled: false };
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return { enabled: false };
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { enabled: false };
  // Remove server record first; otherwise a failed request would leave an orphaned record.
  const response = await fetch('/api/nearby-push', {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  if (!response.ok) throw new Error('subscription_delete_failed');
  await subscription.unsubscribe();
  return { enabled: false };
}
