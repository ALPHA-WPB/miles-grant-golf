// Pin (cup) positions: anyone can read them; only admins can set or reset one.
import { ADMIN_EMAILS, now, json, error } from './util.js';

// Loose box around Miles Grant, to reject anything obviously wrong (e.g. a save made from home)
const BOX = { s: 27.140, n: 27.156, w: -80.190, e: -80.166 };

const isAdmin = user => ADMIN_EMAILS.includes(String(user?.email || '').toLowerCase());

// Until the pins table exists (migrations/0002_pins.sql), everyone simply gets "no pins set"
const noTable = e => /no such table/i.test(String(e?.message || e));

export async function getPins(env) {
  try {
    const { results } = await env.DB.prepare(`SELECT hole, lat, lng, accuracy_m, set_at FROM pins ORDER BY hole`).all();
    return json({ pins: results });
  } catch (e) {
    if (noTable(e)) return json({ pins: [] });
    throw e;
  }
}

export async function setPin(request, env, user, hole) {
  if (!isAdmin(user)) return error(403, 'Admins only');
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const lat = Number(body.lat), lng = Number(body.lng);
  const acc = body.accuracy_m == null ? null : Number(body.accuracy_m);
  if (!(hole >= 1 && hole <= 18)) return error(400, 'Bad hole');
  if (!(lat > BOX.s && lat < BOX.n && lng > BOX.w && lng < BOX.e)) return error(400, "That spot isn't on the course");
  const setAt = typeof body.set_at === 'string' && !isNaN(Date.parse(body.set_at)) && Date.parse(body.set_at) <= Date.now() + 60000
    ? new Date(body.set_at).toISOString() : now();
  // A queued save from a phone that was offline must not overwrite a newer one
  try {
    await env.DB.prepare(
    `INSERT INTO pins (hole, lat, lng, accuracy_m, set_at, set_by) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(hole) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
       set_at = excluded.set_at, set_by = excluded.set_by WHERE excluded.set_at >= pins.set_at`
  ).bind(hole, lat, lng, isFinite(acc) ? acc : null, setAt, user.email).run();
  } catch (e) {
    if (noTable(e)) return error(503, 'Pin saving is not switched on yet');
    throw e;
  }
  return getPins(env);
}

export async function resetPin(env, user, hole) {
  if (!isAdmin(user)) return error(403, 'Admins only');
  try { await env.DB.prepare(`DELETE FROM pins WHERE hole = ?`).bind(hole).run(); } catch (e) { if (!noTable(e)) throw e; }
  return getPins(env);
}
