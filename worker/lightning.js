// Lightning near the course, from NOAA's GOES-19 Geostationary Lightning Mapper (free, public, a new file
// about every 20 seconds: s3://noaa-goes19/GLM-L2-LCFA/YYYY/DDD/HH/). Each file is a small HDF5/netCDF-4
// with every lightning flash the satellite saw in those 20 s; we keep only the ones near Miles Grant.
//
// Kept cheap for the free Workers plan: the parsed results live in this data center's cache, refreshed at
// most every 30 s, and each refresh reads at most a couple of new files (newest first), so any one request
// stays well inside the CPU limit. Older files fill in on later refreshes.
import * as hdf5 from 'jsfive';
import { json } from './util.js';

const BUCKET = 'https://noaa-goes19.s3.amazonaws.com';
const COURSE = { lat: 27.147, lng: -80.179 };
const KEEP_MI = 40;                 // remember flashes out to 40 miles (the app alerts at 20)
const WINDOW_MS = 35 * 60 * 1000;   // the golf rule is 30 minutes after the last strike
const FRESH_MS = 30 * 1000;
const MAX_PARSE = 2;
const STATE_URL = 'https://www.milesgrant.golf/__cache/lightning-v1';

const pad = (n, w = 2) => String(n).padStart(w, '0');
function hourPrefix(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  return `GLM-L2-LCFA/${y}/${pad(doy, 3)}/${pad(d.getUTCHours())}/`;
}
// "…_s20263100747400_…" = 2026, day 310, 07:47:40.0 UTC
function fileStart(key) {
  const m = key.match(/_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)/);
  if (!m) return 0;
  const [, y, doy, h, mi, s, ds] = m.map(Number);
  return Date.UTC(y, 0, 1) + (doy - 1) * 86400000 + h * 3600000 + mi * 60000 + s * 1000 + ds * 100;
}
function miles(lat, lng) {
  const r = Math.PI / 180, dLat = (lat - COURSE.lat) * r, dLng = (lng - COURSE.lng) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(COURSE.lat * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
function bearing(lat, lng) {
  const r = Math.PI / 180, y = Math.sin((lng - COURSE.lng) * r) * Math.cos(lat * r);
  const x = Math.cos(COURSE.lat * r) * Math.sin(lat * r) - Math.sin(COURSE.lat * r) * Math.cos(lat * r) * Math.cos((lng - COURSE.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

async function listFiles(now) {
  const prefixes = [...new Set([hourPrefix(now - WINDOW_MS), hourPrefix(now)])];
  const keys = [];
  for (const p of prefixes) {
    const r = await fetch(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(p)}`);
    if (!r.ok) throw new Error(`GLM list ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Key>([^<]+\.nc)<\/Key>/g)) keys.push(m[1]);
  }
  return keys.filter(k => fileStart(k) >= now - WINDOW_MS);
}

// Flashes near the course in one 20-second file: [lat, lng]
async function readFile(key) {
  const r = await fetch(`${BUCKET}/${key}`);
  if (!r.ok) throw new Error(`GLM file ${r.status}`);
  const f = new hdf5.File(await r.arrayBuffer(), key);
  const la = f.get('flash_lat').value, lo = f.get('flash_lon').value, out = [];
  for (let i = 0; i < la.length; i++) {
    if (Math.abs(la[i] - COURSE.lat) > 0.7 || Math.abs(lo[i] - COURSE.lng) > 0.8) continue;   // cheap box first
    if (miles(la[i], lo[i]) <= KEEP_MI) out.push([Math.round(la[i] * 1e4) / 1e4, Math.round(lo[i] * 1e4) / 1e4]);
  }
  return out;
}

async function refresh(ctx) {
  const cache = caches.default, now = Date.now();
  let state = null;
  try { state = await (await cache.match(STATE_URL))?.json(); } catch { /* empty cache */ }
  state ||= { at: 0, done: {} };
  if (now - state.at < FRESH_MS) return state;

  const keys = await listFiles(now);
  const done = {};
  for (const k of keys) if (k in state.done) done[k] = state.done[k];
  const todo = keys.filter(k => !(k in done)).sort().reverse().slice(0, MAX_PARSE);
  for (const k of todo) {
    try { done[k] = await readFile(k); } catch (e) { console.warn('GLM', k, e.message); }
  }
  const next = { at: now, done, files: keys.length, latest: keys.length ? Math.max(...keys.map(fileStart)) : 0 };
  const put = cache.put(STATE_URL, new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } }));
  ctx.waitUntil(put.catch(() => {}));
  return next;
}

export async function lightning(ctx) {
  let state;
  try { state = await refresh(ctx); } catch (e) {
    console.warn('lightning', e.message);
    return json({ ok: false, error: 'Lightning data unavailable right now' }, 503, { 'cache-control': 'no-store' });
  }
  const strikes = [];
  for (const [k, list] of Object.entries(state.done)) {
    const t = fileStart(k);
    for (const [lat, lng] of list) strikes.push({ t, mi: Math.round(miles(lat, lng) * 10) / 10, brg: Math.round(bearing(lat, lng)) });
  }
  strikes.sort((a, b) => b.t - a.t);
  const read = Object.keys(state.done).length;
  return json({
    ok: true,
    source: 'NOAA GOES-19 GLM',
    checkedAt: state.at,
    dataThrough: state.latest,          // start time of the newest 20-second file
    windowMinutes: WINDOW_MS / 60000,
    filesRead: read,
    filesInWindow: state.files,
    strikes: strikes.slice(0, 300),
  }, 200, { 'cache-control': 'public, max-age=20' });
}
