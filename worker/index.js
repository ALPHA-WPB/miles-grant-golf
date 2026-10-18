import { CANONICAL_HOST, json, error, escapeHtml } from './util.js';
import { getSessionUser, signOut, googleStart, googleCallback, appleStart, appleCallback, unauthorized } from './auth.js';
import { createRound, upsertScore, finalizeRound, roundHistory, leaderboard, adminUsers } from './api.js';

const ALERT_FROM = 'Miles Grant Golf <alerts@milesgrant.golf>';

function signupAlert(env) {
  return async user => {
    if (!env.ADMIN_EMAIL) return;
    const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    await env.EMAIL.send({
      from: ALERT_FROM,
      to: env.ADMIN_EMAIL,
      subject: `New member: ${user.full_name}`,
      text: `A new member signed up for Miles Grant Golf.\n\nName: ${user.full_name}\nEmail: ${user.email}\nWhen: ${when}`,
      html: `<p>A new member signed up for <strong>Miles Grant Golf</strong>.</p>
<table style="border-collapse:collapse;font-family:sans-serif">
<tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td>${escapeHtml(user.full_name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td>${escapeHtml(user.email)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">When</td><td>${escapeHtml(when)}</td></tr>
</table>`,
    });
  };
}

async function handleApi(request, env, ctx, url) {
  const { pathname: p } = url;
  const m = request.method;

  if (p === '/api/auth/google' && m === 'GET') return googleStart(env);
  if (p === '/api/auth/google/callback' && m === 'GET') return googleCallback(request, env, ctx, signupAlert(env));
  if (p === '/api/auth/apple' && m === 'GET') return appleStart(env);
  if (p === '/api/auth/apple/callback' && m === 'POST') return appleCallback(request, env, ctx, signupAlert(env));
  if (p === '/api/auth/signout' && m === 'POST') return signOut(request, env);
  if (p === '/api/leaderboard' && m === 'GET') return leaderboard(env);

  const user = await getSessionUser(request, env);
  if (p === '/api/me' && m === 'GET') return json({ user });
  if (!user) return unauthorized();

  if (p === '/api/rounds' && m === 'POST') return createRound(request, env, user);
  if (p === '/api/rounds/history' && m === 'GET') return roundHistory(env, user);
  if (p === '/api/scores' && m === 'PUT') return upsertScore(request, env, user);
  const fin = p.match(/^\/api\/rounds\/([0-9a-f-]{36})\/finalize$/);
  if (fin && m === 'POST') return finalizeRound(request, env, user, fin[1]);
  if (p === '/api/admin/users' && m === 'GET') return adminUsers(env, user);

  return error(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only "/" and "/api/*" reach this script (see run_worker_first); send other hostnames to the canonical one.
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!local && url.hostname !== CANONICAL_HOST && url.pathname === '/') {
      return Response.redirect(`https://${CANONICAL_HOST}/${url.search}`, 301);
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (e) {
        console.error(e);
        return error(500, 'Something went wrong');
      }
    }
    return env.ASSETS.fetch(request);
  },
};
