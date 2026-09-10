/* ═══════════════════════════════════════════════════════════════════════════
   CONTENIDO Y CONFIGURACIÓN
   ───────────────────────────────────────────────────────────────────────────
   Todo lo que no es un producto (textos del home, marca, redes, envíos, SEO,
   qué secciones se ven) vive en la tabla `ajustes` como pares clave/valor.

   Los valores por defecto salen de _tools/mapa-contenido.js, es decir, de los
   textos que hoy tiene la página. Así, una instalación limpia arranca con el
   sitio tal como está y el dueño solo cambia lo que quiera.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const { todos, uno, correr, enLote, ahora, RAIZ } = require('./db');
const { valoresPorDefecto, poner, sacar } = require(path.join(RAIZ, '_tools', 'mapa-contenido.js'));
const { ErrorDeDatos, limpio, parrafo, telefono, enlace, bandera, lista } = require('./validar');

/* Claves que el panel puede escribir. Cualquier otra se rechaza: así una
   petición manipulada no puede meter basura en la configuración. */
const EDITABLES = new Set([
  'seo.titulo', 'seo.descripcion', 'seo.canonical', 'seo.og_url', 'seo.og_descripcion',
  'seo.og_imagen', 'seo.og_imagen_alt',
  'marca.nombre', 'marca.nombre_loader',
  'nav.coleccion', 'nav.coleccion_movil', 'nav.marca', 'nav.marca_movil', 'nav.feed',
  'nav.feed_movil', 'nav.contacto', 'nav.cta', 'nav.menu_ciudad',
  'hero.eyebrow_pre', 'hero.eyebrow_post', 'hero.titulo1', 'hero.titulo2', 'hero.titulo3',
  'hero.lead', 'hero.cta1', 'hero.cta2', 'hero.stat1_etiqueta', 'hero.stat2_valor',
  'hero.stat2_etiqueta', 'hero.stat3_valor', 'hero.stat3_etiqueta',
  'hero.principal', 'hero.destacadas',
  'coleccion.titulo', 'coleccion.texto', 'coleccion.buscador', 'coleccion.vacio_titulo',
  'coleccion.vacio_texto', 'coleccion.vacio_cta',
  'perks.1_titulo', 'perks.1_texto', 'perks.2_titulo', 'perks.2_texto',
  'perks.3_titulo', 'perks.3_texto', 'perks.4_titulo', 'perks.4_texto',
  'editorial.eyebrow', 'editorial.titulo', 'editorial.texto', 'editorial.cta',
  'editorial.imagen', 'editorial.img_alt', 'editorial.img_w', 'editorial.img_h',
  'about.eyebrow', 'about.p1', 'about.p2', 'about.cita', 'about.cita_autor',
  'feed.titulo', 'feed.texto', 'feed.imagenes',
  'final.titulo', 'final.texto',
  'footer.nota', 'footer.col2', 'footer.col2_l1', 'footer.col2_l2', 'footer.col2_l3',
  'footer.col3', 'footer.col3_wa', 'footer.col3_envio', 'footer.col4',
  'footer.copyright', 'footer.lema',
  'ficha.incluye', 'ficha.envio', 'ficha.disponibilidad', 'ficha.nota_precio',
  'redes.instagram_url', 'redes.tiktok_url', 'redes.facebook_url',
  'redes.instagram_etiqueta', 'redes.tiktok_etiqueta', 'redes.facebook_etiqueta',
  'redes.instagram_visible', 'redes.tiktok_visible', 'redes.facebook_visible',
  'contacto.whatsapp', 'contacto.whatsapp_visible', 'contacto.mensaje_general',
  'contacto.mensaje_producto', 'contacto.mensaje_busqueda', 'contacto.mensaje_cierre',
  'envios.texto_corto', 'envios.texto_ficha',
  'ticker.palabras',
  'secciones.hero', 'secciones.coleccion', 'secciones.perks', 'secciones.editorial',
  'secciones.about', 'secciones.feed', 'secciones.final',
]);

/* Claves que llevan HTML sencillo (negritas del titular). Se limpia lo demás. */
const CON_HTML = new Set(['hero.titulo3', 'editorial.titulo', 'final.titulo']);

/* Deja pasar <em>, <br> y <strong>; todo lo demás se escapa. Sin esto, el
   panel sería una vía directa para inyectar scripts en la página pública. */
function htmlSeguro(v) {
  /* El separador es un carácter que no puede venir del panel: se quita de la
     entrada antes de nada, así nadie puede fabricar uno y colar una marca. */
  const SEP = '\u0000';
  const marcas = [];
  let s = String(v || '').split(SEP).join('').replace(/<\/?(em|strong|br)\s*\/?>/gi, (m) => {
    marcas.push(m.toLowerCase().replace(/\s+/g, '').replace('/>', '>'));
    return SEP + (marcas.length - 1) + SEP;
  });
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => marcas[Number(i)]).slice(0, 400);
}

/* ── Lectura ─────────────────────────────────────────────────────────────── */
async function contenido() {
  const base = valoresPorDefecto();
  const filas = await todos('SELECT clave, valor FROM ajustes');
  for (const f of filas) {
    let v = f.valor;
    try { v = JSON.parse(f.valor); } catch (_) { /* texto suelto */ }
    poner(base, f.clave, v);
  }
  return base;
}

/* ── Escritura ───────────────────────────────────────────────────────────── */

/* Los interruptores van en una lista explícita. Antes bastaba con que la clave
   terminara en `_visible`, y `contacto.whatsapp_visible` —que es el número TAL
   COMO SE ESCRIBE en la página, un texto— se guardaba como `false`: el dueño
   volvía a la pantalla y encontraba la palabra «false» en la casilla. */
const INTERRUPTORES = new Set([
  'redes.instagram_visible', 'redes.tiktok_visible', 'redes.facebook_visible',
]);

/* Cómo se llama cada campo en la pantalla, para que el error diga dónde mirar */
const NOMBRES = {
  'contacto.whatsapp': 'Número de WhatsApp',
  'contacto.whatsapp_visible': 'Número como se muestra',
  'redes.instagram_url': 'Enlace de Instagram',
  'redes.tiktok_url': 'Enlace de TikTok',
  'redes.facebook_url': 'Enlace de Facebook',
  'seo.canonical': 'Dirección oficial del sitio',
  'seo.og_url': 'Dirección para redes',
  'seo.og_imagen': 'Imagen para redes',
  'editorial.imagen': 'Imagen del bloque editorial',
  'feed.imagenes': 'Fotos del feed',
  'ticker.palabras': 'Palabras de la cinta',
  'hero.destacadas': 'Gorras destacadas de la portada',
};

function normalizar(clave, valor) {
  if (clave === 'contacto.whatsapp') return telefono(valor);
  if (clave.startsWith('secciones.') || INTERRUPTORES.has(clave)) return !!bandera(valor);
  if (clave === 'ticker.palabras') return lista(valor, 12, 30);
  if (clave === 'hero.destacadas') return lista(valor, 6, 60);
  if (clave === 'feed.imagenes') {
    const arr = Array.isArray(valor) ? valor : [];
    return arr.slice(0, 12).map((f) => ({
      src: enlace(f.src, { permitirVacio: false }),
      alt: limpio(f.alt, 160),
      w: Number(f.w) || 360, h: Number(f.h) || 480,
    }));
  }
  if (clave.endsWith('_url') || clave === 'editorial.imagen' || clave === 'seo.og_imagen' ||
      clave === 'seo.canonical' || clave === 'seo.og_url') {
    return enlace(valor);
  }
  if (CON_HTML.has(clave)) return htmlSeguro(valor);
  if (clave === 'about.p1' || clave === 'about.p2' || clave === 'seo.descripcion' ||
      clave === 'hero.lead' || clave === 'coleccion.texto' || clave.startsWith('contacto.mensaje')) {
    return parrafo(valor, 600);
  }
  return limpio(valor, 300);
}

async function guardar(cambios) {
  const entradas = Object.entries(cambios || {});
  if (!entradas.length) return 0;

  const desconocidas = entradas.filter(([k]) => !EDITABLES.has(k)).map(([k]) => k);
  if (desconocidas.length) throw new ErrorDeDatos('No reconozco estos campos: ' + desconocidas.join(', '));

  /* Primero se revisa TODO y después se escribe: antes se guardaba campo por
     campo, así que un enlace mal escrito a mitad de la pantalla dejaba la
     primera parte guardada y la segunda no, y el dueño no sabía qué quedó.
     Además el error dice de qué campo habla. */
  const listos = [];
  const problemas = [];
  for (const [clave, bruto] of entradas) {
    try {
      listos.push([clave, JSON.stringify(normalizar(clave, bruto))]);
    } catch (e) {
      problemas.push((NOMBRES[clave] || clave) + ': ' + (e && e.message ? e.message : 'valor no válido'));
    }
  }
  if (problemas.length) throw new ErrorDeDatos(problemas);

  const ahoraMismo = ahora();
  const SQL = `INSERT INTO ajustes (clave, valor, actualizado) VALUES (?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado`;
  await enLote(listos.map(([clave, texto]) => [SQL, [clave, texto, ahoraMismo]]));
  return listos.length;
}

/* ── Productos ───────────────────────────────────────────────────────────── */
function armarProducto(fila, fotos) {
  const cat = (() => { try { return JSON.parse(fila.categorias); } catch (_) { return []; } })();
  const car = (() => { try { return JSON.parse(fila.caracteristicas); } catch (_) { return []; } })();
  return {
    dbId: fila.id,
    id: fila.slug,
    name: fila.nombre,
    team: fila.equipo,
    modelo: fila.modelo,
    colorway: fila.colorway,
    price: fila.precio,
    precio_antes: fila.precio_antes,
    desc: fila.descripcion,
    desc_corta: fila.descripcion_corta,
    features: car,
    colors: cat,
    /* Sin estos dos, el editor los pintaba vacíos al reabrir la gorra y el
       siguiente guardado los borraba de la base sin que nadie lo pidiera. */
    incluye: fila.incluye || '',
    envio: fila.envio || '',
    destacado: !!fila.destacado,
    publicado: !!fila.publicado,
    orden: fila.orden,
    actualizado: fila.actualizado,
    imagenes: fotos.map((f) => ({
      id: f.id, src: f.src, sm: f.sm || f.src,
      w: f.w || 515, h: f.h || 717, smW: f.sm_w || 360, smH: f.sm_h || 501,
      alt: f.alt || '',
    })),
  };
}

/* papelera: true devuelve SOLO las eliminadas, para poder recuperarlas. La
   tienda nunca pide esto: allí siempre se piden las publicadas. */
async function productos({ soloPublicados = true, papelera = false } = {}) {
  const filas = await todos(
    papelera
      ? 'SELECT * FROM productos WHERE eliminado IS NOT NULL ORDER BY eliminado DESC, id DESC'
      : `SELECT * FROM productos
          WHERE eliminado IS NULL ${soloPublicados ? 'AND publicado = 1' : ''}
          ORDER BY orden ASC, id ASC`
  );
  if (!filas.length) return [];
  const fotos = await todos('SELECT * FROM imagenes ORDER BY producto_id ASC, orden ASC, id ASC');
  const porProducto = new Map();
  fotos.forEach((f) => {
    if (!porProducto.has(f.producto_id)) porProducto.set(f.producto_id, []);
    porProducto.get(f.producto_id).push(f);
  });
  return filas.map((f) => armarProducto(f, porProducto.get(f.id) || []));
}

async function categorias({ soloActivas = true } = {}) {
  return todos(
    `SELECT * FROM categorias ${soloActivas ? 'WHERE activa = 1' : ''} ORDER BY orden ASC, id ASC`
  );
}

/* Todo lo que necesita el renderizador, en una sola llamada */
async function paqueteDelSitio() {
  const [c, P, cats] = await Promise.all([contenido(), productos({ soloPublicados: true }), categorias({})]);
  c.categorias = cats.map((x) => ({ slug: x.slug, nombre: x.nombre }));
  return { contenido: c, productos: P.filter((p) => p.imagenes.length) };
}

module.exports = {
  contenido, guardar, productos, categorias, paqueteDelSitio, armarProducto,
  EDITABLES, htmlSeguro, sacar,
};
