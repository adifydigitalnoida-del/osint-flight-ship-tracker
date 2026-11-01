// Live aircraft (ADS-B) via free community feeds. No API key. Falls back across sources.
const SOURCES = [
  (la, lo, d) => `https://api.adsb.lol/v2/point/${la}/${lo}/${d}`,
  (la, lo, d) => `https://api.airplanes.live/v2/point/${la}/${lo}/${d}`,
];

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'osint-tracker/1.0 (education)' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const J = (body, status, cache) => Response.json(body, { status, headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Netlify-CDN-Cache-Control': cache } });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  let lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon')), dist = parseInt(q.get('dist'), 10);
  if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return J({ error: 'bad lat/lon' }, 400, 'no-store');
  }
  if (!isFinite(dist)) dist = 100;
  dist = Math.min(250, Math.max(10, Math.ceil(dist / 10) * 10));
  lat = Math.round(lat * 10) / 10; // rounding improves CDN cache hits
  lon = Math.round(lon * 10) / 10;

  let lastErr = 'no source';
  for (const build of SOURCES) {
    try {
      const j = await get(build(lat, lon, dist));
      const list = Array.isArray(j.ac) ? j.ac : Array.isArray(j.aircraft) ? j.aircraft : null;
      if (!list) throw new Error('unexpected payload');
      const out = [];
      for (const a of list) {
        if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
        const ground = a.alt_baro === 'ground';
        out.push({
          h: a.hex,
          c: (a.flight || '').trim(),
          r: a.r || '',
          t: a.t || '',
          la: a.lat,
          lo: a.lon,
          alt: ground ? 0 : typeof a.alt_baro === 'number' ? a.alt_baro : null,
          g: ground,
          gs: typeof a.gs === 'number' ? a.gs : null,
          tr: typeof a.track === 'number' ? a.track : 0,
          vr: typeof a.baro_rate === 'number' ? a.baro_rate : null,
          sq: a.squawk || '',
          mil: !!(a.dbFlags & 1),
        });
        if (out.length >= 1500) break;
      }
      return J({ source: new URL(build(0, 0, 1)).hostname, center: [lat, lon], dist, count: out.length, ac: out }, 200, 'public, s-maxage=10, stale-while-revalidate=20');
    } catch (e) {
      lastErr = String(e && e.message || e);
    }
  }
  return J({ error: 'all flight sources failed: ' + lastErr }, 502, 'no-store');
};

export const config = { path: '/api/flights' };
