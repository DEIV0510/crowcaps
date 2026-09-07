/* CrowCaps · inyecta la grilla de productos dentro de index.html
   El grid queda en el HTML (SEO + sin salto de layout + funciona sin JS).
   Uso: node _tools/build-html.js                                            */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'js', 'products.js'));
const P = global.window.CROWCAPS_PRODUCTS;
const MAN = require('./img-manifest.json');

const BIG = [0, 14];               // fichas destacadas (ocupan 2x2)
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function card(p, i) {
  const meta = (MAN[p.id] || [])[0] || { w: 640, h: 800 };
  const big = BIG.indexOf(i) > -1;
  const n = String(i + 1).padStart(3, '0');
  const alt = `Gorra ${p.name} de ${p.team}, colorway ${p.colorway}`;
  const sizes = big
    ? '(max-width: 760px) 100vw, (max-width: 1180px) 66vw, 50vw'
    : '(max-width: 760px) 50vw, (max-width: 1180px) 33vw, 25vw';
  const src = f => `assets/img/${f}`;
  const set = f => `${src(f.replace('.webp', '-sm.webp'))} 340w, ${src(f)} 640w`;
  const alt2 = p.imgs[1]
    ? `\n      <img class="alt" src="${src(p.imgs[1])}" srcset="${set(p.imgs[1])}" sizes="${sizes}" width="${meta.w}" height="${meta.h}" alt="" loading="lazy" decoding="async">`
    : '';
  const search = esc([p.name, p.team, p.colorway, p.colors.join(' ')].join(' '));

  return `    <button class="card${big ? ' card--big' : ''} reveal" type="button" data-id="${p.id}" data-colors="${p.colors.join(' ')}" data-search="${search}" aria-label="Ver ficha de la gorra ${esc(p.name)}">
    <span class="card__media">
      <span class="card__n">Nº ${n}</span>
      <img src="${src(p.imgs[0])}" srcset="${set(p.imgs[0])}" sizes="${sizes}" width="${meta.w}" height="${meta.h}" alt="${esc(alt)}" loading="lazy" decoding="async">${alt2}
      <span class="card__go">Ver ficha</span>
    </span>
    <span class="card__info">
      <span class="card__team">${esc(p.team)}</span>
      <span class="card__name">${esc(p.name)}</span>
      <span class="card__color">${esc(p.colorway)}</span>
    </span>
  </button>`;
}

const file = path.join(ROOT, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const A = '<!-- grid:start -->', B = '<!-- grid:end -->';
const i = html.indexOf(A), j = html.indexOf(B);
if (i < 0 || j < 0) throw new Error('No encuentro los marcadores grid:start / grid:end');

const grid = P.map(card).join('\n');
html = html.slice(0, i + A.length) + '\n' + grid + '\n    ' + html.slice(j);

// JSON-LD del catalogo (sin precios: no existen todavia)
const ld = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Colección CrowCaps',
  numberOfItems: P.length,
  itemListElement: P.map((p, k) => ({
    '@type': 'ListItem', position: k + 1,
    item: { '@type': 'Product', name: `Gorra ${p.name}`, brand: { '@type': 'Brand', name: 'CrowCaps' }, description: p.desc, image: `assets/img/${p.imgs[0]}` }
  }))
};
const L1 = '<!-- ld:start -->', L2 = '<!-- ld:end -->';
const a = html.indexOf(L1), b = html.indexOf(L2);
if (a > -1 && b > -1) {
  html = html.slice(0, a + L1.length) +
    '\n<script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n' +
    html.slice(b);
}

// sincroniza el numero de referencias en el copy para que nunca se desfase
html = html.replace(/(<span id="refCount">)\d+(<\/span>)/, '$1' + P.length + '$2');
html = html.replace(/(<div><b>)\d+(<\/b><span>Referencias)/, '$1' + P.length + '$2');
html = html.replace(/Ver las \d+/g, 'Ver las ' + P.length);
html = html.replace(/\d+ referencias reales/g, P.length + ' referencias reales');

fs.writeFileSync(file, html);
console.log('index.html actualizado ·', P.length, 'fichas ·', BIG.length, 'destacadas');
