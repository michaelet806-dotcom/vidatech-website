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
    initNav();
    initPhoneClock();
    initLivingCall();
    initCounters();
    initStepsLine();
    initForm();
    initTileTilt();
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
      menu.addEventListener('click', () => {
        const open = menu.classList.toggle('is-open');
        drawer.classList.toggle('is-open', open);
        drawer.setAttribute('aria-hidden', String(!open));
        menu.setAttribute('aria-expanded', String(open));
      });
      $$('a', drawer).forEach(a =>
        a.addEventListener('click', () => {
          menu.classList.remove('is-open');
          drawer.classList.remove('is-open');
          menu.setAttribute('aria-expanded', 'false');
        })
      );
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
      { side: 'them', text: 'Hi — is this Vida Auto Body?', delay: 600 },
      { side: 'ai',   text: 'Vida Auto Body, this is the front desk — how can I help?', delay: 1100, typing: 700 },
      { side: 'them', text: "I think my brakes are grinding. Can someone look at it?", delay: 1500 },
      { side: 'ai',   text: "Absolutely. I can get you in tomorrow at 2:30 or Thursday at 10. Which works?", delay: 1400, typing: 800 },
      { side: 'them', text: "Tomorrow at 2:30, please.", delay: 1500 },
      { side: 'ai',   text: "Booked. I'll send a text confirmation now. Anything else?", delay: 1200, typing: 700, onShow: () => flyBooking() },
    ];

    let started = false;
    let timeoutIds = [];

    const flyBooking = () => {
      if (!fly) return;
      fly.classList.remove('is-flying');
      void fly.offsetWidth;
      fly.classList.add('is-flying');
      setTimeout(() => {
        if (calNew) calNew.classList.add('is-in');
      }, 1800);
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
      // Loop after a pause
      timeoutIds.push(setTimeout(() => {
        started = false;
        runScript();
      }, t + 6000));
    };

    const showTyping = (side) => {
      const b = document.createElement('div');
      b.className = `bubble bubble--${side === 'them' ? 'them' : 'ai'} is-typing`;
      b.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
      chat.appendChild(b);
      requestAnimationFrame(() => b.classList.add('is-in'));
      pruneChat();
    };

    const showBubble = (line) => {
      const typing = chat.querySelector('.is-typing');
      if (typing) typing.remove();
      const b = document.createElement('div');
      b.className = `bubble bubble--${line.side === 'them' ? 'them' : 'ai'}`;
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
        b.className = `bubble bubble--${line.side === 'them' ? 'them' : 'ai'} is-in`;
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
        errBox.style.display = 'block';
        errBox.innerHTML = 'Please add your name and email.';
        return;
      }

      okBox.style.display  = 'none';
      errBox.style.display = 'none';
      btnTxt.style.display = 'none';
      btnLoad.style.display = 'inline';
      submit.disabled = true;

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) { form.reset(); okBox.style.display = 'block'; }
        else throw new Error();
      } catch {
        errBox.style.display = 'block';
        errBox.innerHTML = 'Something went wrong. Email us at <a href="mailto:coo@vidatech.org">coo@vidatech.org</a>';
      } finally {
        btnTxt.style.display = 'inline';
        btnLoad.style.display = 'none';
        submit.disabled = false;
      }
    });
  }

})();
