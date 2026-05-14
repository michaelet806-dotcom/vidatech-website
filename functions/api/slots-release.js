/**
 * VidaTech admin: release a reserved 30-minute booking slot.
 *
 * Use this when Michael needs to free a slot manually — for example, a lead
 * cancels via reply, or the contact form created a stale reservation that
 * should be opened back up.
 *
 * Required Cloudflare Pages bindings / env vars:
 *   - SLOTS        (KV)     Same namespace used by /api/contact. Keys are
 *                           `slot:YYYY-MM-DD:HH:MM`.
 *   - ADMIN_TOKEN  (secret) Bearer token. Request must send:
 *                             Authorization: Bearer <ADMIN_TOKEN>
 *
 * Usage:
 *   curl -X POST https://vidatech.org/api/slots-release \
 *     -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"date":"2026-05-20","time":"10:00"}'
 *
 * Responses:
 *   200 { ok: true, released: true,  key }   — slot existed and was deleted
 *   200 { ok: true, released: false, key }   — slot did not exist (idempotent)
 *   400 { error }                            — bad payload
 *   401 { error }                            — missing / wrong bearer token
 *   500 { error }                            — KV not bound or KV error
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Auth: require Bearer ADMIN_TOKEN, constant-time compare ──────────────
  const adminToken = env.ADMIN_TOKEN;
  if (!adminToken) {
    console.error('ADMIN_TOKEN not configured — refusing all releases.');
    return json({ error: 'Admin endpoint not configured.' }, 500);
  }
  const auth = request.headers.get('Authorization') || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || !timingSafeEqual(presented, adminToken)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  // ── KV binding ──────────────────────────────────────────────────────────
  if (!env.SLOTS) {
    return json({ error: 'SLOTS KV namespace not bound.' }, 500);
  }

  // ── Parse + validate payload ────────────────────────────────────────────
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return json({ error: 'Send application/json.' }, 400);
  }
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Bad JSON.' }, 400); }

  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return json({ error: 'Provide date "YYYY-MM-DD" and time "HH:MM".' }, 400);
  }

  const key = `slot:${date}:${time}`;
  try {
    const existing = await env.SLOTS.get(key);
    if (!existing) {
      // Idempotent: nothing to release, still a success.
      return json({ ok: true, released: false, key });
    }
    await env.SLOTS.delete(key);
    return json({ ok: true, released: true, key });
  } catch (e) {
    console.error('Slot release failed:', e.message);
    return json({ error: 'Release failed.' }, 500);
  }
}

export async function onRequestOptions() {
  // No CORS — this endpoint is intended for server-to-server / curl use,
  // not browser calls. Reject preflights explicitly.
  return new Response(null, { status: 405, headers: { 'Allow': 'POST' } });
}

/* ───────── helpers ───────── */

function clean(v, max) {
  return String(v ?? '')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Constant-time string compare. Avoids early-exit timing leaks that a naive
 * `===` would expose to a remote attacker probing the bearer token.
 */
function timingSafeEqual(a, b) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}
