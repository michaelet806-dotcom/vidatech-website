/* ═══════════════════════════════════════════════
   VidaTech v2 — Warm-Editorial · Vanilla JS
═══════════════════════════════════════════════ */

(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initLenis();
    initNav();
    initPhoneClock();
    initLivingCall();
    initCounters();
    initStepsLine();
    initForm();
    initScrollMark();
    initRules();
    initUnderlines();
    initScrollVelocity();
    initMagnetic();
    initCursorRing();
    initSectionReveals();
    initRevealFallback();
  }

  /* ─── 0. LENIS SMOOTH SCROLL ─── */
  function initLenis() {
    if (reduced || !window.Lenis) return;
    const lenis = new Lenis({
      duration: 1.1,
      easing: t => 1 - Math.pow(1 - t, 4),
      smoothWheel: true,
      smoothTouch: false,
      wheelMultiplier: 0.92,
      lerp: 0.085,
    });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    window._lenis = lenis;
  }

  /* ─── 1. NAV ─── */
  function initNav() {
    const nav = $('#nav');
    const menu = $('#navMenu');
    const drawer = $('#drawer');
    if (!nav) return;

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (menu && drawer) {
      drawer.toggleAttribute('inert', true);
      const setOpen = (open) => {
        menu.classList.toggle('is-open', open);
        drawer.classList.toggle('is-open', open);
        drawer.setAttribute('aria-hidden', String(!open));
        drawer.toggleAttribute('inert', !open);
        menu.setAttribute('aria-expanded', String(open));
        menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      };
      menu.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
      $$('a', drawer).forEach(a => a.addEventListener('click', () => setOpen(false)));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) setOpen(false);
      });
    }
  }

  /* ─── 2. PHONE CLOCK (live) ─── */
  function initPhoneClock() {
    const el = $('#phoneTime');
    if (!el) return;
    const tick = () => {
      const d = new Date();
      const h = ((d.getHours() + 11) % 12) + 1;
      const m = String(d.getMinutes()).padStart(2, '0');
      el.textContent = `${h}:${m}`;
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ─── 3. THE LIVING CALL ─── */
  function initLivingCall() {
    const chat = $('#phoneChat');
    const stage = $('#callStage');
    const fly = $('#bookingFly');
    const calNew = $('#calSlotNew');
    if (!chat || !stage) return;

    const script = [
      { side: 'caller', text: 'Hi — is this Vida Auto Body?', delay: 400 },
      { side: 'ai',     text: 'Vida Auto Body, this is the front desk — how can I help?', delay: 800, typing: 500 },
      { side: 'caller', text: "My brakes are grinding. Can someone look at it?", delay: 1000 },
      { side: 'ai',     text: "Sure — I can get you in tomorrow at 2:30 or Thursday at 10.", delay: 1100, typing: 600 },
      { side: 'caller', text: "Tomorrow at 2:30, please.", delay: 900 },
      { side: 'ai',     text: "Booked. Text confirmation on its way.", delay: 900, typing: 500, onShow: () => flyBooking() },
    ];

    let started = false;
    let timeoutIds = [];

    const flyBooking = () => {
      stage.classList.remove('is-live');
      void stage.offsetWidth;
      stage.classList.add('is-live');
      setTimeout(() => {
        if (calNew) calNew.classList.add('is-in');
      }, 2200);
    };

    const runScript = () => {
      if (started) return;
      started = true;
      chat.innerHTML = '';
      if (calNew) calNew.classList.remove('is-in');
      if (fly) fly.classList.remove('is-flying');
      let t = 0;
      script.forEach(line => {
        t += line.delay;
        if (line.typing) {
          timeoutIds.push(setTimeout(() => showTyping(line.side), t - line.typing));
        }
        timeoutIds.push(setTimeout(() => showBubble(line), t));
      });
      // Loop after a pause (long enough to read the booking landed)
      timeoutIds.push(setTimeout(() => {
        started = false;
        runScript();
      }, t + 4500));
    };

    const showTyping = (side) => {
      const b = document.createElement('div');
      b.className = `bubble bubble--${side === 'caller' ? 'caller' : 'ai'} is-typing`;
      b.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
      chat.appendChild(b);
      requestAnimationFrame(() => b.classList.add('is-in'));
      pruneChat();
    };

    const showBubble = (line) => {
      const typing = chat.querySelector('.is-typing');
      if (typing) typing.remove();
      const b = document.createElement('div');
      b.className = `bubble bubble--${line.side === 'caller' ? 'caller' : 'ai'}`;
      b.textContent = line.text;
      chat.appendChild(b);
      requestAnimationFrame(() => b.classList.add('is-in'));
      pruneChat();
      if (line.onShow) line.onShow();
    };

    const pruneChat = () => {
      while (chat.children.length > 5) chat.removeChild(chat.firstChild);
    };

    if (reduced) {
      // Static state for reduced motion: show last 3 exchanges
      script.slice(-3).forEach(line => {
        const b = document.createElement('div');
        b.className = `bubble bubble--${line.side === 'caller' ? 'caller' : 'ai'} is-in`;
        b.textContent = line.text;
        chat.appendChild(b);
      });
      if (calNew) calNew.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !started) {
          runScript();
        } else if (!e.isIntersecting) {
          // pause when offscreen
          timeoutIds.forEach(clearTimeout);
          timeoutIds = [];
          started = false;
        }
      });
    }, { threshold: 0.35 });
    io.observe(stage);
  }

  /* ─── 4. COUNTERS ─── */
  function initCounters() {
    const els = $$('[data-target]');
    if (!els.length) return;
    const run = (el) => {
      const target = +el.dataset.target;
      if (reduced) { el.textContent = target; return; }
      const dur = 1600;
      const start = performance.now();
      const step = (t) => {
        const p = Math.min((t - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(eased * target);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    els.forEach(el => io.observe(el));
  }

  /* ─── 5. STEPS LINE DRAW ─── */
  function initStepsLine() {
    const line = $('#stepsLine');
    if (!line || reduced) return;
    const path = line.querySelector('path');
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.style.transition = 'stroke-dashoffset 1400ms cubic-bezier(0.16,1,0.3,1)';
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          path.style.strokeDashoffset = '0';
          path.style.strokeDasharray = '3 6';
          setTimeout(() => { path.style.strokeDashoffset = '0'; }, 1400);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.3 });
    io.observe(line);
  }

  /* ─── 6. TILE SUBTLE HOVER LIFT (already CSS, but track for cursor) ─── */
  function initTileTilt() {
    // Reserved for future cursor effects; CSS handles base hover.
  }

  /* ─── 7. CONTACT FORM ─── */
  function initForm() {
    const form    = $('#contactForm');
    const btnTxt  = $('#formBtnText');
    const btnLoad = $('#formBtnLoading');
    const okBox   = $('#formSuccess');
    const errBox  = $('#formError');
    const submit  = $('#formSubmit');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name:     form.name?.value.trim() || '',
        email:    form.email?.value.trim() || '',
        business: form.business?.value.trim() || '',
        type:     form.type?.value || '',
        message:  form.message?.value.trim() || '',
      };

      if (!data.name || !data.email) {
        errBox.hidden = false;
        errBox.innerHTML = 'Please add your name and email.';
        return;
      }

      okBox.hidden  = true;
      errBox.hidden = true;
      btnTxt.hidden = true;
      btnLoad.hidden = false;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) { form.reset(); okBox.hidden = false; }
        else throw new Error();
      } catch {
        errBox.hidden = false;
        errBox.innerHTML = 'Something went wrong. Email us at <a href="mailto:coo@vidatech.org">coo@vidatech.org</a>';
      } finally {
        btnTxt.hidden = false;
        btnLoad.hidden = true;
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    });
  }

  /* ─── 8. SCROLL PROGRESS MARK ─── */
  function initScrollMark() {
    const m = $('#scrollMark');
    if (!m || reduced) return;
    let raf;
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const pct = max > 0 ? (scrollY / max) * 100 : 0;
      m.style.width = pct.toFixed(2) + '%';
    };
    update();
    window.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }, { passive: true });
  }

  /* ─── 9. SELF-DRAWING SECTION RULES ─── */
  function initRules() {
    const rules = $$('.rule');
    if (!rules.length) return;
    if (reduced) { rules.forEach(r => r.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    rules.forEach(r => io.observe(r));
  }

  /* ─── 10. HAND-DRAWN UNDERLINE TRIGGER ─── */
  function initUnderlines() {
    const ems = $$('.display em');
    if (!ems.length) return;
    if (reduced) { ems.forEach(e => e.classList.add('is-in-view')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in-view'); io.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    ems.forEach(e => io.observe(e));
  }

  /* ─── 11. SCROLL VELOCITY CSS VAR ─── */
  function initScrollVelocity() {
    if (reduced) return;
    let lastY = scrollY, lastT = performance.now(), v = 0, raf;
    const root = document.documentElement;
    const decay = () => {
      v *= 0.9;
      root.style.setProperty('--scroll-velocity', v.toFixed(3));
      if (Math.abs(v) > 0.01) raf = requestAnimationFrame(decay);
    };
    window.addEventListener('scroll', () => {
      const now = performance.now();
      const dt = Math.max(now - lastT, 1);
      v = Math.max(-1, Math.min(1, (scrollY - lastY) / dt * 0.05));
      lastY = scrollY; lastT = now;
      root.style.setProperty('--scroll-velocity', v.toFixed(3));
      cancelAnimationFrame(raf); raf = requestAnimationFrame(decay);
    }, { passive: true });
  }

  /* ─── 12. MAGNETIC CTA ─── */
  function initMagnetic() {
    if (reduced) return;
    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    const btns = $$('[data-magnetic]');
    btns.forEach(btn => {
      const strength = 0.32, radius = 90;
      let rect, raf;
      const update = (x, y) => {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < radius + Math.max(rect.width, rect.height) / 2) {
          btn.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
        } else {
          btn.style.transform = '';
        }
      };
      btn.addEventListener('pointerenter', () => rect = btn.getBoundingClientRect());
      window.addEventListener('pointermove', (e) => {
        if (!rect) return;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => update(e.clientX, e.clientY));
      });
      btn.addEventListener('pointerleave', () => btn.style.transform = '');
      window.addEventListener('scroll', () => { rect = btn.getBoundingClientRect(); }, { passive: true });
    });
  }

  /* ─── 13. CUSTOM CURSOR RING ─── */
  function initCursorRing() {
    if (reduced) return;
    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    document.body.appendChild(ring);

    let tx = 0, ty = 0, x = 0, y = 0;
    let active = false;
    window.addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      if (!active) { active = true; ring.classList.add('is-active'); x = tx; y = ty; }
    }, { passive: true });
    window.addEventListener('pointerleave', () => { ring.classList.remove('is-active'); active = false; });

    const tick = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(tick);
    };
    tick();

    const interactive = 'a, button, [data-magnetic], input, textarea, select, summary, [role="button"], .tile';
    document.addEventListener('pointerover', e => {
      ring.classList.toggle('is-hot', !!e.target.closest(interactive));
    });
  }

  /* ─── 14a. SECTION REVEAL OBSERVER (staggered children) ─── */
  function initSectionReveals() {
    const sections = $$('.section-folio');
    if (!sections.length) return;
    if (reduced) { sections.forEach(s => s.classList.add('is-in-view')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in-view'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    sections.forEach(s => io.observe(s));
  }

  /* ─── 14b. REVEAL FALLBACK (for browsers without animation-timeline) ─── */
  function initRevealFallback() {
    if (CSS.supports && CSS.supports('animation-timeline: view()')) return;
    const targets = $$('.in-view-target, .reveal-up, .reveal-side-l, .reveal-side-r, .reveal-scale');
    if (!targets.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in-view', 'in-view'); io.unobserve(e.target); }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(t => io.observe(t));
  }

})();
