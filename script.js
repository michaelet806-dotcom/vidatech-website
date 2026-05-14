/* ═══════════════════════════════════════════════
   VidaTech AXIS·OS — Vanilla JS
═══════════════════════════════════════════════ */

(() => {
  'use strict';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    initNav();
    initScrollMark();
    initBootTicker();
    initGridFlicker();
    initOpsFloor();
    initPaletteQuery();
    initSectionReveals();
    initForm();
  }

  /* ─── NAV ─── */
  function initNav(){
    const nav = $('#nav'), menu = $('#navMenu'), drawer = $('#drawer');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 12);
    onScroll();
    addEventListener('scroll', onScroll, { passive:true });
    if (!menu || !drawer) return;
    const setOpen = (open) => {
      menu.classList.toggle('is-open', open);
      drawer.classList.toggle('is-open', open);
      drawer.toggleAttribute('inert', !open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    menu.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
    $$('a', drawer).forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setOpen(false); });
  }

  /* ─── SCROLL PROGRESS ─── */
  function initScrollMark(){
    const m = $('#scrollMark');
    if (!m || reduced) return;
    let raf;
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      m.style.width = (max > 0 ? (scrollY / max) * 100 : 0).toFixed(2) + '%';
    };
    update();
    addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive:true });
  }

  /* ─── BOOT TICKER (hero) ─── */
  function initBootTicker(){
    const text = $('#bootText');
    if (!text || reduced) return;
    const lines = [
      'vidatech boot --company "your_co"',
      '[OK] AI Receptionist online · 24/7',
      '[OK] Chief of Staff online · 3 agents',
      '[OK] Security/SRE online · 4 agents',
      '[OK] Engineering online · 12 agents',
      '[OK] Marketing online · 21 agents',
      '[OK] 11 more departments...',
      'vidatech ready. uptime 99.98% · 88 agents online'
    ];
    let i = 0;
    setInterval(() => {
      i = (i + 1) % lines.length;
      text.textContent = lines[i];
    }, 2200);
  }

  /* ─── GRID FLICKER (hero right side) ─── */
  function initGridFlicker(){
    const tiles = $$('.tile-mini');
    if (!tiles.length || reduced) return;
    setInterval(() => {
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      t.classList.add('is-active');
      setTimeout(() => t.classList.remove('is-active'), 700);
    }, 1500);
  }

  /* ─── OPS FLOOR — streaming agent activity ─── */
  function initOpsFloor(){
    const floor = $('#opsFloor');
    if (!floor) return;
    const cells = $$('.ops__cell', floor);
    const tasksToday = $('#tasksToday');
    let taskCount = 1247;

    // Each agent has a queue of scripted messages
    const scripts = {
      'SALES.outreach':   ['drafted 12 emails to Series A founders... sent.','calling 3 inbound leads — 2 booked.','responded to RFP from acme.com.','outreach to 47 prospects scheduled.','follow-up sent to deal #2284.'],
      'FINANCE.cash':     ['runway: 14.2 months. no anomalies.','reconciled May AP — $48,200 cleared.','monthly close report ready.','vendor invoice flagged for review.','q3 forecast updated.'],
      'LEGAL.review':     ['reviewed MSA from acme corp · 3 flags.','redlined NDA from new vendor.','indemnity clause approved.','export-control check complete.','compliance audit prep done.'],
      'DESIGN.brand':     ['new asset approved: hero_v3.png','brand audit complete · 2 inconsistencies.','5 social variants generated.','icon set ready for review.','typography scale finalized.'],
      'ENG.deploy':       ['shipped v2.4.1 to prod · all tests pass.','rollback ready · zero downtime.','perf regression caught + reverted.','db migration scheduled 2:00 UTC.','dependency upgrade complete.'],
      'MKT.seo':          ['indexed 14 new programmatic pages.','core web vitals: LCP 1.4s.','keyword cluster gain: +127 ranks.','3 backlinks earned this hour.','content brief delivered.'],
      'SECURITY.scan':    ['no anomalies · last scan 4m ago.','3 dependencies patched.','SOC2 evidence collected.','phishing simulation deployed.','firewall rules updated.'],
      'CHIEFOFSTAFF':     ['routed 14 tasks · 0 backlog.','your weekly digest is ready.','3 decisions need your input.','calendar optimized · 2 hrs reclaimed.','team standups summarized.'],
    };
    const indexes = {};
    cells.forEach(c => { indexes[c.dataset.agent] = 0; });

    const renderCell = (cell) => {
      const agent = cell.dataset.agent;
      const queue = scripts[agent] || [];
      const idx = indexes[agent] % queue.length;
      const body = cell.querySelector('[data-msg]');
      const time = cell.querySelector('.ops__cell-time');
      if (body) typewriter(body, queue[idx], 12);
      if (time) {
        const now = new Date();
        time.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
      }
      cell.classList.add('is-active');
      setTimeout(() => cell.classList.remove('is-active'), 1800);
      indexes[agent]++;
    };

    const typewriter = (el, text, speed) => {
      if (reduced) { el.textContent = text; return; }
      el.textContent = '';
      let i = 0;
      const tick = () => {
        if (i <= text.length) { el.textContent = text.slice(0, i); i++; setTimeout(tick, speed); }
      };
      tick();
    };

    let intervalId = null;
    let initialKick = null;
    const start = () => {
      if (intervalId) return; // Already running — don't restack
      // Stagger initial render
      cells.forEach((c, i) => setTimeout(() => renderCell(c), i * 360));
      initialKick = setTimeout(() => {
        // Then random ones every ~2.4s
        intervalId = setInterval(() => {
          renderCell(cells[Math.floor(Math.random() * cells.length)]);
          if (tasksToday) {
            taskCount += Math.floor(Math.random() * 3) + 1;
            tasksToday.textContent = taskCount.toLocaleString();
          }
        }, 2400);
      }, cells.length * 360 + 400);
    };
    const stop = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      if (initialKick) { clearTimeout(initialKick); initialKick = null; }
    };

    if (reduced) {
      cells.forEach(c => {
        const agent = c.dataset.agent;
        const body = c.querySelector('[data-msg]');
        const time = c.querySelector('.ops__cell-time');
        if (body) body.textContent = scripts[agent][0];
        if (time) time.textContent = '—';
      });
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => e.isIntersecting ? start() : stop());
    }, { threshold:0.15 });
    io.observe(floor);
  }

  /* ─── PALETTE QUERY CYCLING (with matching results) ─── */
  function initPaletteQuery(){
    const q = $('#paletteQuery');
    const results = $('#paletteResults');
    if (!q || !results || reduced) return;

    const scenarios = [
      {
        query: 'draft a Q4 board update',
        rows: [
          { dept:'CS', title:'Draft quarterly board update',     deptName:'Chief of Staff', time:'~6 min' },
          { dept:'FN', title:'Build Q4 financial summary',       deptName:'Finance',         time:'~4 min' },
          { dept:'PR', title:'Pull Q4 product metrics',          deptName:'Product',         time:'~2 min' },
          { dept:'SL', title:'Pipeline state & forecast',        deptName:'Sales',           time:'~3 min' },
          { dept:'DT', title:'Cohort retention summary',         deptName:'Data',            time:'~4 min' },
        ],
      },
      {
        query: 'audit our SOC2 readiness',
        rows: [
          { dept:'SR', title:'Run SOC2 control gap analysis',    deptName:'Security · SRE',  time:'~12 min' },
          { dept:'LG', title:'Review existing policy library',   deptName:'Legal',           time:'~5 min' },
          { dept:'EN', title:'Audit access controls & logs',     deptName:'Engineering',     time:'~8 min' },
          { dept:'CS', title:'Draft remediation plan',           deptName:'Chief of Staff',  time:'~3 min' },
          { dept:'OP', title:'Build vendor risk register',       deptName:'Operations',      time:'~6 min' },
        ],
      },
      {
        query: 'build the marketing plan for our Q1 launch',
        rows: [
          { dept:'MK', title:'Build launch campaign architecture',deptName:'Marketing',      time:'~9 min' },
          { dept:'PM', title:'Plan paid media + budget',         deptName:'Paid Media',      time:'~5 min' },
          { dept:'DS', title:'Generate creative variants',       deptName:'Design · UX',     time:'~7 min' },
          { dept:'CM', title:'Draft PR + press list',            deptName:'Comms · PR',      time:'~4 min' },
          { dept:'CX', title:'Build onboarding email flow',      deptName:'Customer Success',time:'~6 min' },
        ],
      },
      {
        query: 'find churn signals in last 90 days',
        rows: [
          { dept:'DT', title:'Score churn risk by cohort',       deptName:'Data',            time:'~5 min' },
          { dept:'CX', title:'Tag at-risk accounts in CRM',      deptName:'Customer Success',time:'~3 min' },
          { dept:'PR', title:'Cross-check product usage drops',  deptName:'Product',         time:'~4 min' },
          { dept:'SL', title:'Draft retention outreach',         deptName:'Sales',           time:'~4 min' },
          { dept:'FN', title:'Forecast revenue impact',          deptName:'Finance',         time:'~3 min' },
        ],
      },
    ];

    const render = (scn) => {
      q.textContent = scn.query;
      results.innerHTML = scn.rows.map((r, i) =>
        `<li class="palette__row${i === 0 ? ' palette__row--hot' : ''}">
          <span class="mono palette__dept">${r.dept}</span>
          <span class="palette__title">${r.title}</span>
          <span class="mono palette__dept-name">${r.deptName}</span>
          <span class="mono palette__time">${r.time}</span>
        </li>`
      ).join('');
    };

    render(scenarios[0]);
    let i = 0;
    setInterval(() => {
      i = (i + 1) % scenarios.length;
      render(scenarios[i]);
    }, 4200);
  }

  /* ─── SECTION REVEALS ─── */
  function initSectionReveals(){
    const sections = $$('.section');
    if (!sections.length || reduced) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in-view'); io.unobserve(e.target); }});
    }, { threshold:0.12 });
    sections.forEach(s => io.observe(s));
  }

  /* ─── CONTACT FORM ─── */
  function initForm(){
    const form    = $('#contactForm');
    const btnTxt  = $('#formBtnText');
    const btnLoad = $('#formBtnLoading');
    const okBox   = $('#formSuccess');
    const errBox  = $('#formError');
    const submit  = $('#formSubmit');
    if (!form) return;

    // Constrain date picker: earliest = tomorrow, latest = +60 days
    const dateEl = $('#f-date');
    if (dateEl) {
      const today = new Date();
      const min = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const max = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
      const fmt = d => d.toISOString().slice(0, 10);
      dateEl.min = fmt(min);
      dateEl.max = fmt(max);
      // Default to 2 business days out
      const def = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
      if (def.getDay() === 0) def.setDate(def.getDate() + 1); // Sun → Mon
      if (def.getDay() === 6) def.setDate(def.getDate() + 2); // Sat → Mon
      dateEl.value = fmt(def);
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        name:     form.name?.value.trim() || '',
        email:    form.email?.value.trim() || '',
        phone:    form.phone?.value.trim() || '',
        business: form.business?.value.trim() || '',
        type:     form.type?.value || '',
        size:     form.size?.value || '',
        date:     form.date?.value || '',
        time:     form.time?.value || '',
        message:  form.message?.value.trim() || '',
      };
      let missing = '';
      if (!data.name) missing = 'name';
      else if (!data.email) missing = 'email';
      else if (!data.date) missing = 'date';
      else if (!data.time) missing = 'time';
      // Clear any prior aria-invalid markers
      ['name','email','phone','date','time','company','type','size','msg'].forEach(id => {
        const el = $(`#f-${id}`);
        if (el) { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
      });
      if (missing) {
        errBox.hidden = true;
        requestAnimationFrame(() => {
          errBox.textContent = `Please add your ${missing === 'date' || missing === 'time' ? 'preferred ' + missing : missing}.`;
          errBox.hidden = false;
        });
        const target = $(`#f-${missing}`);
        if (target) {
          target.setAttribute('aria-invalid', 'true');
          target.setAttribute('aria-describedby', 'formError');
          target.focus();
        }
        return;
      }
      const statusBox = $('#formStatus');
      okBox.hidden = true; errBox.hidden = true;
      btnTxt.hidden = true; btnLoad.hidden = false;
      submit.disabled = true; submit.setAttribute('aria-busy','true');
      if (statusBox) statusBox.textContent = 'Submitting your booking…';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, source: 'vidatech.org' }),
        });
        if (res.ok) {
          form.reset();
          okBox.hidden = false;
          okBox.setAttribute('tabindex','-1');
          okBox.focus();
          if (statusBox) statusBox.textContent = 'Booked. Calendar invite and welcome email sent.';
        } else {
          let errText = 'Something went wrong. Email us at vidaholdings@gmail.com';
          try {
            const j = await res.json();
            if (j && j.error) errText = j.error;
          } catch {}
          throw new Error(errText);
        }
      } catch (e) {
        errBox.hidden = false;
        errBox.innerHTML = (e && e.message) ? escapeHtml(e.message) + ' &middot; <a href="mailto:vidaholdings@gmail.com">email us</a>'
          : 'Something went wrong. Email us at <a href="mailto:vidaholdings@gmail.com">vidaholdings@gmail.com</a>';
        if (statusBox) statusBox.textContent = 'Submission failed. ' + (e?.message || '');
      } finally {
        btnTxt.hidden = false; btnLoad.hidden = true;
        submit.disabled = false; submit.removeAttribute('aria-busy');
      }
    });
    // Tiny escape util for the error message
    function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
  }

})();
