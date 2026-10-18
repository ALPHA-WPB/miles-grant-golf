const FROM = 'Miles Grant Golf <alerts@milesgrant.golf>';

function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function notifySignup(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.WEBHOOK_SECRET || !secretsMatch(token, env.WEBHOOK_SECRET)) {
    return new Response('unauthorized', { status: 401 });
  }
  if (!env.ADMIN_EMAIL) return new Response('ADMIN_EMAIL not configured', { status: 500 });

  let payload;
  try { payload = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (payload?.type !== 'INSERT' || payload?.table !== 'users') return new Response('ignored', { status: 200 });

  const u = payload.record || {};
  const name = u.full_name || '(no name)';
  const when = u.created_at ? new Date(u.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '';

  await env.EMAIL.send({
    from: FROM,
    to: env.ADMIN_EMAIL,
    subject: `New member: ${name}`,
    text: `A new member signed up for Miles Grant Golf.\n\nName: ${name}\nEmail: ${u.email || ''}\nWhen: ${when}\nUser ID: ${u.id || ''}`,
    html: `<p>A new member signed up for <strong>Miles Grant Golf</strong>.</p>
<table style="border-collapse:collapse;font-family:sans-serif">
<tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td>${escapeHtml(name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td>${escapeHtml(u.email)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">When</td><td>${escapeHtml(when)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">User ID</td><td style="font-family:monospace">${escapeHtml(u.id)}</td></tr>
</table>`,
  });

  return new Response('ok', { status: 200 });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/notify-signup') {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      return notifySignup(request, env);
    }
    if (pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
