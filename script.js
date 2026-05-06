/* ═══════════════════════════════════════════
   VIDATECH — script.js
═══════════════════════════════════════════ */

/* ── NAV SCROLL ── */
(function () {
  const nav = document.getElementById('nav');
  function tick() { nav.classList.toggle('scrolled', window.scrollY > 50); }
  window.addEventListener('scroll', tick, { passive: true });
  tick();
})();

/* ── MOBILE DRAWER ── */
(function () {
  const burger  = document.getElementById('burger');
  const drawer  = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const close   = document.getElementById('drawerClose');

  function open()  { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function shut()  { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }

  burger.addEventListener('click', open);
  close.addEventListener('click', shut);
  overlay.addEventListener('click', shut);
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', shut));
})();

/* ── SMOOTH SCROLL ── */
(function () {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id  = a.getAttribute('href').slice(1);
      const el  = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      const offset = document.getElementById('nav').offsetHeight + 16;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    });
  });
})();

/* ── INTERSECTION OBSERVER (reveal) ── */
(function () {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.10, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

/* ── HERO CANVAS — particle grid ── */
(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, pts;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    build();
  }

  function build() {
    const cols = Math.ceil(W / 72);
    const rows = Math.ceil(H / 72);
    pts = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        pts.push({
          x: (c / cols) * W,
          y: (r / rows) * H,
          a: Math.random() * .18 + .03,
          r: Math.random() * 1.3 + .4,
          p: Math.random() * Math.PI * 2
        });
      }
    }
  }

  let f = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    f++;
    pts.forEach((p, i) => {
      const alpha = p.a * (.5 + .5 * Math.sin(p.p + f * .007));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${alpha})`;
      ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 80) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(201,168,76,${(1 - d / 80) * .07})`;
          ctx.lineWidth = .6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

/* ── NUMBER COUNTERS ── */
(function () {
  const ease = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  function run(el) {
    const target = +el.dataset.target;
    const suffix = el.dataset.suffix || '';
    const dur = 2000;
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const v = Math.round(ease(p) * target);
      el.textContent = (v >= 1000 ? v.toLocaleString() : v) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = (target >= 1000 ? target.toLocaleString() : target) + suffix;
    }
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
  }, { threshold: .5 });

  document.querySelectorAll('[data-target]').forEach(el => io.observe(el));
})();

/* ── PHONE DEMO ANIMATION ── */
(function () {
  const feed     = document.getElementById('chatFeed');
  const status   = document.getElementById('callStatus');
  const timer    = document.getElementById('callTimer');
  const callBtn  = document.getElementById('demoCallBtn');
  if (!feed) return;

  let running = false, iv = null, secs = 0;

  const SCRIPT = [
    { side: 'in',  delay: 900,   text: 'Thank you for calling! This is the VidaTech Receptionist. How can I help you today?' },
    { side: 'out', delay: 2800,  text: 'Hi, I need to schedule an HVAC appointment.' },
    { side: 'in',  delay: 4800,  text: 'Of course! I can get that booked right away. Are you available Tuesday or Thursday this week?' },
    { side: 'out', delay: 7000,  text: 'Thursday works for me.' },
    { side: 'in',  delay: 8600,  text: 'Perfect. We have 10 AM or 2 PM on Thursday. Which do you prefer?' },
    { side: 'out', delay: 10400, text: '2 PM please.' },
    { side: 'in',  delay: 12000, text: "Confirmed! You're all set for Thursday at 2 PM. I'll send a text reminder 24 hours before. Is there anything else I can help with?" },
    { side: 'out', delay: 14400, text: 'No, that\'s perfect. Thank you!' },
    { side: 'in',  delay: 16000, text: "My pleasure! Have a great day. We'll see you Thursday. 👋" },
  ];

  function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}`; }

  function addMsg(text, side) {
    feed.querySelector('.typing')?.closest('.chat-msg')?.remove();
    const m = document.createElement('div');
    m.className = `chat-msg chat-msg--${side}`;
    m.textContent = text;
    feed.appendChild(m);
    feed.scrollTop = feed.scrollHeight;
  }

  function showTyping() {
    const m = document.createElement('div');
    m.className = 'chat-msg chat-msg--in';
    m.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    feed.appendChild(m);
    feed.scrollTop = feed.scrollHeight;
  }

  function reset() {
    running = false;
    clearInterval(iv);
    secs = 0;
    timer.textContent = '0:00';
    status.textContent = 'Tap Call to start demo';
    status.classList.remove('live');
    callBtn.textContent = 'Call';
    callBtn.classList.remove('active');
    feed.innerHTML = '<div class="chat-msg chat-msg--in"><span class="typing"><span></span><span></span><span></span></span></div>';
  }

  function start() {
    running = true;
    callBtn.textContent = 'End';
    callBtn.classList.add('active');
    status.textContent = 'Connected';
    status.classList.add('live');
    feed.innerHTML = '';
    iv = setInterval(() => { secs++; timer.textContent = fmt(secs); }, 1000);

    SCRIPT.forEach(line => {
      if (line.side === 'in') {
        setTimeout(() => { if (running) showTyping(); }, line.delay - 600);
      }
      setTimeout(() => { if (running) addMsg(line.text, line.side); }, line.delay);
    });

    const last = SCRIPT[SCRIPT.length - 1].delay;
    setTimeout(() => {
      if (!running) return;
      clearInterval(iv);
      status.textContent = 'Call ended';
      status.classList.remove('live');
      callBtn.textContent = 'Replay';
      callBtn.classList.remove('active');
      running = false;
    }, last + 2200);
  }

  callBtn.addEventListener('click', () => {
    if (!running && callBtn.textContent !== 'Replay') { start(); }
    else if (!running) { reset(); setTimeout(start, 350); }
    else { reset(); }
  });

  // Auto-start when scrolled into view
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && !running && callBtn.textContent === 'Call') {
        setTimeout(start, 600);
        io.unobserve(e.target);
      }
    });
  }, { threshold: .5 });
  const ph = document.querySelector('.phone');
  if (ph) io.observe(ph);
})();

/* ── CONTACT FORM → RESEND ── */
(function () {
  const form    = document.getElementById('contactForm');
  const btnText = document.getElementById('formBtnText');
  const btnLoad = document.getElementById('formBtnLoading');
  const success = document.getElementById('formSuccess');
  const errBox  = document.getElementById('formError');
  const submit  = document.getElementById('formSubmit');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = form.name.value.trim();
    const email    = form.email.value.trim();
    const business = form.business?.value.trim() || '';
    const type     = form.type?.value || '';
    const message  = form.message?.value.trim() || '';

    if (!name || !email) {
      errBox.style.display = 'block';
      errBox.textContent   = 'Please fill in your name and email.';
      return;
    }

    success.style.display = 'none';
    errBox.style.display  = 'none';
    btnText.style.display = 'none';
    btnLoad.style.display = 'inline';
    submit.disabled = true;

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:580px;padding:32px;background:#f8f6f0;border-radius:12px">
        <h2 style="color:#0A1628;margin:0 0 24px">🎯 New Lead — VidaTech.org</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:7px 0;color:#64748b;font-size:13px;width:130px">Name</td><td style="padding:7px 0;color:#1e293b;font-weight:600">${name}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b;font-size:13px">Email</td><td style="padding:7px 0"><a href="mailto:${email}" style="color:#1A3A6B">${email}</a></td></tr>
          ${business ? `<tr><td style="padding:7px 0;color:#64748b;font-size:13px">Business</td><td style="padding:7px 0;color:#1e293b">${business}</td></tr>` : ''}
          ${type ? `<tr><td style="padding:7px 0;color:#64748b;font-size:13px">Industry</td><td style="padding:7px 0;color:#1e293b">${type}</td></tr>` : ''}
        </table>
        ${message ? `<div style="margin-top:22px;padding:18px;background:#fff;border-radius:8px;border-left:3px solid #C9A84C"><p style="color:#334155;margin:0;font-size:13.5px;line-height:1.7">${message.replace(/\n/g,'<br>')}</p></div>` : ''}
        <p style="margin-top:20px;color:#94a3b8;font-size:11px">Sent via vidatech.org contact form</p>
      </div>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer re_cjU8bsN8_CgoKTSi22ZEfzjsJmEh86kHd' },
        body: JSON.stringify({
          from: 'VidaTech Contact <coo@vidatech.org>',
          to: ['vidaholdingsgroup@gmail.com'],
          reply_to: email,
          subject: `New Inquiry — ${name}${business ? ' · ' + business : ''}`,
          html
        })
      });
      if (res.ok) { form.reset(); success.style.display = 'block'; }
      else throw new Error();
    } catch {
      errBox.style.display = 'block';
    } finally {
      btnText.style.display = 'inline';
      btnLoad.style.display = 'none';
      submit.disabled = false;
    }
  });
})();
