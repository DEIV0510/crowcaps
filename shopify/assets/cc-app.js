/* ===========================================================================
   CrowCaps · cc-app.js (tema de Shopify)
   Sin dependencias. Todo lo que se anima degrada solo: si el JS falla, la
   pagina sigue siendo navegable y el grid ya viene renderizado en el HTML.
   =========================================================================== */
(function () {
  'use strict';

  var P = window.CROWCAPS_PRODUCTS || [];
  var CFG = window.CROWCAPS_CONFIG || {};
  /* Las rutas de imagen llegan completas desde el CMS (pueden ser locales o de
     un almacenamiento externo), así que aquí ya no se arma ninguna ruta. */
  var foto = function (p, i) { return (p.imgs && p.imgs[i]) || ''; };
  var mini = function (p, i) { return (p.thumbs && p.thumbs[i]) || foto(p, i); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  /* Libera el scroll de la página solo si ya no queda nada abierto: ficha,
     carrito o menú. Si uno se cierra con otro abierto, la página sigue quieta. */
  var soltar = function () {
    if (document.querySelector('.drawer.is-open') || document.documentElement.classList.contains('is-menu')) return;
    document.body.classList.remove('is-locked');
  };

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
      soltar();
    };
    burger.addEventListener('click', function () {
      var open = document.documentElement.classList.toggle('is-menu');
      burger.setAttribute('aria-expanded', String(open));
      if (open) document.body.classList.add('is-locked');
      else soltar();
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
    var words = (CFG.ticker && CFG.ticker.length) ? CFG.ticker : ['Crowcaps', 'Streetwear', 'Medellín', 'Envío gratis desde 2 gorras', 'Crowcaps', 'Colombia'];
    var html = words.map(function (w, i) {
      return '<span' + (i % 2 ? ' class="o"' : '') + '>' + w + '</span>' +
        (i === 2 && CFG.mascota ? '<img src="' + CFG.mascota + '" width="320" height="286" alt="" loading="lazy">' : '<span>·</span>');
    }).join('');
    rows.forEach(function (r) { r.innerHTML = html; });
  })();

  /* ---------- 5. Hero: selector de gorra destacada ---------- */
  (function heroPick() {
    var wrap = $('#heroPick'), img = $('#heroImg'), tag = $('#heroTag');
    if (!wrap || !img) return;
    /* CFG.heroPicks llega de la sección del hero: la primera es la gorra
       grande y las demás son las miniaturas de abajo, en el mismo orden. La
       grande nunca se repite abajo: al tocar una miniatura, esa gorra sube y
       la que estaba arriba ocupa su lugar. */
    var picks = (CFG.heroPicks || []).filter(function (x) { return x && x.img; });
    if (picks.length < 2) return;
    var actual = picks[0];
    var abajo = picks.slice(1);

    /* Los botones ya vienen pintados desde la sección (así la portada no salta
       al cargar); si faltan, se crean aquí. */
    var botones = $$('button', wrap);
    abajo.forEach(function (p, k) {
      if (botones[k]) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img src="' + p.thumb + '" width="170" height="212" alt="" loading="lazy" decoding="async">';
      wrap.appendChild(b);
      botones[k] = b;
    });

    function pintar(b, p) {
      b.setAttribute('aria-label', 'Ver ' + p.name);
      var miniatura = b.querySelector('img');
      if (miniatura && miniatura.getAttribute('src') !== p.thumb) miniatura.src = p.thumb;
    }

    botones.forEach(function (b, k) {
      if (!abajo[k]) { b.hidden = true; return; }
      pintar(b, abajo[k]);
      b.addEventListener('click', function () {
        var sube = abajo[k];
        abajo[k] = actual;
        actual = sube;
        img.classList.add('is-out');
        setTimeout(function () {
          img.src = sube.img;
          img.alt = 'Gorra ' + sube.name + (sube.colorway ? ' — ' + sube.colorway : '');
          if (tag) tag.textContent = sube.name;
          img.classList.remove('is-out');
          pintar(b, abajo[k]);
        }, reduce ? 0 : 220);
      });
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

    /* Las categorías se administran desde el panel; si no llegan, se usan las
       de siempre para que la tienda nunca quede sin filtros. */
    var cats = (CFG.categorias && CFG.categorias.length) ? CFG.categorias : [
      { slug: 'negras', nombre: 'Negras' }, { slug: 'blancas', nombre: 'Blancas' },
      { slug: 'beige', nombre: 'Beige' }, { slug: 'rojas', nombre: 'Rojas' },
      { slug: 'azules', nombre: 'Azules' }, { slug: 'bicolor', nombre: 'Bicolor' }
    ];
    var defs = [['todas', (CFG.textos && CFG.textos.todas) || 'Todas', P.length]].concat(
      cats.map(function (c) { return [c.slug, c.nombre, count[c.slug]]; })
    );

    defs.forEach(function (d) {
      if (!d[2]) return;
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.dataset.f = d[0];
      b.setAttribute('aria-pressed', String(d[0] === 'todas'));
      /* textContent, no innerHTML: el nombre lo escribe el dueño en el panel */
      b.appendChild(document.createTextNode(d[1]));
      var cuantas = document.createElement('b');
      cuantas.textContent = d[2];
      b.appendChild(cuantas);
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

    function cop(n) { return '$' + Number(n).toLocaleString('es-CO'); }

    /* El enlace viene ya armado del servidor con el número y el mensaje que
       haya configurado el administrador. */
    function waLink(p) { return p.wa || '#'; }

    function open(id) {
      var rec = byId[id];
      if (!rec) return;
      var p = rec.p;
      $('#dNum').textContent = 'Nº ' + String(rec.n).padStart(3, '0');
      $('#dTeam').textContent = p.team;
      $('#dName').textContent = p.name;
      $('#dDesc').textContent = p.desc;
      $('#dPrice').innerHTML = cop(p.price) + ' <small>COP · envío gratis desde 2 gorras</small>';
      /* «Agregar al carrito · $85.000»; WhatsApp queda como segunda opción */
      var add = $('#dAdd'), addTxt = $('#dAddTxt');
      if (add) {
        add.dataset.add = p.variant || '';
        add.disabled = !p.variant || p.available === false;
        if (addTxt) {
          if (!addTxt.dataset.base) addTxt.dataset.base = addTxt.textContent;
          addTxt.textContent = addTxt.dataset.base + ' · ' + cop(p.price);
        }
      }
      $('#dTags').innerHTML = '<span class="tag">' + p.colorway + '</span>' +
        p.colors.map(function (c) { return '<span class="tag">' + (c === 'nuevas' ? 'Nueva' : c) + '</span>'; }).join('');
      $('#dFeats').innerHTML = p.features.map(function (f) { return '<li>' + f + '</li>'; }).join('');
      $('#dWa').href = waLink(p);

      var main = $('#dImg');
      main.src = foto(p, 0);
      main.alt = 'Gorra ' + p.name + ' — ' + p.colorway;

      var th = $('#dThumbs');
      th.innerHTML = '';
      if (p.imgs.length > 1) {
        p.imgs.forEach(function (f, i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-current', i === 0 ? 'true' : 'false');
          b.setAttribute('aria-label', 'Imagen ' + (i + 1) + ' de ' + p.imgs.length);
          b.innerHTML = '<img src="' + mini(p, i) + '" alt="" decoding="async">';
          b.addEventListener('click', function () {
            main.src = f;
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
      soltar();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener('click', function (e) {
      /* «Agregar al carrito» y el WhatsApp de la tarjeta no abren la ficha */
      if (e.target.closest && e.target.closest('.card__acc')) return;
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

    /* Quien abre el enlace de una gorra (crowcaps.co/g/<slug>, el que viaja por
       WhatsApp) llega con ?gorra=<slug>: se le abre esa ficha directamente.
       Se espera a que termine la pantalla de carga para no taparla. */
    var pedida = null;
    try { pedida = new URLSearchParams(location.search).get('gorra'); } catch (_) {}
    if (pedida && byId[pedida]) {
      var abrirPedida = function () { setTimeout(function () { open(pedida); }, 900); };
      if (document.readyState === 'complete') abrirPedida();
      else window.addEventListener('load', abrirPedida);
    }
  })();

  /* ---------- 7b. Galería de la página de una gorra ---------- */
  (function galeria() {
    var th = $('#pThumbs'), main = $('#pImg');
    if (!th || !main) return;
    $$('button', th).forEach(function (b) {
      b.addEventListener('click', function () {
        main.src = b.dataset.src;
        $$('button', th).forEach(function (x) { x.setAttribute('aria-current', 'false'); });
        b.setAttribute('aria-current', 'true');
      });
    });
  })();

  /* ---------- 7c. Carrito (Shopify) ----------
     «Agregar al carrito» suma la gorra con /cart/add.js y abre el panel. El
     panel se arma con /cart.js; «Pagar» manda al checkout de Shopify. Si algo
     falla, el botón del encabezado sigue llevando a la página /cart, y sin
     JavaScript cada «Agregar» es un formulario normal a /cart/add. */
  (function carrito() {
    var c = $('#cart');
    if (!c) return;
    var R = CFG.rutas || {};
    var rutaCart = R.cart || '/cart', rutaAdd = R.add || '/cart/add';
    var lista = $('#cartItems'), vacio = $('#cartVacio'), pie = $('#cartFoot');
    var total = $('#cartTotal'), envio = $('#cartEnvio'), error = $('#cartError'), estado = $('#cartStatus');
    var cuenta = $('#cartCount'), boton = $('#cartBtn');
    /* En /cart el botón de la bolsa solo recarga la página: si abriera el
       panel, lo que se cambiara ahí se desharía al tocar «Pagar» en la página */
    var enPaginaCarrito = !!$('.cartp');
    var lastFocus = null;
    /* Una sola petición a la vez. Lo que llega mientras tanto no se pierde:
       los «Agregar» hacen fila y los +/− se juntan en un solo envío. */
    var ocupado = false, filaAgregar = [], pendientes = {}, hayPendientes = false, tCambio = null, focoTras = null;

    var MSG_AGREGAR = 'No pudimos agregar la gorra. Intenta de nuevo o escríbenos por WhatsApp.';
    var MSG_AGOTADA = 'Esta gorra ya no está disponible. Escríbenos por WhatsApp y te ayudamos.';
    var MSG_CAMBIAR = 'No pudimos actualizar el carrito. Intenta de nuevo.';

    function cop(n) { return '$' + Number(n || 0).toLocaleString('es-CO'); }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
      });
    }
    function chica(u) { return u ? u + (u.indexOf('?') > -1 ? '&' : '?') + 'width=200' : ''; }

    /* fetch con tiempo límite (15 s) y sin mensajes técnicos: si la respuesta
       no es JSON se trata como error vacío y el cliente ve un texto en español */
    function pedir(url, datos) {
      var ac = window.AbortController ? new AbortController() : null;
      var tm = ac ? setTimeout(function () { ac.abort(); }, 15000) : null;
      return fetch(url, {
        method: datos ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: datos ? JSON.stringify(datos) : undefined,
        credentials: 'same-origin',
        signal: ac ? ac.signal : undefined
      }).then(function (r) {
        clearTimeout(tm);
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { j = j || {}; j.estado = r.status; throw j; }
          return j;
        });
      }, function (e) {
        clearTimeout(tm);
        throw { estado: 0, causa: e };
      });
    }

    function avisar(msg) {
      if (!error) return;
      error.textContent = msg || '';
      error.hidden = !msg;
    }
    /* Región viva fuera del panel: el lector la anuncia aunque el panel aún
       se esté abriendo */
    function anunciar(msg) {
      if (!estado) return;
      estado.textContent = '';
      setTimeout(function () { estado.textContent = msg || ''; }, 50);
    }

    function subtotal(cart) {
      /* items_subtotal_price y no total_price: la respuesta de /cart/change.js
         a veces trae el envío estimado sumado en total_price */
      return (cart.items_subtotal_price != null ? cart.items_subtotal_price : cart.total_price) / 100;
    }
    function textoEnvio(sub) {
      var umbral = Number(CFG.envioGratis || 0);
      if (!umbral) return '';
      return sub >= umbral ? (CFG.textoGratis || '') : (CFG.textoFalta || '');
    }
    function resumen(cart) {
      var n = cart.item_count || 0;
      if (!n) return 'Tu carrito está vacío.';
      return n + (n === 1 ? ' gorra' : ' gorras') + ', subtotal ' + cop(subtotal(cart)) + '. ' + textoEnvio(subtotal(cart));
    }

    function pintar(cart) {
      var n = cart.item_count || 0;
      if (cuenta) { cuenta.textContent = n; cuenta.hidden = n === 0; }
      if (boton) boton.setAttribute('aria-label', 'Carrito, ' + n + (n === 1 ? ' gorra' : ' gorras'));
      vacio.hidden = n > 0;
      pie.hidden = n === 0;
      var sub = subtotal(cart);
      total.textContent = cop(sub);
      if (envio) {
        var umbral = Number(CFG.envioGratis || 0);
        envio.hidden = n === 0 || !umbral;
        envio.textContent = textoEnvio(sub);
        envio.classList.toggle('is-ok', sub >= umbral);
      }
      lista.innerHTML = (cart.items || []).map(function (it) {
        var color = it.variant_title && it.variant_title !== 'Default Title' ? it.variant_title : '';
        var nom = esc(it.product_title);
        return '<li class="cartd__item" data-key="' + esc(it.key) + '" data-q="' + it.quantity + '">' +
          '<a class="cartd__img" href="' + esc(it.url) + '" tabindex="-1" aria-hidden="true">' + (it.image ? '<img src="' + esc(chica(it.image)) + '" alt="" width="72" height="90" loading="lazy" decoding="async">' : '') + '</a>' +
          '<div class="cartd__info">' +
            '<p class="card__team">' + esc(it.vendor) + '</p>' +
            '<p class="cartd__name">' + nom + '</p>' +
            (color ? '<p class="card__color">' + esc(color) + '</p>' : '') +
            '<div class="cartd__qty"><button type="button" data-cambio="-1" aria-label="Una menos de ' + nom + '">−</button>' +
            '<span>' + it.quantity + '</span>' +
            '<button type="button" data-cambio="1" aria-label="Una más de ' + nom + '">+</button></div>' +
          '</div>' +
          '<div class="cartd__right"><b>' + cop(it.final_line_price / 100) + '</b>' +
            '<button type="button" class="cartd__quitar" data-cambio="0" aria-label="Quitar ' + nom + ' del carrito">Quitar</button></div>' +
        '</li>';
      }).join('');
      return cart;
    }

    function cargar() { return pedir(rutaCart + '.js').then(pintar); }

    function abrir(origen) {
      /* El menú del celular se cierra: el carrito no se abre encima de él */
      var h = document.documentElement;
      if (h.classList.contains('is-menu')) {
        h.classList.remove('is-menu');
        var bg = $('#burger');
        if (bg) bg.setAttribute('aria-expanded', 'false');
      }
      if (!c.classList.contains('is-open')) {
        lastFocus = (origen && document.contains(origen)) ? origen : document.activeElement;
      }
      c.classList.add('is-open');
      c.setAttribute('aria-hidden', 'false');
      if (boton) boton.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-locked');
      setTimeout(function () { var x = $('.drawer__close', c); if (x) x.focus(); }, 60);
    }
    function cerrar() {
      c.classList.remove('is-open');
      c.setAttribute('aria-hidden', 'true');
      if (boton) boton.setAttribute('aria-expanded', 'false');
      soltar();
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    }
    /* Si la ficha está abierta, se cierra primero (su foco vuelve a la
       tarjeta) y después aparece el carrito; así nunca quedan los dos abiertos */
    function mostrar(origen) {
      var ficha = $('#drawer');
      if (ficha && ficha.classList.contains('is-open')) {
        var x = $('.drawer__close', ficha);
        if (x) x.click();
        setTimeout(function () {
          var a = document.activeElement;
          abrir(a && a !== document.body ? a : origen);
        }, reduce ? 0 : 320);
      } else {
        abrir(origen);
      }
    }

    /* aria-disabled y no disabled: Chrome le quita el foco a un botón
       desactivado y el teclado quedaría perdido en el body */
    function ocupar(b, si) {
      if (!b) return;
      if (si) { b.setAttribute('aria-disabled', 'true'); b.classList.add('is-busy'); }
      else { b.removeAttribute('aria-disabled'); b.classList.remove('is-busy'); }
    }

    function siguiente() {
      if (ocupado) return;
      if (hayPendientes) { enviarCambios(); return; }
      var sig = filaAgregar.shift();
      if (sig) { ocupar(sig[1], false); agregar(sig[0], sig[1]); }
    }

    function agregar(id, b) {
      if (!id) return;
      if (b && b.getAttribute('aria-disabled') === 'true') return;
      if (ocupado) { filaAgregar.push([id, b]); ocupar(b, true); return; }
      ocupado = true;
      ocupar(b, true);
      avisar('');
      var nombre = '';
      pedir(rutaAdd + '.js', { items: [{ id: Number(id), quantity: 1 }] })
        .then(function (r) {
          var it = (r.items || [])[0] || {};
          nombre = it.product_title || '';
          try {
            if (typeof window.fbq === 'function') window.fbq('track', 'AddToCart', { content_name: nombre, value: (it.final_price || 0) / 100, currency: 'COP' });
            if (typeof window.gtag === 'function') window.gtag('event', 'add_to_cart', { currency: 'COP', value: (it.final_price || 0) / 100, items: [{ item_name: nombre }] });
          } catch (_) { /* medir nunca puede romper la compra */ }
          return cargar();
        })
        .then(function (cart) {
          mostrar(b);
          anunciar('Agregaste ' + nombre + ' al carrito. ' + resumen(cart));
        })
        .catch(function (e) {
          cargar().catch(function () {});
          mostrar(b);
          var msg = e && (e.estado === 422 || e.estado === 404) ? MSG_AGOTADA : MSG_AGREGAR;
          avisar(msg);
          anunciar(msg);
        })
        .then(function () {
          ocupado = false;
          ocupar(b, false);
          siguiente();
        });
    }

    function devolverFoco(foco) {
      var dest = null;
      if (foco) {
        var li = $$('.cartd__item', lista).filter(function (x) { return x.dataset.key === foco.key; })[0];
        if (li) dest = $('[data-cambio="' + foco.tipo + '"]', li) || $('[data-cambio]', li);
      }
      if (!dest) dest = $('.cartd__quitar', lista) || $('.drawer__close', c);
      if (dest) dest.focus();
    }

    function enviarCambios() {
      if (!hayPendientes || ocupado) return;
      var cambios = pendientes, foco = focoTras;
      pendientes = {}; hayPendientes = false; focoTras = null;
      ocupado = true;
      avisar('');
      pedir(rutaCart + '/update.js', { updates: cambios })
        .then(function (cart) {
          var a = document.activeElement;
          var dentro = c.contains(a) || a === document.body;
          pintar(cart);
          anunciar(resumen(cart));
          if (dentro && c.classList.contains('is-open')) devolverFoco(foco);
        })
        .catch(function () {
          avisar(MSG_CAMBIAR);
          anunciar(MSG_CAMBIAR);
          return cargar().catch(function () {});
        })
        .then(function () { ocupado = false; siguiente(); });
    }

    function programarCambio(key, cantidad, tipo) {
      pendientes[key] = cantidad;
      hayPendientes = true;
      focoTras = { key: key, tipo: tipo };
      clearTimeout(tCambio);
      tCambio = setTimeout(enviarCambios, 280);
    }

    /* La bolsa se anuncia como botón que abre un diálogo (fuera de /cart) */
    if (boton && !enPaginaCarrito) {
      boton.setAttribute('role', 'button');
      boton.setAttribute('aria-haspopup', 'dialog');
      boton.setAttribute('aria-controls', 'cart');
      boton.setAttribute('aria-expanded', 'false');
      boton.addEventListener('keydown', function (e) {
        if (e.key === ' ') { e.preventDefault(); boton.click(); }
      });
    }

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var add = t.closest('[data-add]');
      if (add) { e.preventDefault(); e.stopPropagation(); agregar(add.dataset.add, add); return; }
      if (t.closest('#cartBtn')) {
        if (enPaginaCarrito) return;
        e.preventDefault();
        avisar('');
        cargar().then(function () { abrir(boton); }).catch(function () { location.href = rutaCart; });
        return;
      }
      var cambio = t.closest('[data-cambio]');
      if (cambio && c.contains(cambio)) {
        /* La cantidad cambia ya en pantalla; el envío a Shopify se junta */
        var li = cambio.closest('.cartd__item');
        var d = Number(cambio.dataset.cambio);
        var q = d === 0 ? 0 : Math.max(0, Number(li.dataset.q || 0) + d);
        li.dataset.q = q;
        var sp = $('.cartd__qty span', li);
        if (sp) sp.textContent = q;
        li.classList.toggle('is-quitando', q === 0);
        programarCambio(li.dataset.key, q, cambio.dataset.cambio);
        return;
      }
      if (t.closest('[data-cclose]') && c.contains(t)) cerrar();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (!c.classList.contains('is-open')) return;
      if (e.key === 'Escape') cerrar();
      if (e.key === 'Tab') {
        var f = $$('a[href]:not([tabindex="-1"]), button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', c)
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

  /* ---------- 12. Avisar del clic a WhatsApp ----------
     Aquí no hay carrito ni pago: el pedido se hace por WhatsApp, así que ESE
     clic es la venta. Sin esto, Meta y Google solo contarían visitas y no
     sabrían qué anuncio trae clientes de verdad.
     Si no hay píxel configurado, no pasa nada: ninguna de las dos funciones
     existe y se sale sin hacer nada. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (!a) return;

    /* De qué gorra se trata, si el clic salió de una ficha abierta */
    /* El nombre sale de la tarjeta (botón «Comprar») o de la ficha abierta */
    var ficha = $('#dName');
    var abierto = $('#drawer');
    var tarjeta = a.closest('.card');
    var enTarjeta = tarjeta && tarjeta.querySelector('.card__name');
    var nombre = enTarjeta ? enTarjeta.textContent.trim()
      : (abierto && abierto.classList.contains('is-open') && ficha) ? ficha.textContent.trim() : '';

    try {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'Contact', nombre ? { content_name: nombre } : {});
      }
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'contacto_whatsapp', nombre ? { gorra: nombre } : {});
      }
    } catch (_) { /* medir nunca puede romper el enlace */ }
  }, true);
})();
