// ROTAPARK: server-side nearby recipient selection.
// Only use for reports that have passed the existing report validation and moderation rules.
export const MAX_RADIUS_METERS = 1000;
export const MAX_SUBSCRIPTION_AGE_DAYS = 30;
export function distanceMeters(lat1, lon1, lat2, lon2) {
  if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 +
    Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
export async function findNearbyPushRecipients(db, {latitude, longitude, reportId}) {
  if (!db || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      typeof reportId !== 'string' || !reportId || reportId.length > 128) {
    throw new Error('invalid_nearby_push_query');
  }
  // Bounding box is an optimization only; final filter uses great-circle distance.
  const latDelta = MAX_RADIUS_METERS / 110500;
  const cosLat = Math.cos(latitude * Math.PI / 180);
  const lonDelta = Math.min(180, MAX_RADIUS_METERS / (110500 * Math.max(cosLat, 0.01)));
  const result = await db.prepare(`
    SELECT s.endpoint_hash,s.endpoint,s.p256dh,s.auth,s.latitude,s.longitude
    FROM nearby_push_subscriptions s
    WHERE s.user_id IS NOT NULL AND s.consented_at IS NOT NULL
      AND s.latitude BETWEEN ? AND ?
      AND s.longitude BETWEEN ? AND ?
      AND s.updated_at >= datetime('now', '-30 days')
      AND NOT EXISTS (
        SELECT 1 FROM nearby_push_deliveries d
        WHERE d.report_id = ? AND d.endpoint_hash = s.endpoint_hash
      )
    LIMIT 500
  `).bind(latitude-latDelta,latitude+latDelta,longitude-lonDelta,longitude+lonDelta,reportId).all();
  return (result.results || []).map(s => ({
    ...s, distanceMeters: Math.round(distanceMeters(latitude,longitude,s.latitude,s.longitude))
  })).filter(s => s.distanceMeters <= MAX_RADIUS_METERS);
}
// Delivery deduplication must be reserved atomically before each send, with retry handling.
// Do not expose subscription endpoints or encryption keys in any public response.
