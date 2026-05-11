/* ══════════════════════════════════════════
   VIDATECH — script.js  |  Adventure Edition
   GSAP + ScrollTrigger + SplitType + Lenis + VanillaTilt
══════════════════════════════════════════ */

/* Wait for everything to be ready */
window.addEventListener('load', () => {

  /* Skip loader for reduced-motion / slow connections */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────────────────────────────────
     1. LOADING SCREEN
  ───────────────────────────────────── */
  const loader      = document.getElementById('loader');
  const loaderFill  = loader ? loader.querySelector('.loader__fill') : null;
  const loaderCount = document.getElementById('loaderCounter');

  if (prefersReduced || !loader) {
    if (loader) loader.remove();
    startSite();
  } else {
    let progress = 0;
    const fillInterval = setInterval(() => {
      progress += Math.random() * 18;
      if (progress >= 100) { progress = 100; clearInterval(fillInterval); }
      if (loaderFill) loaderFill.style.width = progress + '%';
      if (loaderCount) loaderCount.textContent = Math.floor(progress);
      if (progress === 100) {
        setTimeout(() => {
          if (window.gsap) {
            gsap.to(loader, {
              yPercent: -100, duration: 1, ease: 'power3.inOut',
              onComplete: () => { loader.remove(); startSite(); }
            });
          } else {
            loader.style.display = 'none';
            startSite();
          }
        }, 300);
      }
    }, 60);
  }

  function startSite() {
    initAll();
  }
});

function initAll() {
  initNav();
  initDrawer();
  initCursor();
  initCanvas();
  initHeroAnimations();
  initLenis();
  initScrollAnimations();
  initMagnetic();
  initTilt();
  initMarquee();
  initCounters();
  initProcessLine();
  initPhoneDemo();
  initContactForm();
  initSmoothLinks();
}

/* ─────────────────────────────────────
   2. NAV
───────────────────────────────────── */
function initNav() {
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}

/* ─────────────────────────────────────
   3. DRAWER
───────────────────────────────────── */
function initDrawer() {
  const burger  = document.getElementById('burger');
  const drawer  = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const close   = document.getElementById('drawerClose');

  const open = () => { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow='hidden'; };
  const shut = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow=''; };

  burger.addEventListener('click', open);
  close.addEventListener('click', shut);
  overlay.addEventListener('click', shut);
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', shut));
}

/* ─────────────────────────────────────
   4. CUSTOM CURSOR
───────────────────────────────────── */
function initCursor() {
  const dot    = document.getElementById('cursorDot');
  const ring   = document.getElementById('cursorRing');
  if (!dot || !ring) return;

  // Only on non-touch devices
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.querySelector('.cursor').style.display = 'none';
    document.body.style.cursor = 'auto';
    document.querySelectorAll('a,button,input,select,textarea').forEach(el => el.style.cursor = 'auto');
    return;
  }

  let mouseX = 0, mouseY = 0;
  let ringX  = 0, ringY  = 0;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left  = mouseX + 'px';
    dot.style.top   = mouseY + 'px';
  });

  // Ring follows with lag
  function animateRing() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    ring.style.left = ringX + 'px';
    ring.style.top  = ringY + 'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  // Cursor states on data-cursor elements
  document.querySelectorAll('[data-cursor]').forEach(el => {
    const type = el.dataset.cursor;
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor--' + type));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor--' + type));
  });
}

/* ─────────────────────────────────────
   5. HERO CANVAS — interactive particles
───────────────────────────────────── */
function initCanvas() {
  const canvas = document.getElementById('heroCanvas');
  const spotlight = document.getElementById('heroSpotlight');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, pts;
  let mx = -1000, my = -1000; // mouse position

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    build();
  }

  function build() {
    const cols = Math.ceil(W / 80);
    const rows = Math.ceil(H / 80);
    pts = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        pts.push({
          ox: (c / cols) * W,
          oy: (r / rows) * H,
          x:  (c / cols) * W,
          y:  (r / rows) * H,
          vx: 0, vy: 0,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.25 + 0.05,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.004 + 0.003,
        });
      }
    }
  }

  // Mouse / touch tracking
  const hero = document.getElementById('home');
  hero.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
    if (spotlight) {
      spotlight.style.left = e.clientX + 'px';
      spotlight.style.top  = e.clientY + 'px';
      spotlight.style.opacity = '1';
    }
  });
  hero.addEventListener('mouseleave', () => {
    mx = -1000; my = -1000;
    if (spotlight) spotlight.style.opacity = '0';
  });

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    frame++;

    pts.forEach(p => {
      // Gentle float back to origin
      const dx = mx - p.x, dy = my - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const repelRadius = 120;

      if (dist < repelRadius) {
        const force = (repelRadius - dist) / repelRadius;
        p.vx -= (dx / dist) * force * 3;
        p.vy -= (dy / dist) * force * 3;
      }

      // Spring back to origin
      p.vx += (p.ox - p.x) * 0.05;
      p.vy += (p.oy - p.y) * 0.05;

      // Damping
      p.vx *= 0.85;
      p.vy *= 0.85;

      p.x += p.vx;
      p.y += p.vy;

      // Pulse alpha
      const a = p.alpha * (0.5 + 0.5 * Math.sin(p.phase + frame * p.speed));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${a})`;
      ctx.fill();
    });

    // Draw connecting lines (only nearby)
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 90) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(201,168,76,${(1 - d / 90) * 0.08})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
}

/* ─────────────────────────────────────
   6. HERO ENTRANCE ANIMATIONS
───────────────────────────────────── */
function initHeroAnimations() {
  if (!window.gsap) {
    // Fallback: just show everything
    document.querySelectorAll('.hero-anim').forEach(el => el.style.opacity = '1');
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // Badge
  tl.from('.hero__badge', { opacity: 0, y: 20, duration: .7 }, .1)

  // Headline: SplitType word-by-word reveal
  if (window.SplitType) {
    const title = document.getElementById('heroTitle');
    const split = new SplitType(title, { types: 'words' });
    tl.from(split.words, {
      opacity: 0, y: 40, rotateX: -20,
      stagger: .06, duration: .8,
      transformOrigin: '50% 50% -50px'
    }, .3);
  } else {
    tl.from('#heroTitle', { opacity: 0, y: 40, duration: .8 }, .3);
  }

  // Sub + actions + trust
  tl.from('.hero__sub',     { opacity: 0, y: 24, duration: .7 }, .8)
    .from('.hero__actions', { opacity: 0, y: 24, duration: .7 }, .95)
    .from('.hero__trust',   { opacity: 0, y: 16, duration: .6 }, 1.1)

  // Stat cards stagger in from right
  tl.from('.hcard', {
    opacity: 0, x: 40, stagger: .1, duration: .6
  }, .5)

  // Scroll indicator
  tl.from('.hero__scroll', { opacity: 0, y: 10, duration: .5 }, 1.4)
}

/* ─────────────────────────────────────
   7. LENIS SMOOTH SCROLL
───────────────────────────────────── */
function initLenis() {
  if (!window.Lenis) return;

  const lenis = new Lenis({
    duration: 1.8,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    smoothTouch: false,
    wheelMultiplier: 0.85,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Sync with GSAP ScrollTrigger if available
  if (window.gsap && window.ScrollTrigger) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Expose for marquee speed
  window._lenis = lenis;
}

/* ─────────────────────────────────────
   8. SCROLL TRIGGERED ANIMATIONS
───────────────────────────────────── */
function initScrollAnimations() {
  if (!window.gsap || !window.ScrollTrigger) {
    // Fallback intersection observer
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.svc-card,.testi-card,.process__step,.stat-item,.demo__feat,.contact__inner>div').forEach(el => io.observe(el));
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // Split all .split-title headings
  if (window.SplitType) {
    document.querySelectorAll('.split-title').forEach(el => {
      const split = new SplitType(el, { types: 'words' });
      gsap.from(split.words, {
        opacity: 0, y: 40, stagger: .05, duration: .8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    });
  }

  // Section labels fade in
  gsap.utils.toArray('.sh__label,.sh__sub').forEach(el => {
    gsap.from(el, {
      opacity: 0, y: 20, duration: .7, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  });

  // Service cards stagger
  gsap.from('.svc-card', {
    opacity: 0, y: 50, stagger: .1, duration: .7, ease: 'power3.out',
    scrollTrigger: { trigger: '.svc-grid', start: 'top 80%', once: true }
  });

  // Testi cards stagger
  gsap.from('.testi-card', {
    opacity: 0, y: 40, stagger: .12, duration: .7, ease: 'power3.out',
    scrollTrigger: { trigger: '.testi__grid', start: 'top 80%', once: true }
  });

  // Process steps
  gsap.from('.process__step', {
    opacity: 0, y: 40, stagger: .15, duration: .7, ease: 'power3.out',
    scrollTrigger: { trigger: '.process__track', start: 'top 75%', once: true }
  });

  // Demo section
  gsap.from('.demo__left > *', {
    opacity: 0, x: -40, stagger: .12, duration: .7, ease: 'power3.out',
    scrollTrigger: { trigger: '.demo__inner', start: 'top 75%', once: true }
  });
  gsap.from('.demo__right', {
    opacity: 0, x: 40, duration: .9, ease: 'power3.out',
    scrollTrigger: { trigger: '.demo__inner', start: 'top 75%', once: true }
  });

  // Contact
  gsap.from('.contact__left > *', {
    opacity: 0, x: -30, stagger: .1, duration: .7, ease: 'power2.out',
    scrollTrigger: { trigger: '.contact__inner', start: 'top 75%', once: true }
  });
  gsap.from('.contact__right', {
    opacity: 0, x: 30, duration: .8, ease: 'power2.out',
    scrollTrigger: { trigger: '.contact__inner', start: 'top 75%', once: true }
  });

  // CTA band
  gsap.from('.cta-band__text', {
    opacity: 0, y: 30, duration: .7, ease: 'power2.out',
    scrollTrigger: { trigger: '.cta-band', start: 'top 80%', once: true }
  });
  gsap.from('.cta-band__action', {
    opacity: 0, y: 30, duration: .7, delay: .15, ease: 'power2.out',
    scrollTrigger: { trigger: '.cta-band', start: 'top 80%', once: true }
  });

  // Hero parallax
  gsap.to('.hero__left', {
    yPercent: -10, ease: 'none',
    scrollTrigger: { trigger: '.hero', scrub: 1, start: 'top top', end: 'bottom top' }
  });
}

/* ─────────────────────────────────────
   9. MAGNETIC BUTTONS
───────────────────────────────────── */
function initMagnetic() {
  document.querySelectorAll('.magnetic').forEach(wrap => {
    const btn = wrap.querySelector('a,button');
    if (!btn) return;

    wrap.addEventListener('mousemove', e => {
      const r   = wrap.getBoundingClientRect();
      const dx  = e.clientX - (r.left + r.width  / 2);
      const dy  = e.clientY - (r.top  + r.height / 2);
      const str = 0.35;

      if (window.gsap) {
        gsap.to(btn, { x: dx * str, y: dy * str, duration: .4, ease: 'power2.out', overwrite: 'auto' });
      } else {
        btn.style.transform = `translate(${dx * str}px, ${dy * str}px)`;
      }
    });

    wrap.addEventListener('mouseleave', () => {
      if (window.gsap) {
        gsap.to(btn, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1.1,.4)', overwrite: 'auto' });
      } else {
        btn.style.transform = '';
      }
    });
  });
}

/* ─────────────────────────────────────
   10. VANILLA TILT
───────────────────────────────────── */
function initTilt() {
  if (!window.VanillaTilt) return;
  // Already configured via data-tilt attributes on each element
  VanillaTilt.init(document.querySelectorAll('[data-tilt]'), {
    gyroscope: false,
    reset: true,
    transition: true,
    easing: 'cubic-bezier(.03,.98,.52,.99)',
  });
}

/* ─────────────────────────────────────
   11. MARQUEE — speed on scroll
───────────────────────────────────── */
function initMarquee() {
  const inners = document.querySelectorAll('.marquee-inner');
  let speed = 1;
  let lastScroll = window.scrollY;

  window.addEventListener('scroll', () => {
    const delta = window.scrollY - lastScroll;
    speed = 1 + Math.min(Math.abs(delta) * 0.03, 1.2);
    lastScroll = window.scrollY;
    inners.forEach(el => el.style.animationDuration = (45 / speed) + 's');
    clearTimeout(window._marqueeTimer);
    window._marqueeTimer = setTimeout(() => {
      inners.forEach(el => el.style.animationDuration = '45s');
    }, 500);
  }, { passive: true });
}

/* ─────────────────────────────────────
   12. COUNTERS (GSAP or vanilla)
───────────────────────────────────── */
function initCounters() {
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function runCounter(el) {
    const target = +el.dataset.target;
    const suffix = el.dataset.suffix || '';
    const dur    = 2200;
    let start    = null;

    if (window.gsap) {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: target, duration: 2.2, ease: 'power2.out',
        onUpdate: () => {
          const v = Math.floor(obj.val);
          el.textContent = (v >= 1000 ? v.toLocaleString() : v) + suffix;
        },
        onComplete: () => { el.textContent = (target >= 1000 ? target.toLocaleString() : target) + suffix; }
      });
    } else {
      function step(ts) {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const v = Math.floor(easeOut(p) * target);
        el.textContent = (v >= 1000 ? v.toLocaleString() : v) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = (target >= 1000 ? target.toLocaleString() : target) + suffix;
      }
      requestAnimationFrame(step);
    }
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { runCounter(e.target); io.unobserve(e.target); }
    });
  }, { threshold: .5 });

  document.querySelectorAll('[data-target]').forEach(el => io.observe(el));
}

/* ─────────────────────────────────────
   13. PROCESS LINE DRAW
───────────────────────────────────── */
function initProcessLine() {
  const line = document.getElementById('processLine');
  if (!line) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { line.style.width = '100%'; io.unobserve(e.target); }
    });
  }, { threshold: .3 });
  io.observe(document.querySelector('.process__track'));
}

/* ─────────────────────────────────────
   14. PHONE DEMO
───────────────────────────────────── */
function initPhoneDemo() {
  const feed    = document.getElementById('chatFeed');
  const status  = document.getElementById('callStatus');
  const timer   = document.getElementById('callTimer');
  const callBtn = document.getElementById('demoCallBtn');
  if (!feed) return;

  let running = false, iv = null, secs = 0;

  const SCRIPT = [
    { side: 'in',  delay: 900,   text: "Thank you for calling! This is the VidaTech Receptionist. How can I help you today?" },
    { side: 'out', delay: 2800,  text: "Hi, I need to schedule an HVAC tune-up." },
    { side: 'in',  delay: 4600,  text: "Absolutely! I can get that scheduled right away. Are you available this Tuesday or Thursday?" },
    { side: 'out', delay: 6800,  text: "Thursday works." },
    { side: 'in',  delay: 8300,  text: "Perfect. We have 10 AM or 2 PM on Thursday — which do you prefer?" },
    { side: 'out', delay: 10100, text: "2 PM please." },
    { side: 'in',  delay: 11700, text: "You're all set for Thursday at 2 PM! I'll send a text reminder the morning before. Anything else?" },
    { side: 'out', delay: 13900, text: "No, that's great. Thank you!" },
    { side: 'in',  delay: 15500, text: "My pleasure! See you Thursday. Have a wonderful day! 👋" },
  ];

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

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
    running = false; clearInterval(iv); secs = 0;
    timer.textContent = '0:00';
    status.textContent = 'Tap Call to start demo';
    status.classList.remove('live');
    callBtn.textContent = 'Call'; callBtn.classList.remove('active');
    feed.innerHTML = '<div class="chat-msg chat-msg--in"><span class="typing"><span></span><span></span><span></span></span></div>';
  }

  function start() {
    running = true;
    callBtn.textContent = 'End'; callBtn.classList.add('active');
    status.textContent = 'Connected'; status.classList.add('live');
    feed.innerHTML = '';
    iv = setInterval(() => { secs++; timer.textContent = fmt(secs); }, 1000);

    SCRIPT.forEach(line => {
      if (line.side === 'in') setTimeout(() => { if (running) showTyping(); }, line.delay - 700);
      setTimeout(() => { if (running) addMsg(line.text, line.side); }, line.delay);
    });

    const last = SCRIPT[SCRIPT.length - 1].delay;
    setTimeout(() => {
      if (!running) return;
      clearInterval(iv);
      status.textContent = 'Call ended'; status.classList.remove('live');
      callBtn.textContent = 'Replay'; callBtn.classList.remove('active');
      running = false;
    }, last + 2200);
  }

  callBtn.addEventListener('click', () => {
    if (!running && callBtn.textContent !== 'Replay') { start(); }
    else if (!running) { reset(); setTimeout(start, 350); }
    else { reset(); }
  });

  // Auto-start when scrolled in
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && !running && callBtn.textContent === 'Call') {
        setTimeout(start, 800); io.unobserve(e.target);
      }
    });
  }, { threshold: .5 });
  const ph = document.querySelector('.phone');
  if (ph) io.observe(ph);
}

/* ─────────────────────────────────────
   15. CONTACT FORM → RESEND
───────────────────────────────────── */
function initContactForm() {
  const form    = document.getElementById('contactForm');
  const btnText = document.getElementById('formBtnText');
  const btnLoad = document.getElementById('formBtnLoading');
  const success = document.getElementById('formSuccess');
  const errBox  = document.getElementById('formError');
  const submit  = document.getElementById('formSubmit');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = form.name?.value.trim()    || '';
    const email    = form.email?.value.trim()   || '';
    const business = form.business?.value.trim()|| '';
    const type     = form.type?.value           || '';
    const message  = form.message?.value.trim() || '';

    if (!name || !email) {
      errBox.style.display = 'block';
      errBox.innerHTML = 'Please fill in your name and email.';
      return;
    }

    success.style.display = 'none';
    errBox.style.display  = 'none';
    btnText.style.display = 'none';
    btnLoad.style.display = 'inline';
    submit.disabled = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, business, type, message })
      });
      if (res.ok) { form.reset(); success.style.display = 'block'; }
      else throw new Error();
    } catch {
      errBox.style.display = 'block';
      errBox.innerHTML = 'Something went wrong. Email us at <a href="mailto:coo@vidatech.org">coo@vidatech.org</a>';
    } finally {
      btnText.style.display = 'inline';
      btnLoad.style.display = 'none';
      submit.disabled = false;
    }
  });
}

/* ─────────────────────────────────────
   16. SMOOTH ANCHOR SCROLL
───────────────────────────────────── */
function initSmoothLinks() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      const offset = document.getElementById('nav').offsetHeight + 16;
      if (window._lenis) {
        window._lenis.scrollTo(el, { offset: -offset, duration: 1.4 });
      } else {
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
      }
    });
  });
}
