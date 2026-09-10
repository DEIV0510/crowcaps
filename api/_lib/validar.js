/* ═══════════════════════════════════════════════════════════════════════════
   VALIDACIÓN
   ───────────────────────────────────────────────────────────────────────────
   Las mismas reglas para todas las rutas. Los mensajes están escritos para el
   dueño de la tienda, no para un programador: se muestran tal cual en el panel.

   Regla del proyecto que aquí se hace cumplir: NO se inventa información. Un
   producto sin nombre, sin equipo o sin foto no se puede publicar.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

class ErrorDeDatos extends Error {
  constructor(...errores) {
    super(errores[0]);
    this.name = 'ErrorDeDatos';
    this.errores = errores.flat().filter(Boolean);
  }
}

const texto = (v) => String(v == null ? '' : v).trim();

/* Quita etiquetas y espacios raros de un texto que va a salir en la página */
function limpio(v, max = 500) {
  return texto(v).replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').slice(0, max);
}

/* Los campos que sí admiten varias líneas (descripciones) */
function parrafo(v, max = 2000) {
  return texto(v).replace(/\r\n/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, max);
}

function slugificar(v) {
  return texto(v).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function entero(v, { min = null, max = null } = {}) {
  if (v === '' || v === null || v === undefined) return null;
  /* Sin un solo dígito no hay número: escribir "ochenta mil" en el precio tiene
     que dejarlo vacío (y entonces la gorra no se puede publicar), nunca en 0,
     que saldría en la tienda como "$0". */
  const soloDigitos = String(v).replace(/[^\d-]/g, '');
  if (!/\d/.test(soloDigitos)) return null;
  const n = Number(soloDigitos);
  if (!Number.isFinite(n)) return null;
  /* Fuera de rango se descarta, no se recorta: recortar convertía un -85000
     mal tecleado en 0, y la gorra salía a "$0" en la tienda. */
  if (min !== null && n < min) return null;
  if (max !== null && n > max) return null;
  return Math.round(n);
}

const bandera = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

function lista(v, max = 20, largo = 200) {
  const bruto = Array.isArray(v) ? v : String(v || '').split('\n');
  return bruto.map((x) => limpio(x, largo)).filter(Boolean).slice(0, max);
}

/* Un enlace tiene que ser http(s) o una ruta del propio sitio. Nada de
   javascript: ni data:, que serían una puerta abierta a XSS. */
function enlace(v, { permitirVacio = true } = {}) {
  const s = texto(v);
  if (!s) {
    if (permitirVacio) return '';
    throw new ErrorDeDatos('Falta el enlace.');
  }
  if (/^(https?:)?\/\//i.test(s) || /^\//.test(s) || /^assets\//.test(s) || /^#/.test(s)) {
    if (/^\s*javascript:/i.test(s) || /^\s*data:/i.test(s)) throw new ErrorDeDatos('Ese enlace no es válido.');
    return s.slice(0, 500);
  }
  throw new ErrorDeDatos('El enlace debe empezar por https:// o por /');
}

function correoValido(v) {
  const s = texto(v).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/* Solo dígitos: el número de WhatsApp viaja así en el enlace wa.me */
function telefono(v) {
  let s = texto(v).replace(/\D/g, '');
  /* Un celular colombiano escrito como se marca aquí (3xx xxx xxxx, 10 dígitos)
     es lo más natural de teclear, y sin el 57 delante wa.me contesta "el número
     no existe": todos los botones de la tienda quedarían muertos. Se completa. */
  if (/^3\d{9}$/.test(s)) s = '57' + s;
  if (s.length < 10 || s.length > 15) {
    throw new ErrorDeDatos('Ese número de WhatsApp no parece válido. Escríbelo con el indicativo del país, por ejemplo 573207224241.');
  }
  return s;
}

/* ── Producto ────────────────────────────────────────────────────────────── */
function producto(d, { esNuevo = false } = {}) {
  const errores = [];
  const p = {};

  p.nombre = limpio(d.nombre, 120);
  if (!p.nombre) errores.push('El nombre de la gorra es obligatorio.');

  p.equipo = limpio(d.equipo, 80);
  p.modelo = limpio(d.modelo, 80);
  p.colorway = limpio(d.colorway, 80);

  p.slug = slugificar(d.slug || p.nombre);
  if (!p.slug) errores.push('No pude armar la dirección (slug) de la gorra. Revisa el nombre.');

  /* min 1: un precio de 0 saldría en la tienda como "$0" y se podría comprar */
  p.precio = entero(d.precio, { min: 1, max: 99999999 });
  p.precio_antes = entero(d.precio_antes, { min: 1, max: 99999999 });
  if (p.precio === null && texto(d.precio) !== '') {
    errores.push('El precio tiene que ser un número mayor que cero, en pesos. Ejemplo: 85000.');
  }
  if (p.precio_antes !== null && p.precio !== null && p.precio_antes <= p.precio) {
    errores.push('El precio anterior tiene que ser mayor que el precio actual.');
  }

  p.descripcion = parrafo(d.descripcion, 1200);
  p.descripcion_corta = limpio(d.descripcion_corta, 200);
  p.caracteristicas = lista(d.caracteristicas, 10, 160);
  p.categorias = lista(d.categorias, 10, 40).map(slugificar).filter(Boolean);
  p.incluye = limpio(d.incluye, 200);
  p.envio = limpio(d.envio, 200);
  p.destacado = bandera(d.destacado);
  p.publicado = bandera(d.publicado);
  /* Se deja SIN DEFINIR si no vino: el editor no manda `orden`, y forzarlo a 0
     mandaba la gorra al primer puesto de la tienda cada vez que se guardaba,
     deshaciendo el orden que el dueño armó a mano. */
  const ordenPedido = entero(d.orden, { min: 0, max: 99999 });
  if (ordenPedido !== null) p.orden = ordenPedido;

  /* Publicar exige lo mínimo para que la ficha no salga coja */
  if (p.publicado) {
    if (!p.descripcion) errores.push('Para publicar, la gorra necesita una descripción.');
    if (p.precio === null) errores.push('Para publicar, la gorra necesita un precio.');
  }

  if (errores.length) throw new ErrorDeDatos(errores);
  return p;
}

/* ── Categoría ───────────────────────────────────────────────────────────── */
function categoria(d) {
  const nombre = limpio(d.nombre, 40);
  if (!nombre) throw new ErrorDeDatos('La categoría necesita un nombre.');
  const slug = slugificar(d.slug || nombre);
  if (!slug) throw new ErrorDeDatos('No pude armar la dirección de la categoría.');
  return { nombre, slug, orden: entero(d.orden, { min: 0, max: 999 }) || 0, activa: d.activa === undefined ? 1 : bandera(d.activa) };
}

module.exports = {
  ErrorDeDatos, texto, limpio, parrafo, slugificar, entero, bandera, lista,
  enlace, correoValido, telefono, producto, categoria,
};
