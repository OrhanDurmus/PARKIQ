import { LIVE_WINDOW_MS, SNAPSHOT_WINDOW_MS, repairName } from '../_shared/ispark.js';

const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;
const READ_TIMEOUT_MS = 1500;
const pending = new Map();
const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

function snapshotAge(snapshot, now) {
  const timestamp = Date.parse(snapshot?.collectedAt ?? snapshot?.receivedAt ?? '');
  const age = now - timestamp;
  return Array.isArray(snapshot?.points) && snapshot.points.length && age >= 0 && age < SNAPSHOT_WINDOW_MS
    ? age : Infinity;
}

async function readEdge(cache, key) {
  try {
    const snapshot = await (await cache?.match(key))?.json();
    return Number.isFinite(snapshotAge(snapshot, Date.now())) ? snapshot : null;
  } catch (error) {
    console.warn('ispark edge cache read failed', error?.name);
    return null;
  }
}

async function readSnapshot(cache, key, kv, waitUntil) {
  const hit = await readEdge(cache, key);
  if (hit) return {snapshot:hit};
  const lastGoodKey = new Request(key.url + '-last-good');
  const fallback = async reason => ({snapshot:await readEdge(cache, lastGoodKey), reason});
  if (typeof kv?.get !== 'function') return fallback('storage_not_configured');

  let timeout;
  try {
    const snapshot = await Promise.race([
      kv.get('latest', 'json'),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new DOMException('Snapshot read timed out', 'TimeoutError')), READ_TIMEOUT_MS);
      })
    ]);
    if (!Number.isFinite(snapshotAge(snapshot, Date.now()))) return fallback('no_recent_snapshot');
    if (cache) {
      const save = (cacheKey, seconds) => Promise.resolve().then(() =>
        cache.put(cacheKey, Response.json(snapshot, {headers:{'Cache-Control':'public, max-age='+seconds}}))
      ).catch(error => console.warn('ispark edge cache write failed', error?.name));
      const write = Promise.all([save(key, 30), save(lastGoodKey, SNAPSHOT_WINDOW_MS/1000)]);
      if (waitUntil) waitUntil(write);
      else await write;
    }
    return {snapshot};
  } catch (error) {
    return fallback(error?.name === 'TimeoutError' ? 'storage_timeout' : 'storage_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet({request, env, waitUntil}) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(new URL('/api/ispark-occupancy?cache=v3', request.url));
  let task = pending.get(key.url);
  if (!task) {
    task = readSnapshot(cache, key, env?.ISPARK_SNAPSHOTS, waitUntil)
      .finally(() => pending.delete(key.url));
    pending.set(key.url, task);
  }
  const {snapshot, reason} = await task;
  const now = Date.now();
  const age = snapshotAge(snapshot, now);
  if (!Number.isFinite(age)) {
    return Response.json({source:'IBB İSPARK', points:[], liveCount:0, unavailable:true,
      diagnostic:{stage:'storage',reason:reason ?? 'no_recent_snapshot'}}, {headers});
  }

  const stale = age >= SNAPSHOT_FRESH_MS || Boolean(reason);
  const points = snapshot.points.filter(point => point && typeof point === 'object').map(point => {
    const measuredAt = point.measuredAt ?? point.occupancyUpdatedAt ?? null;
    const measurementAge = now - Date.parse(measuredAt ?? '');
    const verifiedLive = !stale && Number.isInteger(point.freeSpaces) && point.freeSpaces >= 0
      && measurementAge >= 0 && measurementAge < LIVE_WINDOW_MS;
    return {...point, name:repairName(point.name), measuredAt, verifiedLive,
      occupancyUpdatedAt:verifiedLive ? measuredAt : null, sourceSnapshot:true};
  });
  return Response.json({...snapshot, points, sourceSnapshot:true, snapshotAgeMinutes:Math.floor(age/60000),
    upstreamUnavailable:stale, liveCount:points.filter(point => point.verifiedLive).length,
    ...(stale ? {diagnostic:reason ? {stage:'storage',reason} : {stage:'collection',reason:'snapshot_stale'}} : {})
  }, {headers});
}
