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

     One Z polyline, offset into four parallel stripes, plus the logo's "t" crossbar. Corners are filleted with arcs that share
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

    /* The "t" of the logo. As in the mark, the crossbar grows out of the third stripe (T_FROM),
       cuts through the stripes outside it, and ends in a hairpin loop with a stub inside it.
       The outer stripes are masked in one band around the crossbar, so it reads as passing over them. */
    var T_FROM = 2, T_CY = 300, T_R = SPACING;
    function crossbarLines() {
      var sg = segs[1], A = add(sg.a, mul(sg.n, offsets[T_FROM]));
      function xAt(y) { return A[0] + (y - A[1]) / sg.u[1] * sg.u[0]; }
      var cx = xAt(T_CY - T_R) + 2 * SPACING + 20;
      return {
        cx: cx,
        loop: 'M' + xAt(T_CY - T_R).toFixed(1) + ' ' + (T_CY - T_R) + ' L' + cx.toFixed(1) + ' ' + (T_CY - T_R) +
          ' A' + T_R + ' ' + T_R + ' 0 0 1 ' + cx.toFixed(1) + ' ' + (T_CY + T_R) + ' L' + xAt(T_CY + T_R).toFixed(1) + ' ' + (T_CY + T_R),
        stub: 'M' + xAt(T_CY).toFixed(1) + ' ' + T_CY + ' L' + cx.toFixed(1) + ' ' + T_CY
      };
    }
    var t = crossbarLines();

    var maskId = svg.id + '-tcut';
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<mask id="' + maskId + '" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1040" height="1040">' +
      '<rect x="-200" y="-200" width="1040" height="1040" fill="#fff"/>' +
      '<path d="' + t.stub + '" fill="none" stroke="#000" stroke-width="' + (2 * T_R + 30) + '" stroke-linecap="round"/></mask>';
    svg.appendChild(defs);
    var cut = document.createElementNS(NS, 'g');
    cut.setAttribute('mask', 'url(#' + maskId + ')');
    svg.appendChild(cut);

    var stripes = [], packets = [];
    offsets.map(stripePath).concat([t.loop, t.stub]).forEach(function (dAttr, i) {
      // Stripes outside the crossbar's source stripe get the crossing gaps.
      var host = i < T_FROM ? cut : svg;
      var base = document.createElementNS(NS, 'path');
      base.setAttribute('d', dAttr);
      base.setAttribute('class', 'zl zl--' + i);
      host.appendChild(base);
      var glow = document.createElementNS(NS, 'path');
      glow.setAttribute('d', dAttr); glow.setAttribute('class', 'zp zp--glow');
      var pk = document.createElementNS(NS, 'path');
      pk.setAttribute('d', dAttr); pk.setAttribute('class', 'zp');
      host.appendChild(glow); host.appendChild(pk);
      var L = base.getTotalLength();
      stripes.push({ el: base, L: L, pts: null });
      var bar = i >= offsets.length;
      packets.push({ el: pk, glow: glow, L: L, dash: bar ? 40 : 70 + i * 10, speed: (opts.speed || 150) * (bar ? 0.5 : 1) + (bar ? 0 : i * 28), phase: i * 0.31 * L });
    });

    packets.forEach(function (p) {
      [p.el, p.glow].forEach(function (el) {
        el.style.strokeDasharray = p.dash + ' ' + p.L;
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.6s';
      });
    });
    if (reduced) { packets.forEach(function (p) { p.el.remove(); p.glow.remove(); }); return { replay: function () {} }; }

    /* Draw-in, staggered, then packets appear. Runs once, when `trigger` fires, and again on replay(). */
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
    var api = {
      // Used by the hero art switch: wipe the lines and draw them in again.
      replay: function () {
        packets.forEach(function (p) { p.el.style.opacity = '0'; p.glow.style.opacity = '0'; });
        stripes.forEach(function (st) { st.el.style.transition = 'none'; st.el.style.strokeDashoffset = st.L; });
        drawn = false; draw();
      }
    };
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
    if (!opts.hover) return api;
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
        // The crossbar belongs to its source stripe, so it lights up with it.
        var hotT = best === T_FROM || best >= offsets.length;
        stripes.forEach(function (st, i) {
          var on = i === best || (hotT && (i === T_FROM || i >= offsets.length));
          st.el.setAttribute('class', 'zl zl--' + (on ? 0 : i));
        });
        hot = best;
      }
    });
    return api;
  }

  /* ========================================================================
     Hero, direction B: the logo's line bundle fans out into five routes, one per business, each
     ending at a labelled node. Every route is a link to its business further down the page.
     ===================================================================== */
  function buildRoutes(svg) {
    var NS = 'http://www.w3.org/2000/svg';
    var LANES = [
      ['Voice Termination', 'Wholesale voice on our LDI gateway', '#voice'],
      ['Digital Mobile Services', 'SMS, WhatsApp, email and Zekli', '#dms'],
      ['CLS', 'Cable landing station on the Pak-China fibre', '#cls'],
      ['Sovereign Intelligence Stack', 'Cloud and data centre in Pakistan', '#stack'],
      ['BPO Solutions', 'Operations run by a carrier team', '#bpo']
    ];
    var IN_Y = 320, IN_GAP = 18, X0 = 16, FAN0 = 110, FAN1 = 250, X1 = 612, TOP = 96, STEP = 112;
    var lanes = [];
    function setHot(k) { lanes.forEach(function (ln, i) { ln.g.classList.toggle('is-hot', i === k); }); }
    LANES.forEach(function (txt, i) {
      var yIn = IN_Y + (i - 2) * IN_GAP, yOut = TOP + i * STEP, mid = (FAN0 + FAN1) / 2;
      var d = 'M' + X0 + ' ' + yIn + ' L' + FAN0 + ' ' + yIn +
        ' C' + mid + ' ' + yIn + ' ' + mid + ' ' + yOut + ' ' + FAN1 + ' ' + yOut + ' L' + X1 + ' ' + yOut;
      var g = document.createElementNS(NS, 'a');
      g.setAttribute('href', txt[2]);
      g.setAttribute('class', 'route' + (i === 2 ? ' is-hot' : ''));
      g.setAttribute('aria-label', txt[0] + ': ' + txt[1]);
      // The hit area covers the whole fanned lane, not just the thin line.
      g.innerHTML = '<rect class="route__hit" x="' + FAN0 + '" y="' + (yOut - STEP / 2) + '" width="' + (X1 - FAN0 + 24) + '" height="' + STEP + '"/>' +
        '<path class="route__line" d="' + d + '"/>' +
        '<path class="zp zp--glow" d="' + d + '"/><path class="zp" d="' + d + '"/>' +
        '<circle class="route__node" cx="' + X1 + '" cy="' + yOut + '" r="9"/>' +
        '<text class="route__name" x="' + (FAN1 + 20) + '" y="' + (yOut - 22) + '">' + txt[0] + '</text>' +
        '<text class="route__sub" x="' + (FAN1 + 20) + '" y="' + (yOut + 34) + '">' + txt[1] + '</text>';
      svg.appendChild(g);
      g.addEventListener('mouseenter', function () { setHot(i); });
      g.addEventListener('focus', function () { setHot(i); });
      var line = g.querySelector('.route__line'), L = line.getTotalLength();
      lanes.push({ g: g, line: line, L: L, pk: [g.querySelectorAll('.zp')[0], g.querySelectorAll('.zp')[1]],
        dash: 60, speed: 130 + i * 14, phase: i * 0.23 * L });
    });
    if (reduced) { lanes.forEach(function (ln) { ln.pk.forEach(function (el) { el.remove(); }); }); return { replay: function () {} }; }

    lanes.forEach(function (ln) { ln.pk.forEach(function (el) { el.style.strokeDasharray = ln.dash + ' ' + ln.L; el.style.transition = 'opacity 0.6s'; }); });
    var timer = 0;
    function draw() {
      svg.classList.remove('is-drawn');
      lanes.forEach(function (ln) {
        ln.pk.forEach(function (el) { el.style.opacity = '0'; });
        ln.line.style.transition = 'none';
        ln.line.style.strokeDasharray = ln.L; ln.line.style.strokeDashoffset = ln.L;
      });
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        lanes.forEach(function (ln, i) {
          ln.line.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1) ' + (0.1 + i * 0.1) + 's, stroke 0.3s, opacity 0.3s';
          ln.line.style.strokeDashoffset = 0;
        });
        svg.classList.add('is-drawn');
      }); });
      clearTimeout(timer);
      timer = setTimeout(function () { lanes.forEach(function (ln) { ln.pk.forEach(function (el) { el.style.opacity = ''; }); }); }, 2000);
    }
    draw();

    var t = 0;
    gateLoop(svg, makeLoop(function (dt) {
      t += dt / 1000;
      lanes.forEach(function (ln) {
        var off = -((t * ln.speed + ln.phase) % (ln.L + ln.dash));
        ln.pk.forEach(function (el) { el.style.strokeDashoffset = off; });
      });
    }));
    return { replay: draw };
  }

  /* Hero art: the Z and the five routes are both built; the switch under the art shows one.
     ?hero=routes opens on the routes, and the switch keeps the URL in step so it can be shared. */
  (function heroArt() {
    var art = document.getElementById('heroArt');
    var zsvg = document.getElementById('zlines'), rsvg = document.getElementById('routes');
    if (!art || !zsvg || !rsvg) return;
    var views = {
      z: buildZ(zsvg, { hover: art }),
      routes: buildRoutes(rsvg)
    };
    var btns = Array.prototype.slice.call(document.querySelectorAll('[data-hero-set]'));
    function current() { return root.getAttribute('data-hero') === 'routes' ? 'routes' : 'z'; }
    function sync() { btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-hero-set') === current() ? 'true' : 'false'); }); }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var next = b.getAttribute('data-hero-set');
        if (next === current()) return;
        if (next === 'routes') root.setAttribute('data-hero', 'routes'); else root.removeAttribute('data-hero');
        sync();
        views[next].replay();
        try {
          var url = new URL(location.href);
          if (next === 'routes') url.searchParams.set('hero', 'routes'); else url.searchParams.delete('hero');
          history.replaceState(null, '', url);
        } catch (e) {}
      });
    });
    sync();
  })();

  (function solutionsZ() {
    var svg = document.getElementById('zbg');
    if (!svg) return;
    // Wide screens stretch the Z over the whole section; narrow ones keep its proportions and pin it.
    var mq = window.matchMedia('(max-width: 1100px)');
    function fit() { svg.setAttribute('preserveAspectRatio', mq.matches ? 'xMidYMid meet' : 'none'); }
    fit(); mq.addEventListener ? mq.addEventListener('change', fit) : mq.addListener(fit);
    buildZ(svg, { drawOnView: document.getElementById('solutions'), drawSeconds: 2.4, speed: 110 });
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
