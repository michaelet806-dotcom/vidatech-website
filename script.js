/* ═══════════════════════════════════════════
   VIDATECH — script.js
═══════════════════════════════════════════ */

/* ─── NAV SCROLL EFFECT ─── */
(function () {
  const nav = document.getElementById('nav');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ─── HAMBURGER / MOBILE DRAWER ─── */
(function () {
  const burger = document.getElementById('burger');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const close = document.getElementById('drawerClose');
  const links = drawer.querySelectorAll('.drawer__link');

  function open() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function shut() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  burger.addEventListener('click', open);
  close.addEventListener('click', shut);
  overlay.addEventListener('click', shut);
  links.forEach(l => l.addEventListener('click', shut));
})();

/* ─── HERO CANVAS (particle grid) ─── */
(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w, h, particles;

  function resize() {
    w = canvas.width  = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
    build();
  }

  function build() {
    const cols = Math.floor(w / 60);
    const rows = Math.floor(h / 60);
    particles = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        particles.push({
          x: (c / cols) * w,
          y: (r / rows) * h,
          ox: (c / cols) * w,
          oy: (r / rows) * h,
          vx: 0, vy: 0,
          size: Math.random() * 1.2 + 0.4,
          alpha: Math.random() * 0.3 + 0.05,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);
    frame++;

    particles.forEach((p, i) => {
      p.alpha = 0.05 + 0.1 * Math.sin(p.phase + frame * 0.008);

      // dots
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${p.alpha})`;
      ctx.fill();
    });

    // draw connecting lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 68) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          const opacity = (1 - dist / 68) * 0.08;
          ctx.strokeStyle = `rgba(201,168,76,${opacity})`;
          ctx.lineWidth = 0.5;
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

/* ─── INTERSECTION OBSERVER (reveal animations) ─── */
(function () {
  const els = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => io.observe(el));
})();

/* ─── NUMBER COUNTERS ─── */
(function () {
  const counters = document.querySelectorAll('[data-target]');

  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  function animateCounter(el) {
    const target = +el.dataset.target;
    const duration = 1800;
    let start = null;

    function step(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      const val = Math.round(ease(progress) * target);
      el.textContent = val >= 1000 ? val.toLocaleString() : val;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target >= 1000 ? target.toLocaleString() : target;
    }

    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => io.observe(c));
})();

/* ─── DEMO PHONE ANIMATION ─── */
(function () {
  const chatFeed  = document.getElementById('chatFeed');
  const callStatus = document.getElementById('callStatus');
  const callTimer  = document.getElementById('callTimer');
  const demoBtn    = document.getElementById('demoCallBtn');
  if (!chatFeed) return;

  let running = false;
  let timerInterval = null;
  let seconds = 0;

  const SCRIPT = [
    { side: 'in',  delay: 1200, text: 'Thank you for calling! This is VidaTech Receptionist. How can I help you today?' },
    { side: 'out', delay: 3000, text: 'Hi, I need to schedule an appointment for my HVAC system.' },
    { side: 'in',  delay: 5200, text: 'Of course! I can get that booked for you. What\'s a good day this week — Tuesday or Thursday?' },
    { side: 'out', delay: 7500, text: 'Thursday works.' },
    { side: 'in',  delay: 9200, text: 'Perfect. Morning or afternoon? We have 10 AM or 2 PM available.' },
    { side: 'out', delay: 11000, text: '2 PM please.' },
    { side: 'in',  delay: 12800, text: 'Confirmed! You\'re all set for Thursday at 2 PM. I\'ll send a text reminder 24 hours before. Is there anything else?' },
    { side: 'out', delay: 15000, text: 'No, that\'s great. Thanks!' },
    { side: 'in',  delay: 16800, text: 'My pleasure! Have a wonderful day. 👋' },
  ];

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function addBubble(text, side) {
    const existing = chatFeed.querySelector('.chat-bubble--in .typing-indicator');
    if (existing) existing.closest('.chat-bubble').remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble--${side}`;
    bubble.textContent = text;
    chatFeed.appendChild(bubble);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function addTyping() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--in';
    bubble.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
    chatFeed.appendChild(bubble);
    chatFeed.scrollTop = chatFeed.scrollHeight;
    return bubble;
  }

  function resetDemo() {
    running = false;
    clearInterval(timerInterval);
    seconds = 0;
    callTimer.textContent = '0:00';
    callStatus.textContent = 'Tap to start demo';
    callStatus.classList.remove('active');
    demoBtn.textContent = 'Call';
    demoBtn.classList.remove('active');
    chatFeed.innerHTML = '<div class="chat-bubble chat-bubble--in"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
  }

  function startDemo() {
    running = true;
    demoBtn.textContent = 'End';
    demoBtn.classList.add('active');
    callStatus.textContent = 'Connected';
    callStatus.classList.add('active');

    // timer
    timerInterval = setInterval(() => {
      seconds++;
      callTimer.textContent = formatTime(seconds);
    }, 1000);

    // clear initial typing bubble
    chatFeed.innerHTML = '';

    let typingBubble = null;

    SCRIPT.forEach((line, idx) => {
      // Show typing indicator ~500ms before message
      setTimeout(() => {
        if (!running) return;
        if (line.side === 'in') typingBubble = addTyping();
      }, line.delay - 700);

      setTimeout(() => {
        if (!running) return;
        addBubble(line.text, line.side);
      }, line.delay);
    });

    // end after last line
    const lastDelay = SCRIPT[SCRIPT.length - 1].delay;
    setTimeout(() => {
      if (!running) return;
      callStatus.textContent = 'Call ended';
      callStatus.classList.remove('active');
      clearInterval(timerInterval);
      demoBtn.textContent = 'Replay';
      demoBtn.classList.remove('active');
      running = false;
    }, lastDelay + 2500);
  }

  demoBtn.addEventListener('click', () => {
    if (!running && demoBtn.textContent !== 'Replay') {
      startDemo();
    } else if (!running && demoBtn.textContent === 'Replay') {
      resetDemo();
      setTimeout(startDemo, 400);
    } else {
      resetDemo();
    }
  });

  // Auto-start when phone enters viewport
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !running && demoBtn.textContent === 'Call') {
        setTimeout(startDemo, 800);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  const mockup = document.querySelector('.phone-mockup');
  if (mockup) io.observe(mockup);
})();

/* ─── CONTACT FORM (Resend API) ─── */
(function () {
  const form    = document.getElementById('contactForm');
  const btnText = document.getElementById('formBtnText');
  const btnLoad = document.getElementById('formBtnLoading');
  const success = document.getElementById('formSuccess');
  const error   = document.getElementById('formError');
  const submit  = document.getElementById('formSubmit');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = form.name.value.trim();
    const email    = form.email.value.trim();
    const business = form.business.value.trim();
    const type     = form.type.value;
    const message  = form.message.value.trim();

    if (!name || !email) {
      error.style.display = 'flex';
      error.textContent = 'Please fill in your name and email.';
      return;
    }

    // hide previous states
    success.style.display = 'none';
    error.style.display   = 'none';
    btnText.style.display = 'none';
    btnLoad.style.display = 'inline';
    submit.disabled = true;

    const body = {
      from: 'VidaTech Contact Form <coo@vidatech.org>',
      to:   ['vidaholdingsgroup@gmail.com'],
      reply_to: email,
      subject: `New Inquiry from ${name}${business ? ' — ' + business : ''}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;padding:32px;background:#f8f6f0;border-radius:12px;">
          <h2 style="color:#0A1628;margin:0 0 24px;">New Lead from VidaTech.org</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:140px;">Name</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#1A3A6B;">${email}</a></td></tr>
            ${business ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Business</td><td style="padding:8px 0;color:#1e293b;">${business}</td></tr>` : ''}
            ${type ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Type</td><td style="padding:8px 0;color:#1e293b;">${type}</td></tr>` : ''}
          </table>
          ${message ? `<div style="margin-top:24px;padding:20px;background:#fff;border-radius:8px;border-left:3px solid #C9A84C;"><p style="color:#334155;margin:0;font-size:14px;line-height:1.7;">${message.replace(/\n/g,'<br>')}</p></div>` : ''}
          <p style="margin-top:24px;color:#94a3b8;font-size:12px;">Sent via vidatech.org contact form</p>
        </div>
      `
    };

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer re_cjU8bsN8_CgoKTSi22ZEfzjsJmEh86kHd'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        form.reset();
        success.style.display = 'flex';
      } else {
        throw new Error('API error');
      }
    } catch {
      error.style.display = 'block';
    } finally {
      btnText.style.display = 'inline';
      btnLoad.style.display = 'none';
      submit.disabled = false;
    }
  });
})();

/* ─── SMOOTH SCROLL FOR ANCHOR LINKS ─── */
(function () {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const navH = document.getElementById('nav').offsetHeight;
      const top  = target.getBoundingClientRect().top + window.scrollY - navH - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
