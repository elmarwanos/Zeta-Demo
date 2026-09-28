(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  /* Read a CSS token as the browser resolved it, so canvas and SVG code follows the theme. */
  function token(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  /* Animation loop helpers, same idea as the Acmetel build: a loop only runs while its host is
     on screen and the tab is visible. */
  function makeLoop(render) {
    var raf = 0, lastT = null;
    function frame(t) {
      if (lastT == null) lastT = t;
      var dt = Math.min(100, t - lastT);
      lastT = t;
      render(dt, t);
      raf = requestAnimationFrame(frame);
    }
    return {
      start: function () { if (!raf) { lastT = null; raf = requestAnimationFrame(frame); } },
      stop: function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    };
  }
  function gateLoop(host, loop) {
    var onScreen = true;
    function sync() { (onScreen && !document.hidden) ? loop.start() : loop.stop(); }
    if (host && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(host);
    }
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  /* ========================================================================
     Theme switch
     ===================================================================== */
  (function theme() {
    var btn = document.getElementById('themeSwitch');
    if (!btn) return;
    function label() {
      var dark = root.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('zeta-theme', next); } catch (e) {}
      label();
      document.dispatchEvent(new CustomEvent('zeta:theme'));
    });
    label();
  })();

  /* ========================================================================
     Mobile nav + active link
     ===================================================================== */
  (function nav() {
    var toggle = document.getElementById('navToggle');
    var mobile = document.getElementById('navMobile');
    if (toggle && mobile) {
      function close() { mobile.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
      toggle.addEventListener('click', function () {
        var open = mobile.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      mobile.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
      window.addEventListener('resize', function () { if (window.innerWidth > 1100) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }

    var links = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    if (!('IntersectionObserver' in window)) return;
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var i = targets.indexOf(en.target);
        if (i < 0) return;
        if (current) current.classList.remove('is-active');
        current = links[i]; current.classList.add('is-active');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    targets.forEach(function (t) { if (t) io.observe(t); });
  })();

  /* ========================================================================
     The Z drawn as concentric route lines

     One Z polyline, offset into four parallel stripes. Corners are filleted with arcs that share
     one centre per corner, so the stripes nest the way the logo's loops do: the stripe that is
     innermost at the top corner is outermost at the bottom one, like a folded ribbon.
     Used twice: the hero (interactive, draws on load) and the solutions section background
     (one giant Z behind the cards, draws when the section scrolls into view).
     ===================================================================== */
  function buildZ(svg, opts) {
    var NS = 'http://www.w3.org/2000/svg';
    var P = [[118, 118], [528, 118], [112, 522], [522, 522]];
    var SPACING = 34, R0 = 78;
    var offsets = [-1.5, -0.5, 0.5, 1.5].map(function (k) { return k * SPACING; });

    function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
    function mul(a, s) { return [a[0] * s, a[1] * s]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
    function len(a) { return Math.hypot(a[0], a[1]); }
    function unit(a) { var l = len(a); return [a[0] / l, a[1] / l]; }

    var segs = [];
    for (var s = 0; s < 3; s++) {
      var u = unit(sub(P[s + 1], P[s]));
      segs.push({ a: P[s], b: P[s + 1], u: u, n: [-u[1], u[0]] });
    }
    var corners = [];
    for (var c = 1; c <= 2; c++) {
      var back = unit(sub(P[c - 1], P[c])), fwd = unit(sub(P[c + 1], P[c]));
      var bis = unit(add(back, fwd));
      var half = Math.acos(dot(back, fwd)) / 2;
      var centre = add(P[c], mul(bis, R0 / Math.sin(half)));
      var cross = segs[c - 1].u[0] * segs[c].u[1] - segs[c - 1].u[1] * segs[c].u[0];
      corners.push({ centre: centre, sweep: cross > 0 ? 1 : 0 });
    }
    function stripePath(d) {
      var lines = segs.map(function (sg) { return { q: add(sg.a, mul(sg.n, d)), n: sg.n, a: add(sg.a, mul(sg.n, d)), b: add(sg.b, mul(sg.n, d)) }; });
      var out = 'M' + lines[0].a[0].toFixed(1) + ' ' + lines[0].a[1].toFixed(1);
      for (var i = 0; i < 2; i++) {
        var C = corners[i].centre, li = lines[i], lo = lines[i + 1];
        var r = Math.max(6, Math.abs(dot(sub(C, li.q), li.n)));
        var tIn = sub(C, mul(li.n, dot(sub(C, li.q), li.n)));
        var tOut = sub(C, mul(lo.n, dot(sub(C, lo.q), lo.n)));
        out += ' L' + tIn[0].toFixed(1) + ' ' + tIn[1].toFixed(1);
        out += ' A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 ' + corners[i].sweep + ' ' + tOut[0].toFixed(1) + ' ' + tOut[1].toFixed(1);
      }
      out += ' L' + lines[2].b[0].toFixed(1) + ' ' + lines[2].b[1].toFixed(1);
      return out;
    }

    var stripes = [], packets = [];
    offsets.forEach(function (d, i) {
      var dAttr = stripePath(d);
      var base = document.createElementNS(NS, 'path');
      base.setAttribute('d', dAttr);
      base.setAttribute('class', 'zl zl--' + i);
      svg.appendChild(base);
      var glow = document.createElementNS(NS, 'path');
      glow.setAttribute('d', dAttr); glow.setAttribute('class', 'zp zp--glow');
      var pk = document.createElementNS(NS, 'path');
      pk.setAttribute('d', dAttr); pk.setAttribute('class', 'zp');
      svg.appendChild(glow); svg.appendChild(pk);
      var L = base.getTotalLength();
      stripes.push({ el: base, L: L, pts: null });
      packets.push({ el: pk, glow: glow, L: L, dash: 70 + i * 10, speed: (opts.speed || 150) + i * 28, phase: i * 0.31 * L });
    });

    packets.forEach(function (p) {
      [p.el, p.glow].forEach(function (el) {
        el.style.strokeDasharray = p.dash + ' ' + p.L;
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.6s';
      });
    });
    if (reduced) { packets.forEach(function (p) { p.el.remove(); p.glow.remove(); }); return; }

    /* Draw-in, staggered, then packets appear. Runs once, when `trigger` fires. */
    var drawn = false;
    function draw() {
      if (drawn) return; drawn = true;
      stripes.forEach(function (st, i) {
        st.el.style.strokeDasharray = st.L;
        st.el.style.strokeDashoffset = st.L;
        st.el.style.transition = 'stroke-dashoffset ' + (opts.drawSeconds || 1.6) + 's cubic-bezier(0.22,1,0.36,1) ' + (0.1 + i * 0.12) + 's';
        requestAnimationFrame(function () { requestAnimationFrame(function () { st.el.style.strokeDashoffset = 0; }); });
      });
      setTimeout(function () { packets.forEach(function (p) { p.el.style.opacity = ''; p.glow.style.opacity = ''; }); }, (opts.drawSeconds || 1.6) * 1000 + 300);
    }
    stripes.forEach(function (st) { st.el.style.strokeDasharray = st.L; st.el.style.strokeDashoffset = st.L; });
    if (opts.drawOnView && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { draw(); io.disconnect(); }
      }, { threshold: 0.05 });
      io.observe(opts.drawOnView);
    } else { draw(); }

    var t = 0;
    gateLoop(svg, makeLoop(function (dt) {
      t += dt / 1000;
      packets.forEach(function (p) {
        var off = -((t * p.speed + p.phase) % (p.L + p.dash));
        p.el.style.strokeDashoffset = off;
        p.glow.style.strokeDashoffset = off;
      });
    }));

    /* Optional: the stripe nearest the cursor turns red. */
    if (!opts.hover) return;
    function samples(st) {
      if (st.pts) return st.pts;
      var pts = [];
      for (var k = 0; k <= 80; k++) { var pt = st.el.getPointAtLength(st.L * k / 80); pts.push([pt.x, pt.y]); }
      return (st.pts = pts);
    }
    var hot = 0;
    opts.hover.addEventListener('mousemove', function (e) {
      var ctm = svg.getScreenCTM(); if (!ctm) return;
      var x = (e.clientX - ctm.e) / ctm.a, y = (e.clientY - ctm.f) / ctm.d;
      var best = -1, bestD = Infinity;
      stripes.forEach(function (st, i) {
        samples(st).forEach(function (pt) {
          var dd = (pt[0] - x) * (pt[0] - x) + (pt[1] - y) * (pt[1] - y);
          if (dd < bestD) { bestD = dd; best = i; }
        });
      });
      if (best !== hot && best >= 0) {
        stripes.forEach(function (st, i) { st.el.setAttribute('class', 'zl zl--' + (i === best ? 0 : i)); });
        hot = best;
      }
    });
  }

  (function heroZ() {
    var svg = document.getElementById('zlines');
    if (svg) buildZ(svg, { hover: document.getElementById('heroArt') });
  })();

  (function solutionsZ() {
    var svg = document.getElementById('zbg');
    if (svg) buildZ(svg, { drawOnView: document.getElementById('solutions'), drawSeconds: 2.4, speed: 110 });
  })();

  /* ========================================================================
     Hero stats count-up
     ===================================================================== */
  (function countUp() {
    var nums = document.querySelectorAll('.stat [data-count]');
    if (!nums.length) return;
    var t0 = performance.now();
    var dur = reduced ? 0 : 1500;
    function frame(now) {
      var p = dur ? Math.min(1, (now - t0) / dur) : 1;
      var eased = 1 - Math.pow(1 - p, 3);
      nums.forEach(function (el) {
        var target = parseFloat(el.getAttribute('data-count'));
        el.textContent = Math.round(target * eased) + (el.getAttribute('data-suffix') || '');
      });
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ========================================================================
     Sovereign stack scroll story
     ===================================================================== */
  (function stack() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.stackitem'));
    var layers = Array.prototype.slice.call(document.querySelectorAll('.stackdiagram .layer'));
    if (!items.length || !('IntersectionObserver' in window)) return;
    var order = items.map(function (it) { return it.getAttribute('data-layer'); });
    function activate(name) {
      var idx = order.indexOf(name);
      items.forEach(function (it) { it.classList.toggle('is-active', it.getAttribute('data-layer') === name); });
      layers.forEach(function (ly) {
        var li = order.indexOf(ly.getAttribute('data-layer'));
        ly.classList.toggle('is-active', li === idx);
        ly.classList.toggle('is-passed', li < idx);
      });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) activate(en.target.getAttribute('data-layer')); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    items.forEach(function (it) { io.observe(it); });
    // Clicking a layer scrolls its story item into view; the observer then lights it up.
    layers.forEach(function (ly) {
      ly.addEventListener('click', function () {
        var name = ly.getAttribute('data-layer');
        var target = document.getElementById('layer-' + name);
        if (!target) return;
        activate(name);
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      });
    });
  })();

  /* ========================================================================
     Backbone rail: progress line and one node per section
     ===================================================================== */
  (function rail() {
    var line = document.getElementById('railLine');
    var page = document.querySelector('.page');
    if (!line || !page) return;
    var sections = Array.prototype.slice.call(document.querySelectorAll('.page > section, .page > header, .page > footer'));
    var nodes = sections.map(function () { var n = document.createElement('span'); n.className = 'rail__node'; line.appendChild(n); return n; });
    function place() {
      var pageTop = page.getBoundingClientRect().top + window.scrollY;
      sections.forEach(function (sec, i) {
        var top = sec.getBoundingClientRect().top + window.scrollY - pageTop;
        nodes[i].style.top = (top + (i === 0 ? 24 : 0)) + 'px';
        nodes[i]._top = top + (i === 0 ? 24 : 0);
      });
    }
    function update() {
      var pageTop = page.getBoundingClientRect().top + window.scrollY;
      var y = window.scrollY + window.innerHeight * 0.45 - pageTop;
      var pct = Math.max(0, Math.min(100, y / page.offsetHeight * 100));
      line.style.setProperty('--rail-progress', pct + '%');
      nodes.forEach(function (n) { n.classList.toggle('is-passed', n._top <= y); });
    }
    place(); update();
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { update(); ticking = false; });
    }, { passive: true });
    window.addEventListener('resize', function () { place(); update(); });
    window.addEventListener('load', function () { place(); update(); });
  })();


  /* ========================================================================
     Pillar cards fly in from alternate sides as they reach the viewport
     ===================================================================== */
  (function flyIn() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.pillar'));
    if (!cards.length || reduced || !('IntersectionObserver' in window)) return;
    cards.forEach(function (c, i) { c.classList.add(i % 2 === 0 ? 'from-left' : 'from-right'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    cards.forEach(function (c) { io.observe(c); });
  })();

  /* ========================================================================
     Reveal: three grids only
     ===================================================================== */
  (function reveal() {
    var els = document.querySelectorAll('.news');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) return;
    els.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-visible');
        io.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ========================================================================
     BPO heartbeat
     ===================================================================== */
  (function heartbeat() {
    var cv = document.getElementById('pulseCanvas');
    if (!cv || !window.ZetaPulse) return;
    new window.ZetaPulse(cv, {
      mouseTarget: document.getElementById('pulseWrap'),
      colors: function () {
        return { line: token('--line'), ink: token('--ink-3'), red: token('--red') };
      }
    });
  })();
})();
