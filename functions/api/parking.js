export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 40 || lat > 42.5 || lng < 26 || lng > 31) {
    return Response.json({ error: 'Geçersiz İstanbul koordinatı' }, { status: 400 });
  }
  const radius = 1800;
  const query = '[out:json][timeout:15];(node["amenity"="parking"](around:' + radius + ',' + lat + ',' + lng + ');way["amenity"="parking"](around:' + radius + ',' + lat + ',' + lng + '););out center 80;';
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];
  const errors = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const attempts = endpoints.map(async (endpoint, i) => {
      try {
        const response = await fetch(endpoint + '?data=' + encodeURIComponent(query), {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error('Geçersiz JSON yanıtı');
        return { points: data.elements.map(e => ({
          lat: e.lat ?? e.center?.lat,
          lng: e.lon ?? e.center?.lon,
          name: e.tags?.name || 'Otopark kaydı'
        })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)), source: 'OpenStreetMap', endpoint: i + 1 };
      } catch (e) {
        errors[i] = e.name === 'AbortError' ? 'Zaman aşımı' : String(e.message).slice(0, 100);
        throw e;
      }
    });
    const result = await Promise.any(attempts);
    return Response.json({ points: result.points, source: result.source, updatedAt: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });
  } catch (e) {
    return Response.json({ error: 'Veri servislerinden sonuç alınamadı', diagnostics: errors.map((x,i) => 'Kaynak ' + (i+1) + ': ' + (x || 'Yanıt yok')) }, { status: 503 });
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
