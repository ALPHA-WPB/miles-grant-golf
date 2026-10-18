import {
  CANONICAL_HOST, now, json, error, parseCookies, cookie, randomToken, sha256Hex,
  b64urlDecode, b64urlEncode, decodeJwtPayload, escapeHtml,
} from './util.js';

const SESSION_COOKIE = 'mgg_s';
const STATE_COOKIE = 'mgg_oauth';
const SESSION_DAYS = 90;

const callbackUrl = provider => `https://${CANONICAL_HOST}/api/auth/${provider}/callback`;

export async function getSessionUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`
  ).bind(await sha256Hex(token), now()).first();
  return row || null;
}

async function startSession(env, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(await sha256Hex(token), userId, expires).run();
  return cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
}

export async function signOut(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) });
}

// Apple posts the callback cross-site (form_post), so the state cookie must be SameSite=None.
function redirectWithState(url, state) {
  return new Response(null, {
    status: 302,
    headers: { location: url, 'set-cookie': cookie(STATE_COOKIE, state, { maxAge: 600, sameSite: 'None' }) },
  });
}

function stateMatches(request, state) {
  const expected = parseCookies(request)[STATE_COOKIE];
  return !!state && !!expected && state === expected;
}

function finish(sessionCookie) {
  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', sessionCookie);
  headers.append('set-cookie', cookie(STATE_COOKIE, '', { maxAge: 0, sameSite: 'None' }));
  return new Response(null, { status: 303, headers });
}

function loginFailed(message) {
  return new Response(
    `<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;background:#0a1c12;color:#f0ead6;padding:2rem">` +
    `<h2>Sign-in didn't finish</h2><p>${escapeHtml(message)}</p><p><a style="color:#d4af37" href="/">Back to Miles Grant Golf</a></p>`,
    { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

async function findOrCreateUser(env, ctx, { provider, sub, email, emailVerified, name, avatar }, onNewUser) {
  const linked = await env.DB.prepare(
    `SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_id = ?`
  ).bind(provider, sub).first();
  if (linked) {
    await env.DB.prepare(`UPDATE users SET updated_at = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?`)
      .bind(now(), avatar || null, linked.id).run();
    return linked;
  }

  const normalized = email?.toLowerCase().trim();
  if (normalized && emailVerified) {
    const existing = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(normalized).first();
    if (existing) {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO identities (provider, provider_id, user_id) VALUES (?, ?, ?)`).bind(provider, sub, existing.id),
        env.DB.prepare(`UPDATE users SET updated_at = ? WHERE id = ?`).bind(now(), existing.id),
      ]);
      return existing;
    }
  }

  if (!normalized) throw new Error('Your account did not share an email address.');
  const user = {
    id: crypto.randomUUID(),
    email: normalized,
    full_name: name || normalized.split('@')[0],
    avatar_url: avatar || null,
  };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, full_name, avatar_url) VALUES (?, ?, ?, ?)`)
      .bind(user.id, user.email, user.full_name, user.avatar_url),
    env.DB.prepare(`INSERT INTO identities (provider, provider_id, user_id) VALUES (?, ?, ?)`).bind(provider, sub, user.id),
  ]);
  ctx.waitUntil(onNewUser(user).catch(e => console.error('signup alert failed', e)));
  return user;
}

// ---- Google ----

export function googleStart(env) {
  const state = randomToken(16);
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl('google'),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return redirectWithState(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, state);
}

export async function googleCallback(request, env, ctx, onNewUser) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return loginFailed('Google sign-in was cancelled.');
  if (!stateMatches(request, url.searchParams.get('state'))) return loginFailed('Your sign-in link expired. Please try again.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl('google'),
      grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.id_token) return loginFailed('Google did not accept the sign-in.');

  // Token came straight from Google over TLS with our client secret, so claim checks suffice (OIDC Core 3.1.3.7).
  const p = decodeJwtPayload(tok.id_token);
  if (p.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss) || p.exp * 1000 < Date.now()) {
    return loginFailed('Google sign-in could not be verified.');
  }
  try {
    const user = await findOrCreateUser(env, ctx, {
      provider: 'google', sub: p.sub, email: p.email, emailVerified: p.email_verified === true || p.email_verified === 'true',
      name: p.name, avatar: p.picture,
    }, onNewUser);
    return finish(await startSession(env, user.id));
  } catch (e) {
    return loginFailed(e.message);
  }
}

// ---- Apple ----

async function appleClientSecret(env) {
  const header = { alg: 'ES256', kid: env.APPLE_KEY_ID };
  const iat = Math.floor(Date.now() / 1000);
  const payload = { iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_SERVICES_ID };
  const enc = o => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const input = `${enc(header)}.${enc(payload)}`;
  const pem = env.APPLE_PRIVATE_KEY.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', b64urlDecode(pem.replace(/\+/g, '-').replace(/\//g, '_')),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64urlEncode(sig)}`;
}

export function appleStart(env) {
  const state = randomToken(16);
  const q = new URLSearchParams({
    client_id: env.APPLE_SERVICES_ID,
    redirect_uri: callbackUrl('apple'),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });
  return redirectWithState(`https://appleid.apple.com/auth/authorize?${q}`, state);
}

export async function appleCallback(request, env, ctx, onNewUser) {
  const form = await request.formData();
  if (form.get('error')) return loginFailed('Apple sign-in was cancelled.');
  if (!stateMatches(request, form.get('state'))) return loginFailed('Your sign-in link expired. Please try again.');

  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_SERVICES_ID,
      client_secret: await appleClientSecret(env),
      code: form.get('code') || '',
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl('apple'),
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.id_token) return loginFailed('Apple did not accept the sign-in.');

  const p = decodeJwtPayload(tok.id_token);
  if (p.aud !== env.APPLE_SERVICES_ID || p.iss !== 'https://appleid.apple.com' || p.exp * 1000 < Date.now()) {
    return loginFailed('Apple sign-in could not be verified.');
  }
  // Apple sends the person's name only on the very first authorization, as a form field.
  let name;
  try {
    const u = JSON.parse(form.get('user') || '{}');
    name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ') || undefined;
  } catch { /* no name supplied */ }
  try {
    const user = await findOrCreateUser(env, ctx, {
      provider: 'apple', sub: p.sub, email: p.email, emailVerified: p.email_verified === true || p.email_verified === 'true',
      name,
    }, onNewUser);
    return finish(await startSession(env, user.id));
  } catch (e) {
    return loginFailed(e.message);
  }
}

export const unauthorized = () => error(401, 'Please sign in');
