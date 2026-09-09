/* ═══════════════════════════════════════════════════════════════════════════
   GENERA _plantilla/index.html A PARTIR DE index.html
   ───────────────────────────────────────────────────────────────────────────
   Cambia cada texto editable por un marcador {{clave}} y deja el resto del
   HTML intacto: el diseño no se toca, solo se hace administrable.

   Comprueba que cada literal aparezca EXACTAMENTE las veces esperadas. Si no
   coincide, se detiene: es preferible fallar aquí que generar una plantilla
   que rompa la página.

   Uso: node _tools/hacer-plantilla.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { MAPA } = require('./mapa-contenido');

const RAIZ = path.join(__dirname, '..');
const ENTRADA = path.join(RAIZ, '_plantilla', 'respaldo.html');
const SALIDA = path.join(RAIZ, '_plantilla', 'index.html');

const contar = (texto, aguja) => texto.split(aguja).length - 1;

let html = fs.readFileSync(ENTRADA, 'utf8');
const problemas = [];

/* 1. El bloque de fichas y el de datos se sustituyen enteros */
const A = '<!-- grid:start -->', B = '<!-- grid:end -->';
const i = html.indexOf(A), j = html.indexOf(B);
if (i < 0 || j < 0) throw new Error('No encuentro los marcadores del grid');
html = html.slice(0, i + A.length) + '\n{{{GRID}}}\n    ' + html.slice(j);

const L1 = '<!-- ld:start -->', L2 = '<!-- ld:end -->';
const a = html.indexOf(L1), b = html.indexOf(L2);
if (a < 0 || b < 0) throw new Error('No encuentro los marcadores del JSON-LD');
html = html.slice(0, a + L1.length) + '\n{{{JSONLD}}}\n' + html.slice(b);

/* El catálogo deja de venir de un archivo suelto: se inyecta en la página para
   que los datos y el HTML no puedan quedar desfasados entre sí. */
if (!html.includes('<script src="js/products.js"></script>')) {
  problemas.push('no encuentro el <script> de products.js');
} else {
  html = html.replace('<script src="js/products.js"></script>', '{{{DATOS}}}');
}

/* 2. Textos editables.
   Los que traen "busca" se aplican primero y de más largo a más corto: así el
   patrón específico (<li><a …>Colección</a></li>) se consume antes que el
   genérico (<a …>Colección</a>) y deja de haber ambigüedad. */
const conContexto = MAPA.filter((e) => e.busca).sort((x, y) => y.busca.length - x.busca.length);
const sueltos = MAPA.filter((e) => !e.busca);

for (const e of conContexto) {
  const esperadas = e.veces || 1;
  const hay = contar(html, e.busca);
  if (hay !== esperadas) {
    problemas.push(`«${e.clave}»: esperaba ${esperadas} de ${JSON.stringify(e.busca.slice(0, 70))} y encontré ${hay}`);
    continue;
  }
  html = html.split(e.busca).join(e.pon);
}

for (const e of sueltos) {
  const esperadas = e.veces || 1;
  const hay = contar(html, e.literal);
  if (hay !== esperadas) {
    problemas.push(`«${e.clave}»: esperaba ${esperadas} apariciones de ${JSON.stringify(e.literal.slice(0, 60))} y encontré ${hay}`);
    continue;
  }
  const marcador = e.html ? `{{{${e.clave}}}}` : `{{${e.clave}}}`;
  html = html.split(e.literal).join(marcador);
}

/* 3. Piezas que dependen del producto destacado del hero */
const heroImg = /<img id="heroImg" src="[^"]*" width="\d+" height="\d+"\n\s+alt="[^"]*"/;
if (!heroImg.test(html)) problemas.push('no encuentro la imagen del hero');
html = html.replace(heroImg,
  '<img id="heroImg" src="{{hero.img_src}}" width="{{hero.img_w}}" height="{{hero.img_h}}"\n               alt="{{hero.img_alt}}"');
html = html.replace('<span class="hero__tag" id="heroTag">Yankees Navy / Hueso</span>',
  '<span class="hero__tag" id="heroTag">{{hero.img_titulo}}</span>');
html = html.replace('<link rel="preload" as="image" href="assets/img/yankees-navy-hueso.webp" fetchpriority="high">',
  '<link rel="preload" as="image" href="{{hero.img_src}}" fetchpriority="high">');

/* Contadores que dependen de cuántas gorras hay publicadas */
html = html.replace('<span id="refCount">61</span>', '<span id="refCount">{{N}}</span>');
html = html.replace('<div><b>61</b><span>', '<div><b>{{N}}</b><span>');
html = html.replace('{{editorial.cta}}61 <span class="arw">', '{{editorial.cta}}{{N}} <span class="arw">');

/* La imagen del editorial y el mosaico del feed salen del CMS */
html = html.replace(/<img src="assets\/img\/nationals-navy\.webp" width="\d+" height="\d+" loading="lazy" decoding="async"\n\s+alt="\{\{editorial\.img_alt\}\}">/,
  '<img src="{{editorial.imagen}}" width="{{editorial.img_w}}" height="{{editorial.img_h}}" loading="lazy" decoding="async"\n         alt="{{editorial.img_alt}}">');

const feedIni = html.indexOf('<div class="feed__grid">');
const feedFin = html.indexOf('</div>', html.lastIndexOf('data-cursor="IG">'));
if (feedIni < 0 || feedFin < 0) problemas.push('no encuentro el mosaico del feed');
else {
  html = html.slice(0, feedIni) + '<div class="feed__grid">\n{{{FEED}}}\n  ' + html.slice(feedFin);
}

/* 4. Secciones que se pueden apagar desde el panel */
const SECCIONES = [
  ['hero', '<section class="hero" id="hero">', '</section>'],
  ['perks', '<section class="perks">', '</section>'],
  ['editorial', '<section class="edito">', '</section>'],
  ['about', '<section class="about wrap" id="marca">', '</section>'],
  ['feed', '<section class="wrap" id="feed">', '</section>'],
  ['final', '<section class="final" id="contacto">', '</section>'],
];
for (const [nombre, abre, cierra] of SECCIONES) {
  const p = html.indexOf(abre);
  if (p < 0) { problemas.push('no encuentro la sección ' + nombre); continue; }
  const q = html.indexOf(cierra, p);
  if (q < 0) { problemas.push('no encuentro el cierre de ' + nombre); continue; }
  const fin = q + cierra.length;
  html = html.slice(0, p) + `<!--sec:${nombre}-->` + html.slice(p, fin) + `<!--/sec:${nombre}-->` + html.slice(fin);
}
/* La colección se marca aparte porque su <section> tiene otra forma */
{
  const p = html.indexOf('<section id="coleccion" class="wrap">');
  const q = html.indexOf('</section>', html.indexOf('<div class="empty" id="empty" hidden>'));
  if (p < 0 || q < 0) problemas.push('no encuentro la sección coleccion');
  else {
    const fin = q + '</section>'.length;
    html = html.slice(0, p) + '<!--sec:coleccion-->' + html.slice(p, fin) + '<!--/sec:coleccion-->' + html.slice(fin);
  }
}

if (problemas.length) {
  console.error('NO se generó la plantilla. Problemas:');
  problemas.forEach((p) => console.error('  · ' + p));
  process.exit(1);
}

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, html);
const marcadores = [...html.matchAll(/\{\{\{?([\w.]+)\}?\}\}/g)].map((m) => m[1]);
console.log('plantilla escrita ·', new Set(marcadores).size, 'marcadores ·', html.length, 'bytes');
