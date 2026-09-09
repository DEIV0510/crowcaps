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

    if (!productos.length) throw new Error('sin productos en la base');

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

module.exports = { portada, CACHE_PAGINA };
