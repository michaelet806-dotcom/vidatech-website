/**
 * VidaTech contact form handler
 * - Validates submission (server-side + sanitization)
 * - Reserves the 30-minute slot in KV (prevents double-booking the same slot)
 * - Generates RFC 5545 .ics (line-folded, ICS-escaped, DST-aware America/Chicago)
 * - Sends two emails via Resend, lead-first with allSettled semantics
 *   1. Lead notification → vidaholdings@gmail.com (Michael's inbox)
 *   2. Welcome email   → customer
 *   Both attach the .ics — From and ORGANIZER align so Gmail auto-adds to calendar.
 *
 * Required Cloudflare Pages bindings / env vars:
 *   - RESEND_API_KEY        (secret)   Resend API key for transactional email.
 *   - TURNSTILE_SECRET_KEY  (secret)   Optional. If set, Turnstile token is required.
 *   - RATE_LIMIT            (KV)       Per-IP sliding-window rate limit. Fails open if absent.
 *   - SLOTS                 (KV)       Slot reservation store. Keys: `slot:YYYY-MM-DD:HH:MM`.
 *                                      Values: JSON { booked_at, email_hash, ip_hash }. TTL ~70 days.
 *                                      Fails open if absent so dev environments still work.
 *   - ADMIN_TOKEN           (secret)   Bearer token for /api/slots-release admin endpoint.
 */

const ORG_EMAIL = 'vidaholdings@gmail.com';
const ORG_NAME = 'VidaTech';
const SENDER_EMAIL = 'hello@vidatech.org';
const SENDER_FROM = `VidaTech <${SENDER_EMAIL}>`;
const DEMO_PHONE = '+18176234977';
const DEMO_PHONE_DISPLAY = '(817) 623-4977';
const MAILING_ADDR = 'Vida Tech LLC · 2000 E Lamar Blvd Ste 600 · Arlington, TX 76006 · United States';

const ALLOWED_ORIGINS = new Set(['https://vidatech.org', 'https://www.vidatech.org']);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://vidatech.org',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

/**
 * Per-IP sliding-window rate limit using Cloudflare KV namespace `RATE_LIMIT`.
 * Limits: 5 requests / 60s, 20 requests / 3600s. Fails open if KV not bound.
 */
async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT || !ip) return { ok: true };
  try {
    const minuteKey = `rl:${ip}:60s`;
    const hourKey = `rl:${ip}:3600s`;
    const [m, h] = await Promise.all([
      env.RATE_LIMIT.get(minuteKey),
      env.RATE_LIMIT.get(hourKey),
    ]);
    const mCount = Number(m || 0);
    const hCount = Number(h || 0);
    if (mCount >= 5) return { ok: false, reason: 'Too many requests in the last minute.', retryAfter: 60 };
    if (hCount >= 20) return { ok: false, reason: 'Too many requests in the last hour.', retryAfter: 3600 };
    // Increment counters with TTL; race-condition tolerated (this is a soft limit, not a security boundary).
    await Promise.all([
      env.RATE_LIMIT.put(minuteKey, String(mCount + 1), { expirationTtl: 60 }),
      env.RATE_LIMIT.put(hourKey, String(hCount + 1), { expirationTtl: 3600 }),
    ]);
    return { ok: true };
  } catch (e) {
    console.error('Rate limit check failed:', e.message);
    return { ok: true }; // fail open
  }
}

/**
 * Verify a Cloudflare Turnstile token. Returns true if valid, false otherwise.
 */
async function verifyTurnstile(secret, token, ip) {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!r.ok) return false;
    const data = await r.json();
    return data && data.success === true;
  } catch (e) {
    console.error('Turnstile verify failed:', e.message);
    return false;
  }
}

/**
 * SHA-256 hex digest (Workers Runtime crypto.subtle). Used to keep raw PII
 * (email, IP) out of the SLOTS KV namespace.
 */
async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * Build the slot key from a validated date ("YYYY-MM-DD") and time ("HH:MM").
 */
function slotKey(date, time) {
  return `slot:${date}:${time}`;
}

/**
 * Check-and-reserve a 30-minute slot in KV.
 *   - If `env.SLOTS` is not bound: fail OPEN (warn + return ok) so dev works.
 *   - If the slot key already exists: return { ok: false, taken: true }.
 *   - Otherwise PUT the slot key with TTL ~70 days and return { ok: true }.
 *
 * Note: Cloudflare KV is eventually consistent. This is a soft guard — a
 * sub-second double-write race is possible, but in practice the window for
 * two leads hitting the exact same slot within ms is negligible, and the
 * downstream Gmail dedupe (per-UID ATTENDEE) catches the rest.
 */
async function reserveSlot(env, date, time, emailHash, ipHash) {
  if (!env.SLOTS) {
    console.warn('SLOTS KV not bound — slot guard disabled (dev mode).');
    return { ok: true, skipped: true };
  }
  const key = slotKey(date, time);
  try {
    const existing = await env.SLOTS.get(key);
    if (existing) return { ok: false, taken: true };
    const value = JSON.stringify({
      booked_at: new Date().toISOString(),
      email_hash: emailHash,
      ip_hash: ipHash || null,
    });
    // ~70 days TTL: covers the 60-day booking horizon plus ~10 days of grace
    // so a reschedule can't accidentally land on a stale-but-honored slot.
    await env.SLOTS.put(key, value, { expirationTtl: 70 * 24 * 60 * 60 });
    return { ok: true };
  } catch (e) {
    console.error('Slot reserve failed:', e.message);
    // Fail open: don't block a real lead on infra hiccups. Michael can
    // double-book worst case; he'd rather have the lead than lose it.
    return { ok: true, error: true };
  }
}

export async function onRequestPost(context) {
  const origin = context.request.headers.get('Origin') || '';
  const cors = corsHeaders(origin);

  // Reject non-JSON or oversized bodies before parsing
  const ct = context.request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return json({ error: 'Bad request.' }, 400, cors);
  const cl = Number(context.request.headers.get('Content-Length') || 0);
  if (cl > 16 * 1024) return json({ error: 'Payload too large.' }, 413, cors);

  // Per-IP rate limit (Cloudflare KV-backed). Fails open if KV is not configured.
  const ip = context.request.headers.get('CF-Connecting-IP') || '';
  const rl = await checkRateLimit(context.env, ip);
  if (!rl.ok) {
    return json({ error: rl.reason || 'Too many requests. Please try again later.' }, 429, {
      ...cors,
      'Retry-After': String(rl.retryAfter || 60),
    });
  }

  let raw;
  try { raw = await context.request.json(); }
  catch { return json({ error: 'Bad request.' }, 400, cors); }

  // Turnstile verification — fails open if TURNSTILE_SECRET_KEY is not set, fails closed otherwise.
  if (context.env.TURNSTILE_SECRET_KEY) {
    const token = clean(raw.turnstile_token, 2048);
    if (!token) return json({ error: 'Bot-check token missing. Please refresh and try again.' }, 400, cors);
    const ok = await verifyTurnstile(context.env.TURNSTILE_SECRET_KEY, token, ip);
    if (!ok) return json({ error: 'Bot-check failed. Please refresh and try again.' }, 403, cors);
  }

  // Strip control chars (CRLF injection defense) and cap lengths
  const name     = clean(raw.name, 120);
  const email    = clean(raw.email, 200).toLowerCase();
  const phone    = clean(raw.phone, 40);
  const business = clean(raw.business, 200);
  const type     = clean(raw.type, 80);
  const size     = clean(raw.size, 40);
  const date     = clean(raw.date, 10);
  const time     = clean(raw.time, 5);
  const message  = clean(raw.message, 2000);

  // Required + format validation
  if (!name || !email || !date || !time) {
    return json({ error: 'Name, email, preferred date, and time are required.' }, 400, cors);
  }
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(email)) {
    return json({ error: 'Email looks invalid.' }, 400, cors);
  }
  if (phone && !/^[+\d\s().-]{7,40}$/.test(phone)) {
    return json({ error: 'Phone looks invalid.' }, 400, cors);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return json({ error: 'Date or time format is invalid.' }, 400, cors);
  }
  const start = parseLocalCT(date, time);
  if (!start) return json({ error: 'Date or time is invalid.' }, 400, cors);
  const nowMs = Date.now();
  if (start.utcMs <= nowMs) {
    return json({ error: 'Pick a future date and time.' }, 400, cors);
  }
  if (start.utcMs > nowMs + 60 * 24 * 60 * 60 * 1000) {
    return json({ error: 'Bookings limited to 60 days out.' }, 400, cors);
  }
  // No Saturday/Sunday — JS Day in UTC for the picked wall-time
  const localDow = new Date(start.utcMs - start.offsetMs).getUTCDay();
  if (localDow === 0 || localDow === 6) {
    return json({ error: 'Weekdays only.' }, 400, cors);
  }
  // Time-of-day window 09:00–17:00 CT
  const [hh, mm] = time.split(':').map(Number);
  const minutesOfDay = hh * 60 + mm;
  if (minutesOfDay < 9 * 60 || minutesOfDay + 30 > 17 * 60) {
    return json({ error: 'Pick a slot between 9:00 AM and 4:30 PM CT.' }, 400, cors);
  }
  // Enforce 30-minute alignment so two requests can't book :15 and :30 etc.
  if (mm % 30 !== 0) {
    return json({ error: 'Slots are every 30 minutes — pick :00 or :30.' }, 400, cors);
  }

  // ── Slot reservation guard ──────────────────────────────────────────────
  // After ALL validation passes, before we generate the .ics or send mail,
  // check-and-reserve the slot in KV. Hashes keep raw email/IP out of KV.
  const emailHash = await sha256Hex(email);
  const ipHash = ip ? await sha256Hex(ip) : '';
  const reservation = await reserveSlot(context.env, date, time, emailHash, ipHash);
  if (!reservation.ok && reservation.taken) {
    return json({ error: 'That slot is already booked. Please pick another.' }, 409, cors);
  }
  // Note: if Resend fails below, we intentionally do NOT release the slot.
  // Michael may still want to honor a booking that triggered an outbound
  // email failure, and a lead retrying will see "already booked" with the
  // same (email,date,time) — they can email michael directly. Better than
  // losing the slot to a race.

  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY missing in env.');
    return json({ error: 'Mail service unavailable. Try again or call ' + DEMO_PHONE_DISPLAY }, 503, cors);
  }

  const eventUid = stableUid(email, date, time);
  const ics = buildICS({ name, email, phone, business, type, size, date, time, message, start, uid: eventUid });
  const icsB64 = base64encode(ics);
  const summary = `VidaTech intro call — ${name}${business ? ' · ' + business : ''}`;

  // List-Unsubscribe header — even transactional benefits for inbox placement
  const unsubscribeHeaders = {
    'List-Unsubscribe': `<mailto:${ORG_EMAIL}?subject=unsubscribe>, <https://vidatech.org/api/unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  const customerSubject = `Your VidaTech intro call is booked — ${formatHuman(date, time)}`;
  const leadSubject = `New lead booked: ${name}${business ? ' · ' + business : ''} — ${formatHuman(date, time)}`;

  // Send LEAD first (Michael must know even if customer email fails)
  // Then welcome — allSettled so neither blocks the other
  const leadReq = sendEmail(apiKey, {
    from: SENDER_FROM,
    to: [ORG_EMAIL],
    subject: leadSubject,
    html: leadHtml({ name, email, phone, business, type, size, date, time, message }),
    reply_to: email,
    headers: unsubscribeHeaders,
    attachments: [{ filename: 'vidatech-intro-call.ics', content: icsB64, content_type: 'text/calendar; method=REQUEST; charset=UTF-8' }],
  }, eventUid);

  const welcomeReq = sendEmail(apiKey, {
    from: SENDER_FROM,
    to: [email],
    subject: customerSubject,
    html: welcomeHtml({ name, business, date, time }),
    reply_to: ORG_EMAIL,
    headers: unsubscribeHeaders,
    attachments: [{ filename: 'vidatech-intro-call.ics', content: icsB64, content_type: 'text/calendar; method=REQUEST; charset=UTF-8' }],
  }, eventUid + '-welcome');

  const [leadResult, welcomeResult] = await Promise.allSettled([leadReq, welcomeReq]);

  const leadOk = leadResult.status === 'fulfilled' && leadResult.value.ok;
  const welcomeOk = welcomeResult.status === 'fulfilled' && welcomeResult.value.ok;

  if (!leadOk) {
    // The critical email failed — return error so the user retries
    const detail = leadResult.status === 'rejected'
      ? leadResult.reason?.message || 'network'
      : `status=${leadResult.value.status}`;
    console.error('Lead email failed:', detail);
    return json({ error: 'Could not record your booking. Please try again or call ' + DEMO_PHONE_DISPLAY }, 502, cors);
  }
  if (!welcomeOk) {
    // Lead got through, customer welcome didn't — still a success from Michael's POV
    console.error('Welcome email failed (lead succeeded):',
      welcomeResult.status === 'rejected' ? welcomeResult.reason?.message : welcomeResult.value.status);
    return json({ ok: true, partial: 'welcome_email_pending', scheduled: { date, time } }, 200, cors);
  }
  return json({ ok: true, scheduled: { date, time }, summary }, 200, cors);
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/* ───────── helpers ───────── */

function clean(v, max) {
  return String(v ?? '')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function sendEmail(apiKey, payload, idempotencyKey) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

function stableUid(email, date, time) {
  // Stable per (email, date, time) so resubmits update instead of duplicating
  const seed = `${email}|${date}|${time}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) hash = ((hash * 33) ^ seed.charCodeAt(i)) >>> 0;
  return `vidatech-${hash.toString(36)}-${date.replace(/-/g, '')}${time.replace(':', '')}@vidatech.org`;
}

/* Parse "YYYY-MM-DD" + "HH:MM" as US Central wall-time → UTC ms */
function parseLocalCT(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !m || !d || isNaN(hh) || isNaN(mm)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  // Round-trip validation: build the date and confirm components match exactly
  // (catches Feb 30, Apr 31, etc. which Date.UTC would silently roll forward)
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  // US DST: 2nd Sun Mar 02:00 → 1st Sun Nov 02:00 → offset = -5 (CDT), else -6 (CST)
  const offsetHours = isCDT(y, m, d) ? 5 : 6;
  const utcMs = Date.UTC(y, m - 1, d, hh + offsetHours, mm);
  return { utcMs, offsetMs: offsetHours * 60 * 60 * 1000 };
}
function isCDT(y, m, d) {
  // 2nd Sunday of March
  const marStart = new Date(Date.UTC(y, 2, 1));
  const marSun2 = 1 + ((7 - marStart.getUTCDay()) % 7) + 7;
  // 1st Sunday of November
  const novStart = new Date(Date.UTC(y, 10, 1));
  const novSun1 = 1 + ((7 - novStart.getUTCDay()) % 7);
  const dateNum = m * 100 + d;
  if (dateNum < 3 * 100 + marSun2) return false;
  if (dateNum >= 11 * 100 + novSun1) return false;
  return true;
}

/* ─── RFC 5545 .ics builder ─── */
function buildICS({ name, email, phone, business, type, size, date, time, message, start, uid }) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');

  // End = start + 30 min (use Date.UTC arithmetic so day/month rolls properly)
  const endUtc = new Date(start.utcMs + 30 * 60 * 1000);
  // Re-derive local CT wall time for end (offset same as start unless we cross DST mid-event — rare for 30 min)
  const endLocal = new Date(endUtc.getTime() - start.offsetMs);
  const endStamp =
    endLocal.getUTCFullYear() + pad(endLocal.getUTCMonth() + 1) + pad(endLocal.getUTCDate()) +
    'T' + pad(endLocal.getUTCHours()) + pad(endLocal.getUTCMinutes()) + '00';

  const startStamp = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;

  const now = new Date();
  const utcStamp =
    now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) +
    'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

  const cn = icsCN(name);
  const safeName = icsEsc(name);
  const safeBiz = business ? icsEsc(business) : '';

  // DESCRIPTION uses real \n in the JS string — icsEsc converts to literal \\n per spec
  const descRaw = [
    'VidaTech 30-minute intro call.',
    '',
    `Attendee: ${name}${business ? ' (' + business + ')' : ''}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : '',
    type ? `Type of business: ${type}` : '',
    size ? `Team size: ${size}` : '',
    '',
    message ? `What is bleeding the most:\n${message}` : '',
    '',
    `Demo line (24/7 AI receptionist): ${DEMO_PHONE_DISPLAY}`,
    'Booked via https://vidatech.org',
  ].filter(s => s !== null && s !== undefined).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VidaTech//AXIS-OS Booking//EN',
    'METHOD:REQUEST',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'X-LIC-LOCATION:America/Chicago',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp}`,
    `DTSTART;TZID=America/Chicago:${startStamp}`,
    `DTEND;TZID=America/Chicago:${endStamp}`,
    `SUMMARY:VidaTech intro call — ${safeName}${safeBiz ? ' · ' + safeBiz : ''}`,
    `DESCRIPTION:${icsEsc(descRaw)}`,
    `LOCATION:Phone or video — link sent before the call`,
    // From == ORGANIZER (both hello@vidatech.org) so Gmail auto-adds for the recipient ATTENDEE
    `ORGANIZER;CN=${icsCN(ORG_NAME)}:mailto:${SENDER_EMAIL}`,
    `ATTENDEE;CN=${cn};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${email}`,
    `ATTENDEE;CN="Michael Torres";RSVP=TRUE;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:${ORG_EMAIL}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:VidaTech intro call in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n');
}

/* RFC 5545 §3.1 line folding — 75 octets max, continuation lines start with single space */
function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  // Walk byte boundaries to chunk safely under 75 (use 73 to leave room for CRLF+space prefix)
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const out = [];
  let i = 0;
  let first = true;
  const limit = 75;
  while (i < bytes.length) {
    const target = first ? limit : limit - 1; // continuation has leading space → effective payload 74
    let take = Math.min(target, bytes.length - i);
    // Avoid splitting multi-byte UTF-8 sequences: back off until a leading-byte boundary
    while (take > 0) {
      const byte = bytes[i + take];
      if (byte === undefined || (byte & 0xC0) !== 0x80) break;
      take--;
    }
    if (take <= 0) take = bytes.length - i; // last resort
    out.push(decoder.decode(bytes.subarray(i, i + take)));
    i += take;
    first = false;
  }
  return out.join('\r\n ');
}

function icsEsc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/* CN param value: DQUOTE-wrap if it contains , ; or : per RFC 5545 §3.3.11 */
function icsCN(s) {
  const safe = String(s).replace(/"/g, '');
  return /[,;:]/.test(safe) ? `"${safe}"` : safe;
}

function base64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function formatHuman(date, time) {
  try {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = days[dt.getUTCDay()];
    const [hh, mm] = time.split(':').map(Number);
    const period = hh >= 12 ? 'PM' : 'AM';
    const h12 = ((hh + 11) % 12) + 1;
    return `${dow}, ${months[m - 1]} ${d} · ${h12}:${String(mm).padStart(2, '0')} ${period} CT`;
  } catch { return `${date} at ${time} CT`; }
}

/* ─── Customer welcome email (Outlook-safe, dark) ─── */
function welcomeHtml({ name, business, date, time }) {
  const when = formatHuman(date, time);
  const firstName = name.split(/\s+/)[0];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>Your VidaTech intro call is booked</title>
</head>
<body style="margin:0;padding:0;background:#0A0B0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#E8ECEF">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0B0D" style="background:#0A0B0D;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#111316" style="max-width:600px;width:100%;background:#111316;border:1px solid #1F2328;border-radius:12px">

        <tr><td style="padding:28px 28px 12px;border-bottom:1px solid #1F2328">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td bgcolor="#C6FF3D" width="14" height="14" style="background:#C6FF3D;width:14px;height:14px;line-height:14px;border-radius:3px">&nbsp;</td>
            <td style="padding-left:10px;font-weight:600;font-size:18px;color:#E8ECEF;letter-spacing:-0.01em">Vida<span style="color:#7A8189">·</span>Tech</td>
          </tr></table>
          <div style="margin-top:20px;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;letter-spacing:0.14em;color:#7A8189;text-transform:uppercase">// 01 &mdash; welcome aboard</div>
        </td></tr>

        <tr><td style="padding:24px 28px">
          <h1 style="margin:0 0 16px;font-size:28px;font-weight:500;letter-spacing:-0.025em;color:#E8ECEF;line-height:1.18">
            ${escHtml(firstName)} &mdash; <span style="color:#C6FF3D !important;font-style:italic">you&rsquo;re on the calendar.</span>
          </h1>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#B5BAC0">
            Thanks for reaching out to VidaTech${business ? ' from <strong style="color:#E8ECEF">' + escHtml(business) + '</strong>' : ''}. A 30-minute intro call has been scheduled and a calendar invite is attached &mdash; open it on phone or laptop and it&rsquo;ll drop onto your calendar.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0B0D" style="margin:20px 0;background:#0A0B0D;border:1px solid #1F2328;border-radius:8px">
            <tr><td style="padding:16px 20px">
              <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:6px">Your call</div>
              <div style="font-size:20px;font-weight:600;color:#C6FF3D !important;letter-spacing:-0.01em">${escHtml(when)}</div>
              <div style="margin-top:4px;font-size:13px;color:#7A8189">30 minutes &middot; phone or video (link the morning of)</div>
            </td></tr>
          </table>

          <h2 style="margin:24px 0 12px;font-size:15px;font-weight:600;color:#E8ECEF">What we&rsquo;ll cover</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${bulletRow('The 3&ndash;5 roles you&rsquo;re currently doing that you shouldn&rsquo;t be')}
            ${bulletRow('Which of our 15 departments (plus the AI receptionist) would have caught your last 5 hardest weeks')}
            ${bulletRow('A live look at AXIS&middot;OS running against your real org chart')}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F1408" style="margin:24px 0 8px;background:#0F1408;border:1px solid #2A3318;border-radius:8px">
            <tr><td style="padding:16px 20px">
              <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:4px">While you wait &mdash; call our AI receptionist</div>
              <a href="tel:${DEMO_PHONE}" style="font-size:22px;font-weight:600;color:#C6FF3D !important;text-decoration:none;letter-spacing:-0.01em">${DEMO_PHONE_DISPLAY}</a>
              <div style="margin-top:4px;font-size:12px;color:#7A8189">Hear it answer right now. 24/7. The same one we&rsquo;ll put on your line.</div>
            </td></tr>
          </table>

          <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#B5BAC0">I&rsquo;ll send the video link the morning of. Need to reschedule? Just reply to this email.</p>
          <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#B5BAC0">See you soon,<br><span style="color:#E8ECEF;font-weight:500">Michael &middot; VidaTech</span></p>
        </td></tr>

        <tr><td bgcolor="#0A0B0D" style="padding:18px 28px;background:#0A0B0D;border-top:1px solid #1F2328;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;color:#7A8189;letter-spacing:0.04em;line-height:1.6">
          ${escHtml(MAILING_ADDR)}<br>
          <a href="https://vidatech.org" style="color:#7A8189;text-decoration:underline">vidatech.org</a> &middot; ${DEMO_PHONE_DISPLAY} &middot; ${ORG_EMAIL}<br>
          You&rsquo;re receiving this because you booked a call at vidatech.org.
          <a href="https://vidatech.org/unsubscribe" style="color:#7A8189;text-decoration:underline">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* Outlook-safe bullet row: 2-col table, bgcolor TD as dot */
function bulletRow(text) {
  return `<tr><td style="padding:8px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="14" style="padding-top:7px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td bgcolor="#C6FF3D" width="6" height="6" style="background:#C6FF3D;width:6px;height:6px;line-height:6px;font-size:6px;border-radius:50%">&nbsp;</td>
        </tr></table>
      </td>
      <td style="font-size:14px;line-height:1.55;color:#B5BAC0">${text}</td>
    </tr></table>
  </td></tr>`;
}

/* ─── Lead notification email ─── */
function leadHtml({ name, email, phone, business, type, size, date, time, message }) {
  const when = formatHuman(date, time);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>New lead booked</title>
</head>
<body style="margin:0;padding:0;background:#0A0B0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#E8ECEF">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0B0D" style="background:#0A0B0D;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#111316" style="max-width:600px;width:100%;background:#111316;border:1px solid #1F2328;border-radius:12px">

        <tr><td style="padding:24px 28px 12px;border-bottom:1px solid #1F2328">
          <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;letter-spacing:0.14em;color:#C6FF3D !important;text-transform:uppercase">// new lead &middot; booked</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:500;color:#E8ECEF;letter-spacing:-0.02em">${escHtml(name)}${business ? ' <span style="color:#7A8189;font-weight:400">&middot; ' + escHtml(business) + '</span>' : ''}</h1>
        </td></tr>

        <tr><td style="padding:20px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0B0D" style="background:#0A0B0D;border:1px solid #2A3318;border-radius:8px;margin-bottom:16px">
            <tr><td style="padding:14px 18px">
              <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:4px">Booked for</div>
              <div style="font-size:18px;font-weight:600;color:#C6FF3D !important">${escHtml(when)}</div>
              <div style="margin-top:4px;font-size:12px;color:#7A8189">30 min &middot; calendar invite attached</div>
            </td></tr>
          </table>

          ${(type || size) ? `<div style="margin:0 0 18px;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;color:#C6FF3D !important;letter-spacing:0.06em">[ ${escHtml(type || '—')} &middot; ${escHtml(size || '—')} ]</div>` : ''}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px">
            ${rowHtml('Name', escHtml(name))}
            ${rowHtml('Email', `<a href="mailto:${escHtml(email)}" style="color:#C6FF3D !important;text-decoration:none">${escHtml(email)}</a>`)}
            ${phone ? rowHtml('Phone', `<a href="tel:${escHtml(phone)}" style="color:#C6FF3D !important;text-decoration:none">${escHtml(phone)}</a>`) : ''}
            ${business ? rowHtml('Business', escHtml(business)) : ''}
          </table>

          ${message ? `
          <div style="margin-top:18px;padding:14px 18px;background:#0A0B0D;border-left:3px solid #C6FF3D;border-radius:6px">
            <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:6px">What is bleeding</div>
            <div style="font-size:14px;line-height:1.6;color:#E8ECEF;white-space:pre-wrap">${escHtml(message)}</div>
          </div>` : ''}

          <div style="margin-top:20px;font-size:12px;color:#7A8189">Reply directly to this email &mdash; routes to ${escHtml(email)}.</div>
        </td></tr>

        <tr><td bgcolor="#0A0B0D" style="padding:14px 28px;background:#0A0B0D;border-top:1px solid #1F2328;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;color:#4A4F57">Source: vidatech.org &middot; ${escHtml(MAILING_ADDR)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function rowHtml(k, v) {
  return `<tr>
    <td style="padding:9px 0;color:#7A8189;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;width:110px;border-bottom:1px solid #1F2328;vertical-align:top">${k}</td>
    <td style="padding:9px 0;color:#E8ECEF;border-bottom:1px solid #1F2328;vertical-align:top">${v}</td>
  </tr>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
