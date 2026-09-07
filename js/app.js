/* ===========================================================================
   CrowCaps · app.js
   Sin dependencias. Todo lo que se anima degrada solo: si el JS falla, la
   pagina sigue siendo navegable y el grid ya viene renderizado en el HTML.
   =========================================================================== */
(function () {
  'use strict';

  var P = window.CROWCAPS_PRODUCTS || [];
  var WA = '573207224241';
  var IMG = 'assets/img/';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- 1. Loader ---------- */
  (function loader() {
    var el = $('#loader'), bar = $('#loaderBar'), pct = $('#loaderPct');
    if (!el) return;
    document.body.classList.add('is-locked');
    var v = 0, done = false;
    var tick = setInterval(function () {
      v = Math.min(v + Math.random() * 16 + 6, done ? 100 : 88);
      if (bar) bar.style.right = (100 - v) + '%';
      if (pct) pct.textContent = v < 10 ? '0' + Math.round(v) : Math.round(v);
      if (v >= 100) { clearInterval(tick); finish(); }
    }, 110);

    function ready() { done = true; v = Math.max(v, 92); }
    if (document.readyState === 'complete') ready();
    else window.addEventListener('load', ready);
    setTimeout(ready, 2200); // techo duro: nunca bloquear al usuario

    var ended = false;
    function finish() {
      if (ended) return; ended = true;
      document.documentElement.classList.add('is-loaded');
      setTimeout(function () {
        document.body.classList.remove('is-locked');
        var hero = $('#hero'); if (hero) hero.classList.add('is-ready');
        el.style.display = 'none';
      }, reduce ? 0 : 440);
    }
  })();

  /* ---------- 2. Nav + menu movil ---------- */
  (function nav() {
    var onScroll = function () {
      document.documentElement.classList.toggle('is-stuck', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var burger = $('#burger');
    if (!burger) return;
    var close = function () {
      document.documentElement.classList.remove('is-menu');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
    };
    burger.addEventListener('click', function () {
      var open = document.documentElement.classList.toggle('is-menu');
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('is-locked', open);
    });
    $$('#mmenu [data-close]').forEach(function (a) { a.addEventListener('click', close); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  })();

  /* ---------- 3. Reveal al hacer scroll ---------- */
  (function reveal() {
    var items = $$('.reveal');
    if (!items.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    items.forEach(function (n) { io.observe(n); });
    // red de seguridad: nada se queda invisible
    setTimeout(function () { items.forEach(function (n) { n.classList.add('is-in'); }); }, 4000);
  })();

  /* ---------- 4. Ticker ---------- */
  (function ticker() {
    var rows = [$('#tickRow'), $('#tickRow2')].filter(Boolean);
    if (!rows.length) return;
    var words = ['Crowcaps', 'Streetwear', 'Medellín', 'Envíos gratis', 'Crowcaps', 'Colombia'];
    var html = words.map(function (w, i) {
      return '<span' + (i % 2 ? ' class="o"' : '') + '>' + w + '</span>' +
        (i === 2 ? '<img src="assets/brand/mascot.webp" width="320" height="286" alt="" loading="lazy">' : '<span>·</span>');
    }).join('');
    rows.forEach(function (r) { r.innerHTML = html; });
  })();

  /* ---------- 5. Hero: selector de gorra destacada ---------- */
  (function heroPick() {
    var wrap = $('#heroPick'), img = $('#heroImg'), tag = $('#heroTag');
    if (!wrap || !img || !P.length) return;
    var ids = ['yankees-navy-hueso', 'redsox-khaki-roja', 'padres-rosa-azul'];
    var picks = ids.map(function (id) {
      return P.filter(function (p) { return p.id === id; })[0];
    }).filter(Boolean);
    if (picks.length < 2) return;

    picks.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      b.setAttribute('aria-label', 'Ver ' + p.name);
      b.innerHTML = '<img src="' + IMG + p.imgs[0].replace('.webp', '-sm.webp') + '" width="170" height="212" alt="" loading="lazy" decoding="async">';
      b.addEventListener('click', function () {
        $$('button', wrap).forEach(function (x) { x.setAttribute('aria-current', 'false'); });
        b.setAttribute('aria-current', 'true');
        img.classList.add('is-out');
        setTimeout(function () {
          img.src = IMG + p.imgs[0];
          img.alt = 'Gorra ' + p.name + ' — ' + p.colorway;
          if (tag) tag.textContent = p.name;
          img.classList.remove('is-out');
        }, reduce ? 0 : 220);
      });
      wrap.appendChild(b);
    });
  })();

  /* ---------- 6. Filtros, buscador y tandas ---------- */
  (function coleccion() {
    var chips = $('#chips'), grid = $('#grid'), q = $('#q'), empty = $('#empty');
    var more = $('#more'), moreBtn = $('#moreBtn'), moreTxt = $('#moreTxt'), tally = $('#tally');
    if (!chips || !grid) return;

    var PASO = 12;                 // cuantas gorras entran por tanda
    var cards = $$('.card', grid);
    var limite = PASO;
    var active = 'todas';

    var count = {};
    P.forEach(function (p) { p.colors.forEach(function (c) { count[c] = (count[c] || 0) + 1; }); });

    var defs = [
      ['todas', 'Todas', P.length],
      ['negras', 'Negras', count.negras],
      ['blancas', 'Blancas', count.blancas],
      ['beige', 'Beige', count.beige],
      ['rojas', 'Rojas', count.rojas],
      ['azules', 'Azules', count.azules],
      ['bicolor', 'Bicolor', count.bicolor]
    ];

    defs.forEach(function (d) {
      if (!d[2]) return;
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.dataset.f = d[0];
      b.setAttribute('aria-pressed', String(d[0] === 'todas'));
      b.innerHTML = d[1] + '<b>' + d[2] + '</b>';
      b.addEventListener('click', function () {
        active = d[0]; limite = PASO;
        $$('.chip', chips).forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        apply();
      });
      chips.appendChild(b);
    });

    function norm(s2) {
      return (s2 || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function apply(foco) {
      var term = norm(q ? q.value.trim() : '');
      var visto = 0, total = 0, primeroNuevo = null;
      cards.forEach(function (c) {
        var okF = active === 'todas' || (c.dataset.colors || '').split(' ').indexOf(active) > -1;
        var okQ = !term || norm(c.dataset.search).indexOf(term) > -1;
        if (okF && okQ) {
          total++;
          var dentro = visto < limite;
          if (dentro) {
            if (foco && c.classList.contains('is-hidden') && !primeroNuevo) primeroNuevo = c;
            visto++;
          }
          c.classList.toggle('is-hidden', !dentro);
        } else {
          c.classList.add('is-hidden');
        }
      });

      // La ficha grande solo tiene sentido cuando la tanda esta completa.
      cards.forEach(function (c) {
        if (c.classList.contains('card--big')) c.classList.toggle('no-span', total < 6);
      });

      if (empty) empty.hidden = total > 0;
      grid.hidden = total === 0;
      if (tally) tally.textContent = total ? visto + ' / ' + total : '';
      if (more) {
        var faltan = total - visto;
        more.hidden = faltan <= 0;
        if (moreTxt) moreTxt.textContent = 'Ver ' + Math.min(PASO, faltan) + ' más';
      }
      if (primeroNuevo) primeroNuevo.focus({ preventScroll: true });
    }

    if (moreBtn) {
      moreBtn.addEventListener('click', function () { limite += PASO; apply(true); });
    }
    if (q) {
      var t;
      q.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { limite = PASO; apply(); }, 120);
      });
    }
    apply();
  })();

  /* ---------- 7. Drawer de producto ---------- */
  (function drawer() {
    var d = $('#drawer');
    if (!d) return;
    var byId = {};
    P.forEach(function (p, i) { byId[p.id] = { p: p, n: i + 1 }; });
    var lastFocus = null;

    function waLink(p) {
      return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(
        'Hola CrowCaps, estoy interesado en la Gorra ' + p.name +
        ' (' + p.team + '). Quisiera conocer disponibilidad y realizar mi pedido.');
    }

    function open(id) {
      var rec = byId[id];
      if (!rec) return;
      var p = rec.p;
      $('#dNum').textContent = 'Nº ' + String(rec.n).padStart(3, '0');
      $('#dTeam').textContent = p.team;
      $('#dName').textContent = p.name;
      $('#dDesc').textContent = p.desc;
      $('#dTags').innerHTML = '<span class="tag">' + p.colorway + '</span>' +
        p.colors.map(function (c) { return '<span class="tag">' + c + '</span>'; }).join('');
      $('#dFeats').innerHTML = p.features.map(function (f) { return '<li>' + f + '</li>'; }).join('');
      $('#dWa').href = waLink(p);

      var main = $('#dImg');
      main.src = IMG + p.imgs[0];
      main.alt = 'Gorra ' + p.name + ' — ' + p.colorway;

      var th = $('#dThumbs');
      th.innerHTML = '';
      if (p.imgs.length > 1) {
        p.imgs.forEach(function (f, i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-current', i === 0 ? 'true' : 'false');
          b.setAttribute('aria-label', 'Imagen ' + (i + 1) + ' de ' + p.imgs.length);
          b.innerHTML = '<img src="' + IMG + f.replace('.webp', '-sm.webp') + '" alt="" decoding="async">';
          b.addEventListener('click', function () {
            main.src = IMG + f;
            $$('button', th).forEach(function (x) { x.setAttribute('aria-current', 'false'); });
            b.setAttribute('aria-current', 'true');
          });
          th.appendChild(b);
        });
      }

      lastFocus = document.activeElement;
      d.classList.add('is-open');
      d.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      $('#dBody').scrollTop = 0;
      setTimeout(function () { $('.drawer__close', d).focus(); }, 60);
    }

    function close() {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (card && card.dataset.id) { e.preventDefault(); open(card.dataset.id); return; }
      if (e.target.closest && e.target.closest('[data-dclose]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.classList.contains('is-open')) close();
      if (e.key === 'Tab' && d.classList.contains('is-open')) {
        var f = $$('a[href], button, input, [tabindex]:not([tabindex="-1"])', d)
          .filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  })();

  /* ---------- 8. Cursor propio ---------- */
  (function cursor() {
    var c = $('#cursor'), t = $('#cursorTxt');
    if (!c || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var x = 0, y = 0, cx = 0, cy = 0, raf;
    window.addEventListener('mousemove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    function loop() {
      cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
      c.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      raf = Math.abs(x - cx) > 0.4 || Math.abs(y - cy) > 0.4 ? requestAnimationFrame(loop) : null;
    }
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest ? e.target.closest('.card, .feed__i, [data-cursor]') : null;
      if (el) {
        t.textContent = el.dataset.cursor || (el.classList.contains('card') ? 'VER' : 'IG');
        c.classList.add('is-lg');
      } else {
        c.classList.remove('is-lg');
      }
    });
  })();

  /* ---------- 9. Parallax suave del hero ---------- */
  (function parallax() {
    var shot = $('#heroImg');
    if (!shot || reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var stage = shot.closest('.hero__stage');
    stage.addEventListener('mousemove', function (e) {
      var r = stage.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      shot.style.transform = 'scale(1.05) translate3d(' + (dx * -14) + 'px,' + (dy * -14) + 'px,0)';
    });
    stage.addEventListener('mouseleave', function () { shot.style.transform = ''; });
  })();

  /* ---------- 10. Imagen que falla: fallback limpio ---------- */
  document.addEventListener('error', function (e) {
    var n = e.target;
    if (n && n.tagName === 'IMG') { n.style.visibility = 'hidden'; }
  }, true);

  /* ---------- 11. Conteo real de referencias ---------- */
  var rc = $('#refCount');
  if (rc && P.length) rc.textContent = P.length;
})();
