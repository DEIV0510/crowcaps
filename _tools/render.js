/* ═══════════════════════════════════════════════════════════════════════════
   RENDERIZADOR DE LA PÁGINA PÚBLICA
   ───────────────────────────────────────────────────────────────────────────
   Un único sitio donde se arma el HTML de CrowCaps. Lo usan los dos caminos,
   así que no pueden desincronizarse:

     · _tools/build-html.js  -> escribe index.html (la copia estática del repo)
     · api/_lib/publico.js   -> lo sirve en caliente desde la base de datos

   Recibe datos ya limpios y devuelve una cadena. No sabe de HTTP ni de SQL.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { sacar } = require('./mapa-contenido');

const RAIZ = path.join(__dirname, '..');
const PLANTILLA = path.join(RAIZ, '_plantilla', 'index.html');

const BIG = [0, 14];                 // fichas que ocupan 2x2 en la grilla
const PASO_SIZES_GRANDE = '(max-width: 760px) 100vw, (max-width: 1180px) 66vw, 50vw';
const PASO_SIZES_NORMAL = '(max-width: 760px) 50vw, (max-width: 1180px) 33vw, 25vw';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cop = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

/* ── WhatsApp ────────────────────────────────────────────────────────────── */
function enlaceWa(numero, mensaje) {
  const n = String(numero || '').replace(/\D/g, '');
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(String(mensaje || ''));
}

/* El mensaje por producto admite {producto}, {equipo} y {precio} */
function mensajeProducto(plantilla, p) {
  return String(plantilla || '')
    .replace(/\{producto\}/g, p.name || '')
    .replace(/\{equipo\}/g, p.team || '')
    .replace(/\{precio\}/g, cop(p.price));
}

/* ── Tarjeta de producto ─────────────────────────────────────────────────── */
function tarjeta(p, i) {
  const grande = BIG.indexOf(i) > -1;
  const n = String(i + 1).padStart(3, '0');
  const sizes = grande ? PASO_SIZES_GRANDE : PASO_SIZES_NORMAL;
  const alt = `Gorra ${p.name} de ${p.team}, colorway ${p.colorway}`;
  const buscar = esc([p.name, p.team, p.colorway, (p.colors || []).join(' ')].join(' '));

  const img = (im, clase) => {
    const srcset = im.sm ? `${esc(im.sm)} ${im.smW || 360}w, ${esc(im.src)} ${im.w}w` : '';
    return `<img${clase ? ` class="${clase}"` : ''} src="${esc(im.src)}"` +
      (srcset ? ` srcset="${srcset}"` : '') +
      ` sizes="${sizes}" width="${im.w}" height="${im.h}"` +
      ` alt="${clase ? '' : esc(alt)}" loading="lazy" decoding="async">`;
  };

  const segunda = p.imagenes[1] ? '\n      ' + img(p.imagenes[1], 'alt') : '';

  return `    <button class="card${grande ? ' card--big' : ''} reveal" type="button" data-id="${esc(p.id)}" data-colors="${esc((p.colors || []).join(' '))}" data-search="${buscar}" aria-label="Ver ficha de la gorra ${esc(p.name)}">
    <span class="card__media">
      <span class="card__n">Nº ${n}</span>
      ${img(p.imagenes[0])}${segunda}
      <span class="card__go">${esc(p.textos && p.textos.ver || 'Ver ficha')}</span>
    </span>
    <span class="card__info">
      <span class="card__team">${esc(p.team)}</span>
      <span class="card__name">${esc(p.name)}</span>
      <span class="card__color">${esc(p.colorway)}</span>
      <span class="card__price">${cop(p.price)}</span>
    </span>
  </button>`;
}

/* ── Datos que consume js/app.js en el navegador ─────────────────────────── */
function bloqueDatos(productos, c) {
  const limpio = productos.map((p) => ({
    id: p.id, team: p.team, name: p.name, colorway: p.colorway,
    colors: p.colors || [], price: p.price,
    desc: p.desc, features: p.features || [],
    imgs: p.imagenes.map((im) => im.src),
    thumbs: p.imagenes.map((im) => im.sm || im.src),
    wa: enlaceWa(sacar(c, 'contacto.whatsapp'), mensajeProducto(sacar(c, 'contacto.mensaje_producto'), p)),
  }));
  const cfg = {
    destacadas: sacar(c, 'hero.destacadas') || [],
    /* Los botones de filtro de la tienda. Sin esto js/app.js caía en su lista
       de reserva y la pantalla «Categorías» del panel no cambiaba nada. */
    categorias: (c.categorias || [])
      .filter((x) => x && x.slug && x.visible !== false)
      .map((x) => ({ slug: x.slug, nombre: x.nombre || x.slug })),
    ficha: {
      incluye: sacar(c, 'ficha.incluye'),
      envio: sacar(c, 'ficha.envio'),
      disponibilidad: sacar(c, 'ficha.disponibilidad'),
      envios_texto: sacar(c, 'envios.texto_corto'),
      incluye_etiqueta: sacar(c, 'envios.texto_ficha'),
    },
    ticker: sacar(c, 'ticker.palabras') || [],
  };
  // JSON dentro de <script>: hay que cortar cualquier "</script>" del texto
  const seguro = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
  return '<script>window.CROWCAPS_PRODUCTS=' + seguro(limpio) +
    ';window.CROWCAPS_CONFIG=' + seguro(cfg) + ';</script>';
}

/* ── Píxeles de publicidad ───────────────────────────────────────────────────
   Meta y Google solo se cargan si el dueño pegó su identificador en el panel.
   Sin identificador no sale ni una etiqueta: la tienda no habla con nadie.

   Los dos van diferidos y al final del body: son para medir, no pueden retrasar
   la página. Los identificadores ya vienen validados contra un formato estricto
   (contenido.js), pero igual se vuelven a limpiar aquí antes de meterlos en el
   script, porque este archivo también lo usa el build. */
function bloqueMedicion(c) {
  /* Se valida el valor TAL CUAL, sin quitarle caracteres antes: si primero se
     limpiara, un identificador mal pegado se «arreglaría» solo y quedaría uno
     falso montado en la tienda. Lo que no calce exactamente, no se monta. */
  const meta = String(sacar(c, 'medicion.meta_pixel') || '').trim();
  const google = String(sacar(c, 'medicion.google_tag') || '').trim().toUpperCase();
  const partes = [];

  if (/^\d{8,20}$/.test(meta)) {
    partes.push(
      '<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?' +
      'n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;' +
      'n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;' +
      't.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}' +
      '(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");' +
      'fbq("init","' + meta + '");fbq("track","PageView");</script>' +
      '<noscript><img height="1" width="1" style="display:none" alt="" ' +
      'src="https://www.facebook.com/tr?id=' + meta + '&ev=PageView&noscript=1"></noscript>'
    );
  }

  if (/^(G-[A-Z0-9]{6,15}|AW-[0-9]{8,13}|GTM-[A-Z0-9]{5,10})$/.test(google)) {
    if (google.startsWith('GTM-')) {
      partes.push(
        '<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),' +
        'event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?' +
        '"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;' +
        'f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","' + google + '");</script>'
      );
    } else {
      partes.push(
        '<script async src="https://www.googletagmanager.com/gtag/js?id=' + google + '"></script>' +
        '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}' +
        'gtag("js",new Date());gtag("config","' + google + '");</script>'
      );
    }
  }

  return partes.join('\n');
}

/* ── Datos estructurados ─────────────────────────────────────────────────── */
function bloqueJsonLd(productos, c) {
  const sitio = String(sacar(c, 'seo.canonical') || 'https://crowcaps.co/').replace(/\/$/, '');
  const abs = (u) => (/^https?:/.test(u) ? u : sitio + '/' + String(u).replace(/^\//, ''));
  const redes = [];
  if (sacar(c, 'redes.instagram_visible')) redes.push(sacar(c, 'redes.instagram_url'));
  if (sacar(c, 'redes.tiktok_visible')) redes.push(sacar(c, 'redes.tiktok_url'));
  if (sacar(c, 'redes.facebook_visible')) redes.push(sacar(c, 'redes.facebook_url'));

  const bloques = [
    {
      '@context': 'https://schema.org', '@type': 'Organization',
      name: sacar(c, 'marca.nombre'), url: sitio + '/',
      logo: { '@type': 'ImageObject', url: sitio + '/assets/brand/icon-512.png', width: 512, height: 512 },
      image: sitio + '/assets/brand/icon-512.png',
      description: sacar(c, 'seo.og_descripcion'),
      slogan: sacar(c, 'footer.lema'),
      areaServed: { '@type': 'Country', name: 'Colombia' },
      address: { '@type': 'PostalAddress', addressLocality: 'Medellín', addressRegion: 'Antioquia', addressCountry: 'CO' },
      contactPoint: {
        '@type': 'ContactPoint', contactType: 'sales',
        telephone: '+' + String(sacar(c, 'contacto.whatsapp') || '').replace(/\D/g, ''),
        areaServed: 'CO', availableLanguage: ['es'],
      },
      sameAs: redes.filter(Boolean),
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: sacar(c, 'marca.nombre'), url: sitio + '/', inLanguage: 'es-CO',
      publisher: { '@type': 'Organization', name: sacar(c, 'marca.nombre') },
    },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: 'Colección ' + sacar(c, 'marca.nombre'),
      numberOfItems: productos.length,
      itemListElement: productos.map((p, k) => ({
        '@type': 'ListItem', position: k + 1,
        item: {
          '@type': 'Product', name: `Gorra ${p.name}`,
          brand: { '@type': 'Brand', name: sacar(c, 'marca.nombre') },
          description: p.desc, image: abs(p.imagenes[0].src),
          offers: {
            '@type': 'Offer', price: p.price, priceCurrency: 'COP',
            availability: 'https://schema.org/InStock', url: sitio + '/',
          },
        },
      })),
    },
  ];
  return bloques.map((x) => '<script type="application/ld+json">' +
    JSON.stringify(x).replace(/</g, '\\u003c') + '</script>').join('\n');
}

/* ── Mosaico del feed ────────────────────────────────────────────────────── */
function bloqueFeed(c) {
  const fotos = sacar(c, 'feed.imagenes') || [];
  const url = sacar(c, 'redes.instagram_url');
  return fotos.map((f, i) => {
    const d = i < 2 ? '' : i < 4 ? ' reveal-d1' : i < 6 ? ' reveal-d2' : ' reveal-d3';
    return `    <a class="feed__i reveal${d}" href="${esc(url)}" target="_blank" rel="noopener" data-cursor="IG">` +
      `<img src="${esc(f.src)}" width="${f.w || 360}" height="${f.h || 480}" loading="lazy" decoding="async" alt="${esc(f.alt || '')}"></a>`;
  }).join('\n');
}

/* ── Secciones apagadas ──────────────────────────────────────────────────── */
function quitarTramo(html, abre, cierra, visible) {
  const i = html.indexOf(abre), j = html.indexOf(cierra);
  if (i < 0 || j < 0) return html;
  return visible
    ? html.slice(0, i) + html.slice(i + abre.length, j) + html.slice(j + cierra.length)
    : html.slice(0, i) + html.slice(j + cierra.length);
}

function aplicarSecciones(html, c) {
  const nombres = ['hero', 'coleccion', 'perks', 'editorial', 'about', 'feed', 'final'];
  for (const n of nombres) {
    html = quitarTramo(html, `<!--sec:${n}-->`, `<!--/sec:${n}-->`, sacar(c, 'secciones.' + n) !== false);
  }
  /* Los interruptores «Mostrar Instagram/TikTok/Facebook» apagaban la red en
     los datos estructurados pero el enlace seguía en el pie: si CrowCaps no
     tiene Facebook, no puede quedar un enlace a una página que no existe. */
  for (const red of ['instagram', 'tiktok', 'facebook']) {
    html = quitarTramo(html, `<!--red:${red}-->`, `<!--/red:${red}-->`, sacar(c, 'redes.' + red + '_visible') !== false);
  }
  return html;
}

/* ── Render ──────────────────────────────────────────────────────────────── */
function renderizar({ productos, contenido, plantilla }) {
  const c = contenido;
  const tpl = plantilla || fs.readFileSync(PLANTILLA, 'utf8');
  const P = productos.filter((p) => p.imagenes && p.imagenes.length);

  /* Los enlaces de WhatsApp se calculan: en el panel se edita el número y el
     mensaje, no la URL entera. */
  const wa = {
    'nav.wa_url': enlaceWa(sacar(c, 'contacto.whatsapp'), sacar(c, 'contacto.mensaje_general')),
    'coleccion.vacio_wa': enlaceWa(sacar(c, 'contacto.whatsapp'), sacar(c, 'contacto.mensaje_busqueda')),
    'final.cta_wa': enlaceWa(sacar(c, 'contacto.whatsapp'), sacar(c, 'contacto.mensaje_cierre')),
  };

  /* Producto del hero: el elegido, o el primero si ese ya no existe */
  const heroId = sacar(c, 'hero.principal');
  const hero = P.find((p) => p.id === heroId) || P[0];
  /* Sin ninguna gorra publicada no puede quedar un <img src="">: hay
     navegadores que con eso vuelven a pedir la página entera. */
  const heroImg = hero ? hero.imagenes[0] : { src: 'assets/brand/icon-512.png', w: 512, h: 512 };

  const extra = {
    N: String(P.length),
    'hero.img_src': heroImg.src,
    'hero.img_w': String(heroImg.w || ''),
    'hero.img_h': String(heroImg.h || ''),
    'hero.img_alt': hero ? `Gorra ${hero.name} — ${hero.colorway}` : sacar(c, 'marca.nombre') || 'CrowCaps',
    'hero.img_titulo': hero ? hero.name : '',
    'editorial.img_w': String(sacar(c, 'editorial.img_w') || 526),
    'editorial.img_h': String(sacar(c, 'editorial.img_h') || 670),

    /* El menú del celular y el del computador son el MISMO menú: si fueran dos
       campos aparte, el dueño cambiaría uno y el teléfono seguiría con el texto
       viejo sin que nadie entienda por qué. */
    'nav.coleccion_movil': sacar(c, 'nav.coleccion'),
    'nav.marca_movil': sacar(c, 'nav.marca'),
    'nav.feed_movil': sacar(c, 'nav.feed'),
  };

  let html = aplicarSecciones(tpl, c);

  html = html
    .replace('{{{GRID}}}', () => P.map(tarjeta).join('\n'))
    .replace('{{{JSONLD}}}', () => bloqueJsonLd(P, c))
    .replace('{{{DATOS}}}', () => bloqueDatos(P, c))
    .replace('{{{FEED}}}', () => bloqueFeed(c))
    .replace('{{{PIXELES}}}', () => bloqueMedicion(c));

  /* Marcadores sueltos: {{{x}}} entra tal cual, {{x}} se escapa */
  html = html.replace(/\{\{\{([\w.]+)\}\}\}/g, (_, k) => {
    const v = extra[k] !== undefined ? extra[k] : (wa[k] !== undefined ? wa[k] : sacar(c, k));
    return v == null ? '' : String(v);
  });
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
    const v = extra[k] !== undefined ? extra[k] : (wa[k] !== undefined ? wa[k] : sacar(c, k));
    return v == null ? '' : esc(v);
  });

  return html;
}

module.exports = { renderizar, tarjeta, bloqueDatos, bloqueJsonLd, bloqueFeed, bloqueMedicion, enlaceWa, mensajeProducto, esc, cop, PLANTILLA, RAIZ };
