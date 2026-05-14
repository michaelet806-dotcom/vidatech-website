/**
 * VidaTech contact form handler
 * - Validates submission
 * - Generates an .ics calendar invite (30-min intro call)
 * - Sends two emails via Resend:
 *   1. Welcome message + invite to the customer
 *   2. Lead notification + invite to Michael (vidaholdings@gmail.com)
 *     → Gmail auto-detects the .ics and adds the event to his Google Calendar
 */

const ORG_EMAIL = 'vidaholdings@gmail.com';
const ORG_NAME = 'VidaTech';
const ORG_FROM = 'VidaTech <hello@vidatech.org>';
const DEMO_PHONE = '+18176234977';

const cors = {
  'Access-Control-Allow-Origin': 'https://vidatech.org',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const name = (data.name || '').toString().trim().slice(0, 120);
    const email = (data.email || '').toString().trim().slice(0, 200);
    const phone = (data.phone || '').toString().trim().slice(0, 40);
    const business = (data.business || '').toString().trim().slice(0, 200);
    const type = (data.type || '').toString().trim().slice(0, 80);
    const size = (data.size || '').toString().trim().slice(0, 40);
    const date = (data.date || '').toString().trim().slice(0, 10);   // YYYY-MM-DD
    const time = (data.time || '').toString().trim().slice(0, 5);    // HH:MM
    const message = (data.message || '').toString().trim().slice(0, 2000);

    if (!name || !email || !date || !time) {
      return json({ error: 'Name, email, preferred date, and time are required.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email looks invalid.' }, 400);
    }

    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) return json({ error: 'Mail service not configured.' }, 500);

    const ics = buildICS({ name, email, phone, business, type, size, date, time, message });
    const icsB64 = base64encode(ics);

    const customerHtml = welcomeHtml({ name, business, date, time, phone });
    const leadHtml = leadHtml_({ name, email, phone, business, type, size, date, time, message });

    const summary = `VidaTech intro call — ${name}${business ? ' · ' + business : ''}`;

    // 1. Welcome email + invite to customer
    const r1 = await sendEmail(apiKey, {
      from: ORG_FROM,
      to: [email],
      subject: `Welcome to VidaTech — your intro call is booked`,
      html: customerHtml,
      reply_to: ORG_EMAIL,
      attachments: [{
        filename: 'vidatech-intro-call.ics',
        content: icsB64,
      }],
    });

    // 2. Lead notification + invite to Michael (Gmail auto-detects .ics → Google Calendar)
    const r2 = await sendEmail(apiKey, {
      from: ORG_FROM,
      to: [ORG_EMAIL],
      subject: `📅 New lead booked: ${name}${business ? ' · ' + business : ''} — ${formatHuman(date, time)}`,
      html: leadHtml,
      reply_to: email,
      attachments: [{
        filename: 'vidatech-intro-call.ics',
        content: icsB64,
      }],
    });

    if (!r1.ok || !r2.ok) {
      const err1 = !r1.ok ? await r1.text() : '';
      const err2 = !r2.ok ? await r2.text() : '';
      return json({ error: `Mail send failed: ${err1} ${err2}` }, 502);
    }

    return json({ ok: true, scheduled: { date, time }, summary }, 200);
  } catch (e) {
    return json({ error: e.message || 'Unexpected error' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

/* ───────────── helpers ───────────── */

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function sendEmail(apiKey, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

/* ── .ics generator ── */
function buildICS({ name, email, phone, business, type, size, date, time, message }) {
  // Customer-picked date/time interpreted in US Central Time
  // Convert to UTC by offsetting +5h (CDT) or +6h (CST); using -05:00 wallclock + UTC offset baked into floating time + TZID.
  // Cloudflare Workers don't have full ICU; we'll emit DTSTART with TZID America/Chicago and a VTIMEZONE block.
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (Y, M, D, H, Mi) => `${Y}${pad(M)}${pad(D)}T${pad(H)}${pad(Mi)}00`;

  const startStamp = fmt(y, m, d, hh, mm);
  // +30 minutes
  let endH = hh, endM = mm + 30;
  if (endM >= 60) { endH += 1; endM -= 60; }
  const endStamp = fmt(y, m, d, endH, endM);

  // DTSTAMP in UTC
  const now = new Date();
  const utcStamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T'
    + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

  const uid = `vidatech-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}@vidatech.org`;
  const safeName = icsEsc(name);
  const safeBiz = business ? icsEsc(business) : '';

  const description = [
    `VidaTech 30-minute intro call.`,
    ``,
    `Attendee: ${name}${business ? ' (' + business + ')' : ''}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : '',
    type ? `Type of business: ${type}` : '',
    size ? `Team size: ${size}` : '',
    ``,
    message ? `What's bleeding the most:\n${message}` : '',
    ``,
    `Demo line (24/7 AI receptionist): ${DEMO_PHONE}`,
    `Booked via https://vidatech.org`,
  ].filter(Boolean).join('\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VidaTech//AXIS-OS Booking//EN',
    'METHOD:REQUEST',
    'CALSCALE:GREGORIAN',
    // VTIMEZONE — America/Chicago, DST-aware (RFC 5545 sample)
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
    `DESCRIPTION:${description}`,
    `LOCATION:Phone / video — link will be sent before the call`,
    `ORGANIZER;CN=${icsEsc(ORG_NAME)}:mailto:${ORG_EMAIL}`,
    `ATTENDEE;CN=${safeName};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${email}`,
    `ATTENDEE;CN=Michael Torres;RSVP=TRUE;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:${ORG_EMAIL}`,
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
  return lines.join('\r\n');
}

function icsEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function base64encode(str) {
  // Workers have btoa; encode UTF-8 safely
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

/* ── Customer welcome email ── */
function welcomeHtml({ name, business, date, time, phone }) {
  const when = formatHuman(date, time);
  const firstName = name.split(/\s+/)[0];
  return `<!doctype html>
<html><body style="margin:0;background:#0A0B0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#E8ECEF">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111316;border:1px solid #1F2328;border-radius:12px;overflow:hidden">

        <!-- header -->
        <tr><td style="padding:32px 32px 16px;border-bottom:1px solid #1F2328">
          <div style="display:inline-block;width:14px;height:14px;background:#C6FF3D;border-radius:3px;vertical-align:middle;margin-right:10px"></div>
          <span style="font-weight:600;font-size:18px;color:#E8ECEF;letter-spacing:-0.01em;vertical-align:middle">Vida<span style="color:#7A8189">·</span>Tech</span>
          <div style="margin-top:24px;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;letter-spacing:0.14em;color:#7A8189;text-transform:uppercase">// 01 — welcome aboard</div>
        </td></tr>

        <!-- body -->
        <tr><td style="padding:28px 32px">
          <h1 style="margin:0 0 18px;font-size:30px;font-weight:500;letter-spacing:-0.025em;color:#E8ECEF;line-height:1.15">
            Hey ${escHtml(firstName)} — <span style="color:#C6FF3D;font-style:italic">your call is booked.</span>
          </h1>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#B5BAC0">
            Thanks for reaching out to VidaTech. A 30-minute intro call has been scheduled${business ? ' for ' + escHtml(business) : ''}, and a calendar invite is attached to this email — open it on your phone or computer and it'll drop straight onto your calendar.
          </p>

          <!-- when -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#0A0B0D;border:1px solid #1F2328;border-radius:8px">
            <tr><td style="padding:18px 20px">
              <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:8px">Your call</div>
              <div style="font-size:20px;font-weight:600;color:#C6FF3D;letter-spacing:-0.01em">${when}</div>
              <div style="margin-top:4px;font-size:13px;color:#7A8189">30 minutes · phone or video (link before the call)</div>
            </td></tr>
          </table>

          <!-- what to expect -->
          <h2 style="margin:24px 0 12px;font-size:15px;font-weight:600;color:#E8ECEF">What we'll cover</h2>
          <ul style="margin:0 0 20px;padding:0;list-style:none">
            <li style="padding:10px 0 10px 22px;font-size:14px;line-height:1.55;color:#B5BAC0;border-bottom:1px solid #1F2328;position:relative">
              <span style="position:absolute;left:0;top:14px;width:6px;height:6px;background:#C6FF3D;border-radius:50%"></span>
              The 3–5 roles you're currently doing that you shouldn't be
            </li>
            <li style="padding:10px 0 10px 22px;font-size:14px;line-height:1.55;color:#B5BAC0;border-bottom:1px solid #1F2328;position:relative">
              <span style="position:absolute;left:0;top:14px;width:6px;height:6px;background:#C6FF3D;border-radius:50%"></span>
              Which of our 16 departments would have caught your last 5 hardest weeks
            </li>
            <li style="padding:10px 0 10px 22px;font-size:14px;line-height:1.55;color:#B5BAC0;position:relative">
              <span style="position:absolute;left:0;top:14px;width:6px;height:6px;background:#C6FF3D;border-radius:50%"></span>
              A live look at AXIS·OS running against your real org chart
            </li>
          </ul>

          <!-- demo line -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;background:linear-gradient(180deg, rgba(198,255,61,0.06), rgba(198,255,61,0.01));border:1px solid rgba(198,255,61,0.3);border-radius:8px">
            <tr><td style="padding:18px 20px">
              <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:6px">While you wait — call our AI receptionist</div>
              <a href="tel:${DEMO_PHONE}" style="font-size:22px;font-weight:600;color:#C6FF3D;text-decoration:none;letter-spacing:-0.01em">(817) 623-4977</a>
              <div style="margin-top:4px;font-size:12px;color:#7A8189">Hear it answer right now. 24/7. The same one we'll put on your line.</div>
            </td></tr>
          </table>

          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#B5BAC0">
            Need to reschedule? Just reply to this email — it goes straight to Michael.
          </p>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#B5BAC0">
            See you soon,<br>
            <span style="color:#E8ECEF;font-weight:500">Michael &middot; VidaTech</span>
          </p>
        </td></tr>

        <!-- footer -->
        <tr><td style="padding:24px 32px;background:#0A0B0D;border-top:1px solid #1F2328;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;color:#4A4F57;letter-spacing:0.04em">
          VidaTech · <a href="https://vidatech.org" style="color:#7A8189;text-decoration:none">vidatech.org</a> · ${DEMO_PHONE} · ${ORG_EMAIL}<br>
          You're getting this because you booked a call at vidatech.org.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ── Lead notification email (to Michael) ── */
function leadHtml_({ name, email, phone, business, type, size, date, time, message }) {
  const when = formatHuman(date, time);
  return `<!doctype html>
<html><body style="margin:0;background:#0A0B0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#E8ECEF">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111316;border:1px solid #1F2328;border-radius:12px;overflow:hidden">

        <tr><td style="padding:28px 32px 16px;border-bottom:1px solid #1F2328">
          <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;letter-spacing:0.14em;color:#C6FF3D;text-transform:uppercase">// new lead · booked</div>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:500;color:#E8ECEF;letter-spacing:-0.02em">${escHtml(name)}${business ? ' <span style="color:#7A8189;font-weight:400">· ' + escHtml(business) + '</span>' : ''}</h1>
        </td></tr>

        <tr><td style="padding:24px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;border:1px solid rgba(198,255,61,0.3);border-radius:8px;margin-bottom:24px">
            <tr><td style="padding:16px 20px">
              <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:6px">Booked for</div>
              <div style="font-size:18px;font-weight:600;color:#C6FF3D">${when}</div>
              <div style="margin-top:4px;font-size:12px;color:#7A8189">30 min · auto-added to your Google Calendar</div>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
            ${rowHtml('Name', escHtml(name))}
            ${rowHtml('Email', `<a href="mailto:${escHtml(email)}" style="color:#C6FF3D;text-decoration:none">${escHtml(email)}</a>`)}
            ${phone ? rowHtml('Phone', `<a href="tel:${escHtml(phone)}" style="color:#C6FF3D;text-decoration:none">${escHtml(phone)}</a>`) : ''}
            ${business ? rowHtml('Business', escHtml(business)) : ''}
            ${type ? rowHtml('Type', escHtml(type)) : ''}
            ${size ? rowHtml('Team size', escHtml(size)) : ''}
          </table>

          ${message ? `
          <div style="margin-top:20px;padding:16px 18px;background:#0A0B0D;border-left:3px solid #C6FF3D;border-radius:6px">
            <div style="font-family:'SFMono-Regular',Menlo,monospace;font-size:10px;letter-spacing:0.16em;color:#7A8189;text-transform:uppercase;margin-bottom:6px">What's bleeding</div>
            <div style="font-size:14px;line-height:1.6;color:#E8ECEF;white-space:pre-wrap">${escHtml(message)}</div>
          </div>` : ''}

          <div style="margin-top:24px;font-size:12px;color:#7A8189">
            Reply directly to this email — replies route to ${escHtml(email)}.
          </div>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#0A0B0D;border-top:1px solid #1F2328;font-family:'SFMono-Regular',Menlo,monospace;font-size:11px;color:#4A4F57">
          Source: vidatech.org · Generated automatically
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function rowHtml(k, v) {
  return `<tr>
    <td style="padding:10px 0;color:#7A8189;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;width:120px;border-bottom:1px solid #1F2328;vertical-align:top">${k}</td>
    <td style="padding:10px 0;color:#E8ECEF;border-bottom:1px solid #1F2328;vertical-align:top">${v}</td>
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
