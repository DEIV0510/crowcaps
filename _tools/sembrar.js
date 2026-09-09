/* ═══════════════════════════════════════════════════════════════════════════
   SIEMBRA: pasa el catálogo actual a la base de datos
   ───────────────────────────────────────────────────────────────────────────
   Lee js/products.js y el manifiesto de imágenes y crea los productos, sus
   fotos y las categorías. Los textos del sitio ya vienen por defecto del mapa
   de contenido, así que la tienda arranca EXACTAMENTE igual que hoy.

   Es idempotente: se puede correr varias veces. Un producto que ya está no se
   duplica; se deja como está para no pisar ediciones hechas desde el panel.

   Uso: node _tools/sembrar.js            (siembra lo que falte)
        node _tools/sembrar.js --rehacer  (borra productos e imágenes y siembra)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { todos, uno, correr, ahora } = require('../api/_lib/db');
const { conImagenes, feedPorDefecto } = require('./build-html');

const RAIZ = path.join(__dirname, '..');
const rehacer = process.argv.includes('--rehacer');

const CATEGORIAS = [
  ['negras', 'Negras'], ['blancas', 'Blancas'], ['beige', 'Beige'],
  ['rojas', 'Rojas'], ['azules', 'Azules'], ['bicolor', 'Bicolor'],
];

(async () => {
  global.window = {};
  require(path.join(RAIZ, 'js', 'products.js'));
  const catalogo = global.window.CROWCAPS_PRODUCTS.map(conImagenes);

  if (rehacer) {
    await correr('DELETE FROM imagenes');
    await correr('DELETE FROM productos');
    console.log('· productos e imágenes borrados (--rehacer)');
  }

  /* Categorías */
  for (let i = 0; i < CATEGORIAS.length; i++) {
    const [slug, nombre] = CATEGORIAS[i];
    await correr(
      `INSERT INTO categorias (slug, nombre, orden, activa) VALUES (?,?,?,1)
       ON CONFLICT(slug) DO UPDATE SET nombre = excluded.nombre`,
      [slug, nombre, i + 1]
    );
  }

  /* Productos */
  let nuevos = 0, saltados = 0, fotos = 0;
  for (let i = 0; i < catalogo.length; i++) {
    const p = catalogo[i];
    const ya = await uno('SELECT id FROM productos WHERE slug = ?', [p.id]);
    if (ya) { saltados++; continue; }

    const r = await correr(
      `INSERT INTO productos (slug, nombre, equipo, modelo, colorway, precio, precio_antes,
         descripcion, descripcion_corta, caracteristicas, categorias, incluye, envio,
         destacado, publicado, orden, creado, actualizado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.name, p.team, null, p.colorway, p.price, null,
       p.desc, null, JSON.stringify(p.features || []), JSON.stringify(p.colors || []),
       null, null, 0, 1, i + 1, ahora(), ahora()]
    );
    nuevos++;

    for (let k = 0; k < p.imagenes.length; k++) {
      const im = p.imagenes[k];
      await correr(
        'INSERT INTO imagenes (producto_id, src, sm, w, h, sm_w, sm_h, alt, orden, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id, im.src, im.sm, im.w, im.h, im.smW, im.smH, k === 0 ? `Gorra ${p.name} — ${p.colorway}` : '', k, ahora()]
      );
      fotos++;
    }
  }

  /* Las tres del hero quedan marcadas como destacadas */
  const destacadas = ['yankees-navy-hueso', 'redsox-khaki-roja', 'padres-rosa-azul'];
  for (const slug of destacadas) await correr('UPDATE productos SET destacado = 1 WHERE slug = ?', [slug]);

  /* El mosaico del feed, tal como está hoy */
  const hayFeed = await uno("SELECT valor FROM ajustes WHERE clave = 'feed.imagenes'");
  if (!hayFeed) {
    await correr('INSERT INTO ajustes (clave, valor, actualizado) VALUES (?,?,?)',
      ['feed.imagenes', JSON.stringify(feedPorDefecto()), ahora()]);
  }

  const total = await uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NULL');
  console.log(`sembrado · nuevos: ${nuevos} · ya estaban: ${saltados} · fotos: ${fotos} · total en base: ${total.n}`);
})().catch((e) => { console.error(e); process.exit(1); });
