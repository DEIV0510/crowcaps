/* ═══════════════════════════════════════════════════════════════════════════
   LA TIENDA PÚBLICA
   ───────────────────────────────────────────────────────────────────────────
   Sirve la portada armada con lo que hay en la base, usando EL MISMO
   renderizador que escribe el index.html del repositorio.

   Dos cosas importantes:

   · Si la base falla, NO se muestra un error: se sirve el index.html del
     repositorio, que es la última copia buena. La tienda no se cae porque
     el panel tenga un problema.

   · La caché del borde evita pagar una función por visita, pero sin
     stale-while-revalidate: con él, el dueño guarda un cambio y sigue viendo
     lo viejo durante horas. Diez segundos de caché son suficientes.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { RAIZ } = require('./db');
const C = require('./contenido');
const auth = require('./auth');
const { cabecerasSeguras } = require('./http');
const { renderizar } = require(path.join(RAIZ, '_tools', 'render.js'));

const CACHE_PAGINA = 'public, max-age=0, s-maxage=10';
const RESPALDO = path.join(RAIZ, '_plantilla', 'respaldo.html');

/* La plantilla se lee una vez por arranque en frío */
let plantilla = null;
function leerPlantilla() {
  if (!plantilla) plantilla = fs.readFileSync(path.join(RAIZ, '_plantilla', 'index.html'), 'utf8');
  return plantilla;
}

async function portada(req, res, { vistaPrevia = false } = {}) {
  try {
    const paquete = await C.paqueteDelSitio();

    /* Vista previa: solo con sesión abierta, y entran también los borradores */
    let productos = paquete.productos;
    if (vistaPrevia) {
      const usuario = await auth.usuarioActual(req);
      if (!usuario) {
        res.statusCode = 302;
        res.setHeader('Location', '/admin');
        return res.end();
      }
      const todosP = await C.productos({ soloPublicados: false });
      productos = todosP.filter((p) => p.imagenes.length);
    }

    /* OJO: quedarse sin gorras publicadas NO es un fallo, es una decisión del
       dueño (ocultarlas todas mientras repone). Antes se servía el respaldo y
       la tienda seguía enseñando el catálogo viejo —con precios y botón de
       compra— sin forma de quitarlo. La plantilla ya trae el bloque de
       «colección vacía» justo para esto. */
    const html = renderizar({ productos, contenido: paquete.contenido, plantilla: leerPlantilla() });
    cabecerasSeguras(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', vistaPrevia ? 'no-store' : CACHE_PAGINA);
    if (vistaPrevia) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.end(html);
  } catch (e) {
    console.error('[publico] no pude armar la portada:', e && e.message);
    try {
      const respaldo = fs.readFileSync(RESPALDO, 'utf8');
      cabecerasSeguras(res);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5');
      res.setHeader('X-Respaldo', '1');   // deja rastro para diagnosticar
      return res.end(respaldo);
    } catch (_) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('La tienda no está disponible en este momento.');
    }
  }
}

/* ── La gorra que viaja por WhatsApp: /g/<slug> ──────────────────────────────
   Por un enlace wa.me solo puede ir texto; no hay forma de adjuntar una foto.
   Lo que sí hace WhatsApp es leer las etiquetas og: del primer enlace del
   mensaje y enseñar su imagen como vista previa. Así llega la foto de la gorra
   al chat del dueño: el mensaje lleva crowcaps.co/g/<slug>, y esta página tiene
   en og:image la foto de ESA gorra.

   La vista previa la arma el teléfono del cliente mientras escribe, así que
   todo esto tiene que responder rápido: la página es mínima y la foto se sirve
   desde la caché del borde después de la primera vez. */

const crypto = require('crypto');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const copStr = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

function origenDe(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'crowcaps.co';
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return proto.split(',')[0] + '://' + String(host).split(',')[0];
}

async function gorraPublicada(slug) {
  const lista = await C.productos({ soloPublicados: true });
  return lista.find((p) => p.id === slug && p.imagenes && p.imagenes.length) || null;
}

/* Cambia si cambia la foto principal, para que nadie se quede con la vieja */
const huellaFoto = (p) => crypto.createHash('md5').update(String(p.imagenes[0].src)).digest('hex').slice(0, 8);

async function fichaCompartida(req, res, slug) {
  const p = await gorraPublicada(slug);
  if (!p) {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }
  const origen = origenDe(req);
  const url = origen + '/g/' + encodeURIComponent(p.id);
  const foto = url + '/foto.jpg?v=' + huellaFoto(p);
  const tienda = '/?gorra=' + encodeURIComponent(p.id);
  const titulo = 'Gorra ' + p.name + ' · ' + copStr(p.price);
  const detalle = [p.team, p.colorway].filter(Boolean).join(' · ');

  const html = '<!doctype html><html lang="es-CO"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(titulo) + ' · CrowCaps</title>' +
    '<meta name="robots" content="noindex">' +
    '<meta name="description" content="' + esc(detalle) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="CrowCaps">' +
    '<meta property="og:title" content="' + esc(titulo) + '">' +
    '<meta property="og:description" content="' + esc(detalle) + '">' +
    '<meta property="og:url" content="' + esc(url) + '">' +
    '<meta property="og:image" content="' + esc(foto) + '">' +
    '<meta property="og:image:secure_url" content="' + esc(foto) + '">' +
    '<meta property="og:image:type" content="image/jpeg">' +
    '<meta property="og:image:width" content="800">' +
    '<meta property="og:image:height" content="800">' +
    '<meta property="og:image:alt" content="' + esc('Gorra ' + p.name) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<link rel="icon" href="/favicon.ico?v=2" sizes="any">' +
    /* Las personas van a la tienda con la ficha abierta; los lectores de
       vista previa no ejecutan JavaScript y se quedan con las etiquetas. */
    '<script>location.replace(' + JSON.stringify(tienda).replace(/</g, '\\u003c') + ');</script>' +
    '<style>body{margin:0;font:15px/1.4 system-ui,sans-serif;background:#efeae1;color:#111110;' +
    'display:grid;place-items:center;min-height:100vh;text-align:center}img{width:min(80vw,420px);' +
    'height:auto;display:block;margin:0 auto 14px}a{color:#111110}</style></head><body><main>' +
    '<img src="' + esc(foto) + '" width="800" height="800" alt="' + esc('Gorra ' + p.name) + '">' +
    '<p><b>' + esc(titulo) + '</b><br>' + esc(detalle) + '</p>' +
    '<p><a href="' + esc(tienda) + '">Ver en la tienda</a></p></main></body></html>';

  cabecerasSeguras(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.end(req.method === 'HEAD' ? undefined : html);
}

/* La foto en JPEG cuadrado: WhatsApp no lee bien WebP en las vistas previas y
   la quiere ligera. La gorra va entera (contain) sobre el papel de la marca,
   para que el recorte cuadrado del chat no le corte nada. */
const LADO_FOTO = 800;

async function leerFoto(src, req) {
  if (!/^https?:/.test(src)) {
    const local = path.join(RAIZ, src.replace(/^\/+/, ''));
    if (local.startsWith(RAIZ) && fs.existsSync(local)) return fs.readFileSync(local);
  }
  const absoluta = /^https?:/.test(src) ? src : origenDe(req) + '/' + src.replace(/^\/+/, '');
  const r = await fetch(absoluta);
  if (!r.ok) throw new Error('foto ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function fotoCompartida(req, res, slug) {
  const p = await gorraPublicada(slug);
  if (!p) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('No encontrada');
  }
  const sharp = require('sharp');
  const jpg = await sharp(await leerFoto(p.imagenes[0].src, req))
    .rotate()
    .resize(LADO_FOTO, LADO_FOTO, { fit: 'contain', background: '#efeae1' })
    .flatten({ background: '#efeae1' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(jpg.length));
  /* La URL lleva ?v=<huella de la foto>: puede guardarse mucho tiempo */
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
  return res.end(req.method === 'HEAD' ? undefined : jpg);
}

module.exports = { portada, fichaCompartida, fotoCompartida, CACHE_PAGINA };
