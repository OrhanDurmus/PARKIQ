export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 40 || lat > 42.5 || lng < 26 || lng > 31) {
    return Response.json({ error: 'Invalid Istanbul coordinates' }, { status: 400 });
  }
  const radius = 2200;
  const query = '[out:json][timeout:18];(node["amenity"="parking"](around:' + radius + ',' + lat + ',' + lng + ');way["amenity"="parking"](around:' + radius + ',' + lat + ',' + lng + '););out center 100;';
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 23000);
  try {
    const tasks = endpoints.map(async endpoint => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'PARKIQ/1.0 (OpenStreetMap parking discovery)' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error('Invalid upstream response');
      return data.elements.map(e => ({
        lat: e.lat ?? e.center?.lat,
        lng: e.lon ?? e.center?.lon,
        name: e.tags?.name || 'Otopark kaydı'
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    });
    const points = await Promise.any(tasks);
    return Response.json({ points, source: 'OpenStreetMap', updatedAt: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });
  } catch {
    return Response.json({ error: 'Otopark veri servisleri yanıt vermedi' }, { status: 503 });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
