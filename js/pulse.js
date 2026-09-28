/* Zeta "operations heartbeat": a canvas ECG line for the BPO section.
   Rebuilt for Zeta's palette: ink-coloured trace resolving to brand red at the live edge,
   on the theme's raised surface. Colours are read from CSS tokens so the theme switch applies. */
(function () {
  'use strict';

  function Pulse(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.mouseX = null;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._t0 = performance.now();
    this._raf = 0;
    this._onScreen = true;
    this._colors = this.opts.colors ? this.opts.colors() : { line: 'rgba(0,0,0,.15)', ink: '#666', red: '#E3151D' };
    var self = this;
    document.addEventListener('zeta:theme', function () {
      self._colors = self.opts.colors ? self.opts.colors() : self._colors;
      if (self.reduced) self._draw(0.5);
    });
    this._bind();
    this._tick = this._tick.bind(this);
    if (this.reduced) { this._draw(0.5); return; }
    this._gate();
    this._sync();
  }

  Pulse.prototype._gate = function () {
    var self = this;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        self._onScreen = entries[0].isIntersecting;
        self._sync();
      }, { threshold: 0 }).observe(this.canvas);
    }
    document.addEventListener('visibilitychange', function () { self._sync(); });
  };
  Pulse.prototype._sync = function () {
    if (this._onScreen && !document.hidden) {
      if (!this._raf) this._raf = requestAnimationFrame(this._tick);
    } else if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  };
  Pulse.prototype._bind = function () {
    var self = this;
    var host = this.opts.mouseTarget || this.canvas;
    host.addEventListener('mousemove', function (e) {
      var r = self.canvas.getBoundingClientRect();
      self.mouseX = e.clientX - r.left;
    });
    host.addEventListener('mouseleave', function () { self.mouseX = null; });
  };
  Pulse.prototype._tick = function (now) {
    this._draw((now - this._t0) / 1000);
    this._raf = requestAnimationFrame(this._tick);
  };

  function ecg(u) {
    var v = 0;
    v += Math.exp(-Math.pow((u - 0.5) * 34, 2)) * 1.0;
    v -= Math.exp(-Math.pow((u - 0.57) * 44, 2)) * 0.32;
    v += Math.exp(-Math.pow((u - 0.32) * 26, 2)) * 0.16;
    v += Math.exp(-Math.pow((u - 0.72) * 30, 2)) * 0.12;
    return v;
  }

  Pulse.prototype._draw = function (t) {
    var cv = this.canvas, ctx = this.ctx, col = this._colors;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr)) { cv.width = w * dpr; cv.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var cy = h * 0.58;

    // Ruled grid, the same hairline as the rest of the page.
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 1;
    for (var gx = 0.5; gx < w; gx += 48) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(w, cy + 0.5); ctx.stroke();

    var xoff = t * 110;
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(120,120,120,0)');
    grad.addColorStop(0.45, col.ink);
    grad.addColorStop(1, col.red);
    var mpx = this.mouseX;
    var amp = function (x) { return 46 * (1 + (mpx != null ? 0.9 * Math.exp(-Math.pow((x - mpx) / 90, 2)) : 0)); };
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var x = 0; x <= w; x += 2) {
      var u = (((x + xoff) / 280) % 1 + 1) % 1;
      var y = cy - ecg(u) * amp(x);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Live edge marker.
    var peakX = w - 72;
    var pu = (((peakX + xoff) / 280) % 1 + 1) % 1;
    var py = cy - ecg(pu) * amp(peakX);
    ctx.fillStyle = col.red;
    ctx.beginPath(); ctx.arc(peakX, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(peakX, py, 11, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  };

  window.ZetaPulse = Pulse;
})();
