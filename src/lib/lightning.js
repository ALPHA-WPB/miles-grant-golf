// Lightning watch: polls /api/lightning (NOAA GOES-19 satellite flashes near the course) while the app is
// open and visible. "Active" = a strike within 20 miles in the last 30 minutes (the golf safety rule:
// stay sheltered until 30 minutes pass with no strike that close). The last nearby strike is remembered
// on this device, so closing and reopening the app inside those 30 minutes keeps the warning up.
import { useEffect, useState } from "react";

export const RADIUS_MI = 20;
export const HOLD_MS = 30 * 60 * 1000;
const POLL_MS = 30 * 1000;
const KEY = "mgg_lightning_last";

const CARD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const cardinal = (deg) => CARD[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

let state = { last: readLast(), checkedAt: 0, ok: null, alertAt: 0 };
const subs = new Set();
let timer = 0;

function readLast() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && Date.now() - v.t < HOLD_MS ? v : null; } catch { return null; }
}
function set(patch) {
  state = { ...state, ...patch };
  subs.forEach(fn => fn(state));
}

async function poll() {
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    const r = await fetch("/api/lightning");
    const d = await r.json();
    if (!r.ok || !d.ok) { set({ ok: false, checkedAt: Date.now() }); return; }
    const near = (d.strikes || []).filter(s => s.mi <= RADIUS_MI);
    const patch = { ok: true, checkedAt: Date.now() };
    if (near.length) {
      const newest = near[0];                                   // newest first
      const recent = near.filter(s => s.t >= newest.t - 5 * 60 * 1000);
      const closest = recent.reduce((a, b) => (b.mi < a.mi ? b : a));
      const prev = state.last && Date.now() - state.last.t < HOLD_MS ? state.last : null;
      if (!prev || newest.t > prev.t) {
        const last = { t: newest.t, mi: closest.mi, brg: closest.brg, count: near.length };
        patch.last = last;
        try { localStorage.setItem(KEY, JSON.stringify(last)); } catch { /* private mode */ }
        // Buzz and pop the banner open on the first strike, or when it's 3+ miles closer than before
        if (!prev || closest.mi <= prev.mi - 3) {
          patch.alertAt = Date.now();
          try { navigator.vibrate?.([300, 120, 300, 120, 300]); } catch { /* not supported (iPhone) */ }
        }
      }
    }
    set(patch);
  } catch {
    set({ ok: false, checkedAt: Date.now() });
  }
}

function start() {
  if (timer) return;
  poll();
  timer = setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
}
function stop() {
  clearInterval(timer); timer = 0;
  document.removeEventListener("visibilitychange", onVisible);
}
function onVisible() { if (!document.hidden) poll(); }

export function useLightning() {
  const [s, setS] = useState(state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onState = v => { setS(v); setNow(Date.now()); };
    subs.add(onState);
    start();
    const t = setInterval(() => setNow(Date.now()), 20 * 1000);    // keep "N min ago" current
    return () => { subs.delete(onState); clearInterval(t); if (!subs.size) stop(); };
  }, []);
  const active = !!(s.last && now - s.last.t < HOLD_MS);
  return { ...s, active, now };
}

export const minutesAgo = (t, now) => Math.max(0, Math.round((now - t) / 60000));
export const clearTime = (t) => new Date(t + HOLD_MS).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
