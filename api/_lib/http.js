/* ═══════════════════════════════════════════════════════════════════════════
   AYUDAS DE HTTP
   ───────────────────────────────────────────────────────────────────────────
   Lo mínimo para no repetir en cada ruta el leer el cuerpo, responder JSON y
   traducir un error a algo que el dueño de la tienda pueda entender.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* Las fotos llegan en base64, que abulta un 33 %: una de 10 MB viaja como
   13,3 MB. El límite tiene que dejar sitio a eso o la conexión se corta antes
   de poder decirle al dueño qué pasó. */
const LIMITE_CUERPO = 16 * 1024 * 1024;

function json(res, codigo, datos, cabeceras = {}) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(cabeceras).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(datos));
}

const ok = (res, datos = {}) => json(res, 200, { ok: true, ...datos });

/* Un error siempre sale con la misma forma para que el panel lo pinte igual */
function fallo(res, codigo, mensaje, extra = {}) {
  return json(res, codigo, { ok: false, error: mensaje, ...extra });
}

/* Traduce cualquier excepción a una respuesta entendible. Los errores que no
   reconocemos NO se le enseñan al usuario: se registran y se responde algo
   genérico, para no filtrar detalles internos. */
function fallaronLasCosas(res, e) {
  if (e && e.name === 'ErrorDeDatos') {
    return fallo(res, 400, e.errores[0], { errores: e.errores });
  }
  if (e && e.name === 'ErrorDeAcceso') {
    return fallo(res, e.codigo, e.message);
  }
  console.error('[api]', e && e.stack ? e.stack : e);
  return fallo(res, 500, 'No fue posible completar la operación. Intenta nuevamente.');
}

function leerCrudo(req) {
  return new Promise((resolver, rechazar) => {
    if (req.body !== undefined && req.body !== null) {
      // Vercel a veces ya lo dejó leído
      if (Buffer.isBuffer(req.body)) return resolver(req.body);
      if (typeof req.body === 'string') return resolver(Buffer.from(req.body));
      return resolver(Buffer.from(JSON.stringify(req.body)));
    }
    const trozos = [];
    let total = 0;
    req.on('data', (t) => {
      total += t.length;
      if (total > LIMITE_CUERPO) {
        rechazar(Object.assign(new Error('El archivo es demasiado grande.'), { name: 'ErrorDeDatos', errores: ['El archivo pesa demasiado. El máximo son 9 MB.'] }));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => resolver(Buffer.concat(trozos)));
    req.on('error', rechazar);
  });
}

async function cuerpoJson(req) {
  const crudo = await leerCrudo(req);
  if (!crudo.length) return {};
  try {
    const x = JSON.parse(crudo.toString('utf8'));
    return x && typeof x === 'object' ? x : {};
  } catch (_) {
    const e = new Error('Los datos enviados no son válidos.');
    e.name = 'ErrorDeDatos';
    e.errores = ['Los datos enviados no son válidos.'];
    throw e;
  }
}

/* ── Cabeceras de seguridad ──────────────────────────────────────────────── */
function cabecerasSeguras(res, { esAdmin = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', esAdmin ? 'DENY' : 'SAMEORIGIN');
  if (esAdmin) {
    // El panel no se indexa nunca
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
}

/* Defensa contra CSRF: además de SameSite=Lax en la cookie, se exige que la
   petición venga del propio sitio. Sin esto, una página cualquiera podría
   hacerle un POST al panel usando la sesión abierta del dueño. */
function exigirMismoOrigen(req) {
  const metodo = (req.method || 'GET').toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return;
  const origen = req.headers.origin;
  if (!origen) return; // Peticiones sin Origin (curl, apps) no llevan cookie de navegador
  const anfitrion = req.headers['x-forwarded-host'] || req.headers.host || '';
  let host;
  try { host = new URL(origen).host; } catch (_) { host = ''; }
  if (host !== anfitrion) {
    const e = new Error('Petición bloqueada por seguridad.');
    e.name = 'ErrorDeAcceso';
    e.codigo = 403;
    throw e;
  }
}

module.exports = { json, ok, fallo, fallaronLasCosas, leerCrudo, cuerpoJson, cabecerasSeguras, exigirMismoOrigen, LIMITE_CUERPO };
