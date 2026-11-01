// Live vessels (AIS) from Finland's open Digitraffic feed (Baltic Sea / N. Europe). No API key. CC BY 4.0.
const BASE = 'https://meri.digitraffic.fi/api/ais/v1';
const HEADERS = { Accept: 'application/json', 'Digitraffic-User': 'osint-tracker/1.0' };
let meta = { t: 0, map: null };

async function get(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: HEADERS });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function getMeta() {
  if (meta.map && Date.now() - meta.t < 3600e3) return meta.map;
  try {
    const arr = await get(BASE + '/vessels', 6000);
    const m = new Map();
    for (const v of Array.isArray(arr) ? arr : []) m.set(v.mmsi, v);
    meta = { t: Date.now(), map: m };
  } catch (e) { /* names are optional */ }
  return meta.map;
}

const J = (body, status, cache) => Response.json(body, { status, headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Netlify-CDN-Cache-Control': cache } });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const n = parseFloat(q.get('n')), s = parseFloat(q.get('s')), e = parseFloat(q.get('e')), w = parseFloat(q.get('w'));
  if (![n, s, e, w].every(isFinite) || n <= s) return J({ error: 'bad bbox' }, 400, 'no-store');
  try {
    const [loc, vm] = await Promise.all([get(BASE + '/locations', 8000), getMeta()]);
    const out = [];
    const now = Date.now();
    for (const f of loc.features || []) {
      const c = f.geometry && f.geometry.coordinates;
      const p = f.properties || {};
      if (!c) continue;
      const lo = c[0], la = c[1];
      const inLon = w <= e ? lo >= w && lo <= e : lo >= w || lo <= e;
      if (la > n || la < s || !inLon) continue;
      const ts = p.timestampExternal || 0;
      if (ts && now - ts > 3 * 3600e3) continue; // drop stale positions
      const v = (vm && vm.get(p.mmsi)) || {};
      out.push({
        m: p.mmsi, n: (v.name || '').trim(), la, lo,
        sog: typeof p.sog === 'number' && p.sog < 102 ? p.sog : null,
        cog: typeof p.cog === 'number' && p.cog < 360 ? p.cog : null,
        hd: typeof p.heading === 'number' && p.heading < 360 ? p.heading : null,
        ns: p.navStat, st: v.shipType || 0, d: (v.destination || '').trim(),
        cs: v.callSign || '', imo: v.imo || '', ts,
      });
      if (out.length >= 1500) break;
    }
    return J({ source: 'meri.digitraffic.fi', count: out.length, ships: out }, 200, 'public, s-maxage=30, stale-while-revalidate=60');
  } catch (err) {
    return J({ error: 'ship source failed: ' + String(err && err.message || err) }, 502, 'no-store');
  }
};

export const config = { path: '/api/ships' };
