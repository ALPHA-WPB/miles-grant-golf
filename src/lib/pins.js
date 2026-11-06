// Today's pin positions. Anyone's app loads them (and re-checks every few minutes); an admin sets one by
// standing at the cup. Saves made without signal wait on the phone and upload when it's back online.
import { api } from "./api";

const KEY = "mgg_pins", PENDING = "mgg_pins_pending";
const MAX_OFF_YDS = 45;     // ignore a "pin" that isn't on or right by the green

const read = k => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export const yardsBetween = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h)) * 1.09361;
};

export const readCachedPins = () => ({ ...read(KEY), ...read(PENDING) });

// Point each hole's "green" (what every yardage and flag uses) at its pin, keeping the middle of the
// green as greenCenter. Returns true if anything changed.
export function applyPins(holes, pins) {
  let changed = false;
  for (const h of holes) {
    if (!h.greenCenter) h.greenCenter = h.green;
    const p = pins[h.number];
    const ok = p && isFinite(p.lat) && isFinite(p.lng) && yardsBetween(p, h.greenCenter) <= MAX_OFF_YDS;
    const next = ok ? { lat: p.lat, lng: p.lng } : h.greenCenter;
    const setAt = ok ? p.set_at : null;
    if (next.lat !== h.green.lat || next.lng !== h.green.lng || setAt !== (h.pinSetAt ?? null)) changed = true;
    h.green = next;
    h.pinSetAt = setAt;
  }
  return changed;
}

export async function flushPending() {
  const pend = read(PENDING);
  for (const [hole, rec] of Object.entries(pend)) {
    try {
      await api(`/api/pins/${hole}`, { method: "PUT", body: rec });
    } catch (e) {
      // keep it for later (offline, signed out, server busy); drop it only if the server rejected the spot itself
      if (e.status !== 400 && e.status !== 403) throw e;
    }
    delete pend[hole];
    write(PENDING, pend);
  }
}

export async function fetchPins() {
  const d = await api("/api/pins");
  const map = {};
  for (const p of d.pins || []) map[p.hole] = p;
  write(KEY, map);
  return { ...map, ...read(PENDING) };    // our own not-yet-uploaded saves win
}

// Save a pin for everyone. Resolves { uploaded } — false means it's queued on this phone.
export async function savePin(hole, { lat, lng, accuracy_m }) {
  const rec = { hole, lat, lng, accuracy_m: accuracy_m ?? null, set_at: new Date().toISOString() };
  write(KEY, { ...read(KEY), [hole]: rec });
  write(PENDING, { ...read(PENDING), [hole]: rec });
  try { await flushPending(); return { uploaded: true, rec }; } catch { return { uploaded: false, rec }; }
}

export async function resetPin(hole) {
  const pend = read(PENDING); delete pend[hole]; write(PENDING, pend);
  await api(`/api/pins/${hole}`, { method: "DELETE" });
  const cache = read(KEY); delete cache[hole]; write(KEY, cache);
}

export function pinAge(setAt, now = Date.now()) {
  if (!setAt) return null;
  const t = Date.parse(setAt), d = new Date(t), today = new Date(now);
  if (d.toDateString() === today.toDateString()) return "set today";
  const days = Math.max(1, Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000));
  return days === 1 ? "set yesterday" : `set ${days} days ago`;
}
