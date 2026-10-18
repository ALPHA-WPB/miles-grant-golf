import { ADMIN_EMAILS, now, json, error } from './util.js';

const NINE = ['front9', 'back9', 'nine'];
const ROUND_TYPES = ['open', 'all18', 'front9', 'back9', 'nine', 'partial'];

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function genJoinCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export async function createRound(request, env, user) {
  const { teeSelection, roundType } = await readJson(request);
  const round = {
    id: crypto.randomUUID(),
    creator_id: user.id,
    join_code: genJoinCode(),
    round_type: ROUND_TYPES.includes(roundType) ? roundType : 'open',
    status: 'in_progress',
  };
  const rp = { id: crypto.randomUUID(), round_id: round.id, user_id: user.id, tee_selection: String(teeSelection || 'White').slice(0, 20) };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO rounds (id, creator_id, join_code, round_type, status) VALUES (?, ?, ?, ?, ?)`)
      .bind(round.id, round.creator_id, round.join_code, round.round_type, round.status),
    env.DB.prepare(`INSERT INTO round_players (id, round_id, user_id, tee_selection) VALUES (?, ?, ?, ?)`)
      .bind(rp.id, rp.round_id, rp.user_id, rp.tee_selection),
  ]);
  return json({
    round: await env.DB.prepare(`SELECT * FROM rounds WHERE id = ?`).bind(round.id).first(),
    roundPlayer: await env.DB.prepare(`SELECT * FROM round_players WHERE id = ?`).bind(rp.id).first(),
  });
}

export async function upsertScore(request, env, user) {
  const { roundPlayerId, holeNumber, strokes } = await readJson(request);
  const hole = Number(holeNumber), s = Number(strokes);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18 || !Number.isInteger(s) || s < 0 || s > 30) return error(400, 'Invalid score');
  const owns = await env.DB.prepare(`SELECT 1 FROM round_players WHERE id = ? AND user_id = ?`).bind(roundPlayerId, user.id).first();
  if (!owns) return error(403, 'Not your round');
  const t = now();
  await env.DB.prepare(
    `INSERT INTO scores (id, round_player_id, hole_number, strokes, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (round_player_id, hole_number) DO UPDATE SET strokes = excluded.strokes, updated_at = excluded.updated_at`
  ).bind(crypto.randomUUID(), roundPlayerId, hole, s, t).run();
  return json(await env.DB.prepare(`SELECT * FROM scores WHERE round_player_id = ? AND hole_number = ?`).bind(roundPlayerId, hole).first());
}

export async function finalizeRound(request, env, user, roundId) {
  const { roundType } = await readJson(request);
  const t = now();
  const type = ROUND_TYPES.includes(roundType) ? roundType : null;
  const r = await env.DB.prepare(
    `UPDATE rounds SET status = 'completed', end_time = ?, updated_at = ?, round_type = COALESCE(?, round_type)
     WHERE id = ? AND creator_id = ?`
  ).bind(t, t, type, roundId, user.id).run();
  if (!r.meta.changes) return error(404, 'Round not found');
  return json({ ok: true });
}

export async function roundHistory(env, user) {
  const { results } = await env.DB.prepare(
    `SELECT r.* FROM rounds r JOIN round_players rp ON rp.round_id = r.id
     WHERE rp.user_id = ? AND r.status = 'completed' ORDER BY r.end_time DESC LIMIT 20`
  ).bind(user.id).all();
  return json(results);
}

// Completed 18- and 9-hole rounds ranked separately; partial rounds are excluded so averages compare fairly.
export async function leaderboard(env) {
  const { results } = await env.DB.prepare(
    `SELECT rp.user_id, r.round_type, u.full_name, COALESCE(SUM(s.strokes), 0) AS strokes
     FROM round_players rp
     JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
     JOIN users u ON u.id = rp.user_id
     LEFT JOIN scores s ON s.round_player_id = rp.id
     GROUP BY rp.id`
  ).all();
  const groups = { eighteen: {}, nine: {} };
  for (const row of results) {
    const g = row.round_type === 'all18' ? groups.eighteen : NINE.includes(row.round_type) ? groups.nine : null;
    if (!g || !row.strokes) continue;
    const u = g[row.user_id] ||= { user_id: row.user_id, full_name: row.full_name || 'Golfer', rounds_played: 0, total_strokes: 0 };
    u.rounds_played++;
    u.total_strokes += row.strokes;
  }
  const rank = g => Object.values(g)
    .map(u => ({ ...u, avg_score: +(u.total_strokes / u.rounds_played).toFixed(1) }))
    .sort((a, b) => a.avg_score - b.avg_score);
  return json({ eighteen: rank(groups.eighteen), nine: rank(groups.nine) });
}

export async function adminUsers(env, user) {
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) return error(403, 'Admins only');
  const { results } = await env.DB.prepare(
    `SELECT id, full_name, email, created_at, updated_at FROM users ORDER BY created_at DESC`
  ).all();
  return json(results);
}
