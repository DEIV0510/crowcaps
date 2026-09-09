/* ═══════════════════════════════════════════════════════════════════════════
   AUTENTICACIÓN Y PERMISOS
   ───────────────────────────────────────────────────────────────────────────
   Decisiones importantes, para que quede escrito por qué:

   · La contraseña NUNCA se guarda. Se guarda un hash scrypt con sal propia.
     scrypt viene dentro de Node, así que no hace falta ninguna librería más.
   · La sesión es una cookie httpOnly: el JavaScript de la página no la puede
     leer, así que un XSS no se lleva la sesión.
   · En la base de datos tampoco se guarda el token de sesión tal cual, sino
     su hash. Si alguien lee la tabla, no puede hacerse pasar por nadie.
   · El login aguanta un máximo de intentos por IP y por correo, para que no
     se pueda probar contraseñas a lo bruto.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');
const { todos, uno, correr, ahora } = require('./db');

const COOKIE = 'cc_sesion';
const DIAS_SESION = 7;
const MAX_INTENTOS = 8;          // por ventana
const VENTANA_MINUTOS = 15;

/* ── Contraseñas ─────────────────────────────────────────────────────────── */

function hashear(clave) {
  const sal = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(clave), sal, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$16384$8$1$' + sal.toString('hex') + '$' + dk.toString('hex');
}

function verificar(clave, guardado) {
  try {
    const partes = String(guardado || '').split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
    const [, N, r, p, salHex, dkHex] = partes;
    const sal = Buffer.from(salHex, 'hex');
    const esperado = Buffer.from(dkHex, 'hex');
    const dk = crypto.scryptSync(String(clave), sal, esperado.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    // Comparación en tiempo constante: si no, el tiempo de respuesta filtra
    // cuántos caracteres acertó quien lo está intentando.
    return crypto.timingSafeEqual(dk, esperado);
  } catch (_) {
    return false;
  }
}

/* La contraseña que se le pide al dueño tiene que ser usable pero no ridícula */
function revisarFortaleza(clave) {
  const c = String(clave || '');
  if (c.length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(c)) return 'La contraseña tiene que llevar al menos una letra.';
  if (!/[0-9]/.test(c)) return 'La contraseña tiene que llevar al menos un número.';
  if (/^(?:123|abc|qwerty|password|admin)/i.test(c)) return 'Esa contraseña es demasiado fácil de adivinar.';
  return null;
}

/* ── Cookies ─────────────────────────────────────────────────────────────── */

function leerCookies(req) {
  const crudo = req.headers.cookie || '';
  const salida = {};
  crudo.split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i < 0) return;
    const k = par.slice(0, i).trim();
    if (!k) return;
    const v = par.slice(i + 1).trim();
    // Una cookie con un % mal escrito hace que decodeURIComponent lance. Sin
    // esto, cualquiera podía dejar el panel entero en error 500.
    try { salida[k] = decodeURIComponent(v); } catch (_) { salida[k] = v; }
  });
  return salida;
}

const enProduccion = () => process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

function ponerCookie(res, valor, segundos) {
  const trozos = [
    COOKIE + '=' + encodeURIComponent(valor),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + segundos,
  ];
  // Secure solo en producción: en localhost no hay https y la cookie se caería
  if (enProduccion()) trozos.push('Secure');
  res.setHeader('Set-Cookie', trozos.join('; '));
}

const borrarCookie = (res) => ponerCookie(res, '', 0);

/* ── Sesiones ────────────────────────────────────────────────────────────── */

const huella = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

async function abrirSesion(res, usuarioId, agente) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DIAS_SESION * 864e5).toISOString();
  await correr(
    'INSERT INTO sesiones (id, usuario_id, creada, expira, agente) VALUES (?, ?, ?, ?, ?)',
    [huella(token), usuarioId, ahora(), expira, String(agente || '').slice(0, 200)]
  );
  await correr('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?', [ahora(), usuarioId]);
  ponerCookie(res, token, DIAS_SESION * 86400);
  // Aprovecha para barrer las sesiones vencidas
  await correr('DELETE FROM sesiones WHERE expira < ?', [ahora()]);
  return token;
}

async function cerrarSesion(req, res) {
  const token = leerCookies(req)[COOKIE];
  if (token) await correr('DELETE FROM sesiones WHERE id = ?', [huella(token)]);
  borrarCookie(res);
}

/* Devuelve el usuario de la sesión, o null. Nunca lanza. */
async function usuarioActual(req) {
  const token = leerCookies(req)[COOKIE];
  if (!token) return null;
  const fila = await uno(
    `SELECT u.id, u.correo, u.nombre, u.rol, u.activo, s.expira
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ?`,
    [huella(token)]
  );
  if (!fila) return null;
  if (fila.expira < ahora()) {
    await correr('DELETE FROM sesiones WHERE id = ?', [huella(token)]);
    return null;
  }
  if (!fila.activo) return null;
  return { id: fila.id, correo: fila.correo, nombre: fila.nombre, rol: fila.rol };
}

/* ── Permisos ────────────────────────────────────────────────────────────── */

class ErrorDeAcceso extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorDeAcceso';
    this.codigo = codigo;
  }
}

/* Lo que puede hacer cada rol. El editor toca contenido; el administrador,
   además, la configuración, los usuarios y los borrados delicados. */
const PERMISOS = {
  admin: ['contenido', 'productos', 'pedidos', 'config', 'usuarios', 'borrar'],
  editor: ['contenido', 'productos', 'pedidos'],
};

const puede = (usuario, permiso) =>
  !!usuario && (PERMISOS[usuario.rol] || []).includes(permiso);

async function exigir(req, permiso) {
  const usuario = await usuarioActual(req);
  if (!usuario) throw new ErrorDeAcceso(401, 'Tu sesión se cerró. Vuelve a entrar.');
  if (permiso && !puede(usuario, permiso)) {
    throw new ErrorDeAcceso(403, 'Tu usuario no tiene permiso para hacer esto.');
  }
  return usuario;
}

/* ── Freno a la fuerza bruta ─────────────────────────────────────────────── */

/* OJO: X-Forwarded-For lo puede inventar cualquiera. En Vercel la cabecera
   fiable es x-real-ip, que pone la propia plataforma; fuera de Vercel se usa
   la dirección real del socket. Nunca la que mande el cliente a su antojo. */
function ipDe(req) {
  if (process.env.VERCEL && req.headers['x-real-ip']) {
    return String(req.headers['x-real-ip']).trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'desconocida';
}

async function demasiadosIntentos(llave) {
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60000).toISOString();
  await correr('DELETE FROM intentos WHERE cuando < ?', [desde]);
  const filas = await todos('SELECT COUNT(*) AS n FROM intentos WHERE llave = ? AND cuando >= ?', [llave, desde]);
  return Number(filas[0] ? filas[0].n : 0) >= MAX_INTENTOS;
}

const anotarIntento = (llave) => correr('INSERT INTO intentos (llave, cuando) VALUES (?, ?)', [llave, ahora()]);
const limpiarIntentos = (llave) => correr('DELETE FROM intentos WHERE llave = ?', [llave]);

module.exports = {
  COOKIE, DIAS_SESION, VENTANA_MINUTOS, MAX_INTENTOS,
  hashear, verificar, revisarFortaleza,
  leerCookies, ponerCookie, borrarCookie, enProduccion,
  abrirSesion, cerrarSesion, usuarioActual,
  ErrorDeAcceso, PERMISOS, puede, exigir,
  ipDe, demasiadosIntentos, anotarIntento, limpiarIntentos,
};
