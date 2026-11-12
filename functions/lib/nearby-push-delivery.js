// Reserve a report/device pair before sending; only one concurrent worker can win.
// Caller must release on retryable failure. Never mark success before provider accepts.
export async function reserveNearbyPushDelivery(db, reportId, endpointHash) {
  if (!db || typeof reportId !== 'string' || !/^[\\w:-]{1,128}$/.test(reportId) ||
      typeof endpointHash !== 'string' || !/^[a-f0-9]{64}$/.test(endpointHash)) {
    throw new Error('invalid_push_delivery_reservation');
  }
  const result = await db.prepare(
    'INSERT OR IGNORE INTO nearby_push_deliveries(report_id,endpoint_hash) VALUES(?,?)'
  ).bind(reportId, endpointHash).run();
  return Number(result.meta?.changes || 0) === 1;
}
export async function releaseNearbyPushDelivery(db, reportId, endpointHash) {
  await db.prepare(
    'DELETE FROM nearby_push_deliveries WHERE report_id=? AND endpoint_hash=?'
  ).bind(reportId, endpointHash).run();
}
export async function deleteExpiredPushSubscription(db, endpointHash) {
  if (typeof endpointHash !== 'string' || !/^[a-f0-9]{64}$/.test(endpointHash)) {
    throw new Error('invalid_endpoint_hash');
  }
  await db.prepare('DELETE FROM nearby_push_subscriptions WHERE endpoint_hash=?')
    .bind(endpointHash).run();
}
// A delivery record represents a reservation/accepted send, not device receipt.
// Production sending requires VAPID JWT signing, RFC 8291 payload encryption,
// provider response handling, and a retry/lease policy.
