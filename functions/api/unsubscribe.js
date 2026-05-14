/**
 * VidaTech unsubscribe handler — RFC 8058 one-click + manual web form.
 *
 * Accepts:
 *   POST /api/unsubscribe
 *     - x-www-form-urlencoded body: `email=...&t=...&source=...`
 *     - body may also be `List-Unsubscribe=One-Click` (RFC 8058 one-click)
 *   GET  /api/unsubscribe?email=...&t=...
 *     - 302 redirect to /unsubscribe?confirmed=1 on success
 *
 * Token (`t`) is HMAC-SHA256(email, UNSUB_SECRET), hex.
 * If the token verifies OR the call is a one-click POST from a mail provider,
 * we add the email to the UNSUBS KV namespace and return success.
 *
 * Required env bindings:
 *   - UNSUBS         (KV namespace — suppression list)
 *   - UNSUB_SECRET   (secret — HMAC key for token signing)
 *
 * Both must be configured in the Cloudflare Pages project Settings → Variables/Bindings.
 */

const ALLOWED_ORIGINS = new Set(['https://vidatech.org', 'https://www.vidatech.org']);
const ORG_EMAIL = 'vidaholdings@gmail.com';

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://vidatech.org';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin') || '';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin);

  if (!env.UNSUBS) {
    return text('Suppression list not configured. Please email ' + ORG_EMAIL + ' to unsubscribe.', 503, cors);
  }

  const ct = request.headers.get('Content-Type') || '';
  let email = '';
  let token = '';
  let source = 'unknown';
  let isOneClick = false;

  if (ct.includes('application/x-www-form-urlencoded')) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    email = (params.get('email') || '').trim();
    token = (params.get('t') || '').trim();
    source = (params.get('source') || 'form').trim().slice(0, 32);
    if (params.get('List-Unsubscribe') === 'One-Click') isOneClick = true;
  } else if (ct.includes('application/json')) {
    try {
      const j = await request.json();
      email = String(j.email || '').trim();
      token = String(j.t || '').trim();
      source = String(j.source || 'api').slice(0, 32);
    } catch {
      return text('Invalid JSON', 400, cors);
    }
  } else {
    // RFC 8058 one-click — Gmail/Outlook may POST with no body. The unsubscribe URL
    // we put in List-Unsubscribe always carries the token in the query string, so we
    // can still verify here.
    const url = new URL(request.url);
    email = (url.searchParams.get('email') || url.searchParams.get('u') || '').trim();
    token = (url.searchParams.get('t') || '').trim();
    source = 'one-click';
    isOneClick = true;
  }

  // Decode base64url-encoded email BEFORE lowercasing (base64url is case-sensitive).
  if (email && !email.includes('@')) {
    try { email = b64urlDecode(email); } catch { /* ignore */ }
  }
  email = email.toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return text('Email address required.', 400, cors);
  }

  // Token verification — REQUIRED whenever UNSUB_SECRET is configured. The one-click
  // POST from Gmail/Outlook keeps the URL query string intact, so we can verify the
  // token regardless of Content-Type. This closes the unauthenticated unsubscribe-anyone
  // vector that existed when one-click bypassed verification.
  if (env.UNSUB_SECRET) {
    if (!token) {
      return text('Missing verification token.', 400, cors);
    }
    const expected = await hmacHex(env.UNSUB_SECRET, email);
    if (!safeEqual(token, expected)) {
      return text('Invalid verification token.', 400, cors);
    }
  }

  // Add to suppression list
  await env.UNSUBS.put(email, JSON.stringify({
    unsubscribed_at: new Date().toISOString(),
    source,
    ip: request.headers.get('CF-Connecting-IP') || '',
    one_click: isOneClick,
  }));

  // RFC 8058 one-click expects a 2xx response with no redirect
  return text('OK', 200, cors);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const emailParam = (url.searchParams.get('email') || url.searchParams.get('u') || '').trim();
  const token = (url.searchParams.get('t') || '').trim();

  let email = emailParam.toLowerCase();
  if (email && !email.includes('@')) {
    try { email = b64urlDecode(email); } catch { /* ignore */ }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.redirect('https://vidatech.org/unsubscribe', 302);
  }

  if (env.UNSUB_SECRET && token) {
    const expected = await hmacHex(env.UNSUB_SECRET, email);
    if (safeEqual(token, expected) && env.UNSUBS) {
      await env.UNSUBS.put(email, JSON.stringify({
        unsubscribed_at: new Date().toISOString(),
        source: 'email-link',
        ip: request.headers.get('CF-Connecting-IP') || '',
        one_click: false,
      }));
      return Response.redirect('https://vidatech.org/unsubscribe?confirmed=1', 302);
    }
  }

  // Fall through to the manual form, pre-filling the email
  const safeEmail = encodeURIComponent(emailParam);
  return Response.redirect('https://vidatech.org/unsubscribe?email=' + safeEmail, 302);
}

/* ─── helpers ─── */

function text(body, status, cors) {
  return new Response(body, {
    status,
    headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
