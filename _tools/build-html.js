/* ═══════════════════════════════════════════════════════════════════════════
   ESCRIBE _plantilla/respaldo.html (la copia de seguridad del sitio)
   ───────────────────────────────────────────────────────────────────────────
   Desde que existe el panel, la fuente de verdad es la base de datos y la
   página se sirve en caliente. Este archivo sigue existiendo por dos razones:

     · deja en el repo una copia revisable del sitio tal como quedó
     · es la RED DE SEGURIDAD: si la base falla, el servidor sirve este HTML

   Toma los datos de la base si la hay; si no, de js/products.js + los valores
   por defecto del contenido. En los dos casos usa el MISMO renderizador que
   el servidor, así que no hay dos versiones del HTML.

   Uso: node _tools/build-html.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { renderizar } = require('./render');
const { valoresPorDefecto } = require('./mapa-contenido');

const RAIZ = path.join(__dirname, '..');
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'img-manifest.json'), 'utf8'));

/* Añade a cada producto el tamaño real de sus fotos (sale del manifest) */
function conImagenes(p) {
  const lista = MAN[p.id] || [];
  const imagenes = p.imgs.map((f) => {
    const m = lista.find((x) => x.file === f) || {};
    return {
      src: 'assets/img/' + f,
      sm: 'assets/img/' + f.replace('.webp', '-sm.webp'),
      w: m.w || 515, h: m.h || 717, smW: m.smW || 360, smH: m.smH || 501,
    };
  });
  return { ...p, imagenes };
}

async function datosDesdeLaBase() {
  try {
    const C = require(path.join(RAIZ, 'api', '_lib', 'contenido.js'));
    const paquete = await C.paqueteDelSitio();
    if (paquete && paquete.productos.length) return paquete;
  } catch (_) { /* sin base: seguimos con los archivos */ }
  return null;
}

async function construir() {
  let productos, contenido;
  const deLaBase = await datosDesdeLaBase();

  if (deLaBase) {
    ({ productos, contenido } = deLaBase);
    console.log('datos: base de datos');
  } else {
    global.window = {};
    delete require.cache[require.resolve(path.join(RAIZ, 'js', 'products.js'))];
    require(path.join(RAIZ, 'js', 'products.js'));
    productos = global.window.CROWCAPS_PRODUCTS.map(conImagenes);
    contenido = valoresPorDefecto();
    contenido.feed.imagenes = feedPorDefecto();
    console.log('datos: js/products.js + contenido por defecto');
  }

  const html = renderizar({ productos, contenido });
  /* OJO: el respaldo NO puede vivir en la raíz. Si existe /index.html, Vercel
     lo sirve como archivo estático y la función (que es la que lee el CMS)
     nunca se ejecuta: el dueño guardaba cambios y la tienda seguía igual. */
  fs.mkdirSync(path.join(RAIZ, '_plantilla'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, '_plantilla', 'respaldo.html'), html);
  console.log('respaldo escrito ·', productos.length, 'fichas ·', html.length, 'bytes');
}

if (require.main === module) construir().catch((e) => { console.error(e); process.exit(1); });

/* Las nueve fotos del mosaico tal como estaban antes del CMS */
function feedPorDefecto() {
  const f = (src, alt, w, h) => ({ src: 'assets/img/' + src, alt, w, h });
  return [
    f('yankees-navy-hueso.webp', 'Gorra Yankees navy y hueso frente a un muro de grafiti', 515, 717),
    f('mets-royal-sm.webp', 'Gorra Mets azul rey puesta', 360, 433),
    f('boston-carmesi-sm.webp', 'Gorra Boston carmesí puesta', 360, 456),
    f('oveja-negra-sm.webp', 'Gorra negra con parche La Oveja Negra', 360, 479),
    f('yankees-hueso-sm.webp', 'Gorra Yankees hueso tonal', 360, 489),
    f('redsox-khaki-roja-2-sm.webp', 'Gorra Red Sox khaki con visera roja sobre una banca', 360, 506),
    f('braves-piedra-sm.webp', 'Gorra Braves piedra puesta', 360, 460),
    f('whitesox-arena-sm.webp', 'Gorra White Sox arena tonal en la mano', 360, 445),
    f('yankees-roja-navy-sm.webp', 'Gorra Yankees roja con visera azul marino', 360, 505),
  ];
}

module.exports = { conImagenes, feedPorDefecto, construir };
