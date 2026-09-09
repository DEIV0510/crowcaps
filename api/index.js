/* ═══════════════════════════════════════════════════════════════════════════
   PUNTO DE ENTRADA
   ───────────────────────────────────────────────────────────────────────────
   Una sola función atiende: la portada, el panel y la API. Así el proyecto
   sigue siendo uno solo y no hay que mantener dos despliegues.

   La regla de oro está en `exigir`: cualquier ruta bajo /api/admin comprueba
   la sesión EN EL SERVIDOR antes de hacer nada. Da igual lo que enseñe o
   esconda el navegador.

   OJO con los `return await`: sin el await, la promesa se devuelve fuera del
   try y el catch no la ve; el error salía como "Error interno" en vez del
   mensaje de validación. No quitar los await aunque parezcan redundantes.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const auth = require('./_lib/auth');
const { json, ok, fallo, fallaronLasCosas, cabecerasSeguras, exigirMismoOrigen } = require('./_lib/http');
const R = require('./_lib/rutas-admin');
const publico = require('./_lib/publico');
const { comprobar, uno } = require('./_lib/db');

const RAIZ = path.join(__dirname, '..');

/* ── Panel (HTML estático servido por la función, nunca indexable) ───────── */
function servirPanel(res, archivo) {
  const p = path.join(RAIZ, '_panel', archivo);
  if (!fs.existsSync(p)) return fallo(res, 404, 'No encuentro el panel.');
  cabecerasSeguras(res, { esAdmin: true });
  res.statusCode = 200;
  res.setHeader('Content-Type', archivo.endsWith('.css') ? 'text/css; charset=utf-8'
    : archivo.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(fs.readFileSync(p));
}

/* ── Enrutador ───────────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  const metodo = (req.method || 'GET').toUpperCase();
  const url = new URL(req.url, 'http://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost'));
  const ruta = url.pathname.replace(/\/+$/, '') || '/';

  try {
    /* ── Público ─────────────────────────────────────────────────────────── */
    if (ruta === '/' || ruta === '/index.html') return await publico.portada(req, res);
    if (ruta === '/vista-previa') return await publico.portada(req, res, { vistaPrevia: true });

    /* ── Panel ───────────────────────────────────────────────────────────── */
    if (ruta === '/admin') return servirPanel(res, 'index.html');
    if (ruta === '/admin/panel.css') return servirPanel(res, 'panel.css');
    if (ruta === '/admin/panel.js') return servirPanel(res, 'panel.js');
    if (ruta.startsWith('/admin/')) return servirPanel(res, 'index.html');

    /* ── Diagnóstico (sin datos sensibles) ───────────────────────────────── */
    if (ruta === '/api/estado') {
      const base = await comprobar();
      let instalado = false;
      try { instalado = Number((await uno('SELECT COUNT(*) AS n FROM usuarios')).n) > 0; } catch (_) {}
      return json(res, base.ok ? 200 : 503, {
        ok: base.ok,
        base: base.ok ? base.motor : 'sin conexión',
        productos: base.productos || 0,
        instalado,
        almacenamiento: process.env.BLOB_READ_WRITE_TOKEN ? 'vercel blob' : 'disco local',
        entorno: process.env.VERCEL_ENV || 'local',
      });
    }

    if (!ruta.startsWith('/api/')) return fallo(res, 404, 'No encontrado.');

    /* Todo lo que cambia algo tiene que venir del propio sitio (anti-CSRF) */
    exigirMismoOrigen(req);
    cabecerasSeguras(res, { esAdmin: true });

    /* ── Sesión ──────────────────────────────────────────────────────────── */
    if (ruta === '/api/auth/yo' && metodo === 'GET') return await R.yo(req, res);
    if (ruta === '/api/auth/login' && metodo === 'POST') return await R.login(req, res);
    if (ruta === '/api/auth/logout' && metodo === 'POST') return await R.logout(req, res);
    if (ruta === '/api/auth/instalar' && metodo === 'POST') return await R.instalar(req, res);

    /* ── A partir de aquí, hace falta sesión ─────────────────────────────── */
    if (!ruta.startsWith('/api/admin/')) return fallo(res, 404, 'No encontrado.');
    const usuario = await auth.exigir(req, 'contenido');

    const resto = ruta.slice('/api/admin/'.length);
    const partes = resto.split('/').filter(Boolean);

    /* /api/admin/resumen */
    if (resto === 'resumen' && metodo === 'GET') return await R.resumen(req, res);
    if (resto === 'clave' && metodo === 'POST') return await R.cambiarClave(req, res, usuario);
    if (resto === 'auditoria' && metodo === 'GET') return await R.verAuditoria(req, res, usuario, url);
    if (resto === 'biblioteca' && metodo === 'GET') return await R.biblioteca(req, res);

    /* /api/admin/contenido */
    if (resto === 'contenido' && metodo === 'GET') return await R.verContenido(req, res);
    if (resto === 'contenido' && metodo === 'PUT') return await R.guardarContenido(req, res, usuario);

    /* /api/admin/categorias[/:id] */
    if (partes[0] === 'categorias') {
      if (partes.length === 1 && metodo === 'GET') return await R.listarCategorias(req, res);
      if (partes.length === 1 && metodo === 'POST') return await R.guardarCategoria(req, res, usuario, url, null);
      if (partes.length === 2 && metodo === 'PUT') return await R.guardarCategoria(req, res, usuario, url, partes[1]);
      if (partes.length === 2 && metodo === 'DELETE') return await R.borrarCategoria(req, res, usuario, url, partes[1]);
    }

    /* /api/admin/imagenes/... */
    if (partes[0] === 'imagenes') {
      if (partes[1] === 'orden' && metodo === 'POST') return await R.ordenarImagenes(req, res, usuario);
      if (partes.length === 2 && metodo === 'DELETE') return await R.borrarImagen(req, res, usuario, url, partes[1]);
    }

    /* /api/admin/productos/... */
    if (partes[0] === 'productos') {
      if (partes.length === 1 && metodo === 'GET') return await R.listarProductos(req, res, usuario, url);
      if (partes.length === 1 && metodo === 'POST') return await R.crearProducto(req, res, usuario);
      if (partes[1] === 'orden' && metodo === 'POST') return await R.ordenarProductos(req, res, usuario);

      const id = partes[1];
      if (partes.length === 2 && metodo === 'GET') return await R.verProducto(req, res, usuario, url, id);
      if (partes.length === 2 && metodo === 'PUT') return await R.editarProducto(req, res, usuario, url, id);
      if (partes.length === 2 && metodo === 'DELETE') return await R.borrarProducto(req, res, usuario, url, id);

      if (partes[2] === 'duplicar' && metodo === 'POST') return await R.duplicarProducto(req, res, usuario, url, id);
      if (partes[2] === 'restaurar' && metodo === 'POST') return await R.restaurarProducto(req, res, usuario, url, id);
      if (partes[2] === 'publicado' && metodo === 'POST') return await R.alternar(req, res, usuario, url, id, 'publicado');
      if (partes[2] === 'destacado' && metodo === 'POST') return await R.alternar(req, res, usuario, url, id, 'destacado');
      if (partes[2] === 'imagenes' && metodo === 'POST') return await R.subirImagen(req, res, usuario, url, id);
    }

    return fallo(res, 404, 'Esa operación no existe.');
  } catch (e) {
    return fallaronLasCosas(res, e);
  }
};
