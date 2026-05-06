export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://vidatech.org',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { name, email, business, type, message } = await context.request.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: 'Name and email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:580px;padding:32px;background:#f8f6f0;border-radius:12px">
        <h2 style="color:#0A1628;margin:0 0 24px">New Lead — VidaTech.org</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:7px 0;color:#64748b;font-size:13px;width:130px">Name</td><td style="padding:7px 0;color:#1e293b;font-weight:600">${name}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b;font-size:13px">Email</td><td style="padding:7px 0"><a href="mailto:${email}" style="color:#1A3A6B">${email}</a></td></tr>
          ${business ? `<tr><td style="padding:7px 0;color:#64748b;font-size:13px">Business</td><td style="padding:7px 0;color:#1e293b">${business}</td></tr>` : ''}
          ${type ? `<tr><td style="padding:7px 0;color:#64748b;font-size:13px">Industry</td><td style="padding:7px 0;color:#1e293b">${type}</td></tr>` : ''}
        </table>
        ${message ? `<div style="margin-top:20px;padding:18px;background:#fff;border-radius:8px;border-left:3px solid #C9A84C"><p style="color:#334155;margin:0;font-size:13.5px;line-height:1.7">${message.replace(/\n/g, '<br>')}</p></div>` : ''}
        <p style="margin-top:18px;color:#94a3b8;font-size:11px">Sent via vidatech.org contact form</p>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'VidaTech Contact <coo@vidatech.org>',
        to: ['vidaholdingsgroup@gmail.com'],
        reply_to: email,
        subject: `New Inquiry — ${name}${business ? ' · ' + business : ''}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://vidatech.org',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
