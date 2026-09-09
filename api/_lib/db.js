/* ═══════════════════════════════════════════════════════════════════════════
   BASE DE DATOS
   ───────────────────────────────────────────────────────────────────────────
   El mismo código sirve en los dos sitios:

     · En tu computador   -> un archivo SQLite en _datos/crowcaps.db
     · En Vercel          -> Turso (el disco de Vercel es de solo lectura)

   No hay que cambiar nada al pasar de uno a otro: si no están las variables de
   Turso, se usa el archivo local.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const RAIZ = path.join(__dirname, '..', '..');

let cliente = null;
let esquemaListo = false;

const enVercel = () => process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
const urlTurso = () => process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || '';
const tokenTurso = () => process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || '';

function url() {
  const remota = urlTurso();
  if (remota) return remota;
  if (enVercel()) {
    throw new Error(
      'Falta la base de datos: no está TURSO_DATABASE_URL. En Vercel el disco es ' +
      'de solo lectura, así que hace falta Turso. Revisa /api/estado.'
    );
  }
  const dir = path.join(RAIZ, '_datos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return 'file:' + path.join(dir, 'crowcaps.db').replace(/\\/g, '/');
}

function db() {
  if (!cliente) cliente = createClient({ url: url(), authToken: tokenTurso() || undefined });
  return cliente;
}

/* ── Esquema ─────────────────────────────────────────────────────────────────
   Todo con IF NOT EXISTS: se puede correr en cada arranque en frío sin miedo. */
const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     correo        TEXT NOT NULL UNIQUE,
     nombre        TEXT NOT NULL DEFAULT '',
     clave         TEXT NOT NULL,
     rol           TEXT NOT NULL DEFAULT 'admin',
     activo        INTEGER NOT NULL DEFAULT 1,
     creado        TEXT NOT NULL,
     ultimo_acceso TEXT
   )`,

  /* De la sesión se guarda el HASH del token, no el token: si alguien lee la
     tabla no puede hacerse pasar por nadie. */
  `CREATE TABLE IF NOT EXISTS sesiones (
     id         TEXT PRIMARY KEY,
     usuario_id INTEGER NOT NULL,
     creada     TEXT NOT NULL,
     expira     TEXT NOT NULL,
     agente     TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS intentos (
     llave  TEXT NOT NULL,
     cuando TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ix_intentos ON intentos (llave, cuando)`,

  `CREATE TABLE IF NOT EXISTS productos (
     id                INTEGER PRIMARY KEY AUTOINCREMENT,
     slug              TEXT NOT NULL UNIQUE,
     nombre            TEXT NOT NULL,
     equipo            TEXT NOT NULL DEFAULT '',
     modelo            TEXT,
     colorway          TEXT NOT NULL DEFAULT '',
     precio            INTEGER,
     precio_antes      INTEGER,
     descripcion       TEXT NOT NULL DEFAULT '',
     descripcion_corta TEXT,
     caracteristicas   TEXT NOT NULL DEFAULT '[]',
     categorias        TEXT NOT NULL DEFAULT '[]',
     incluye           TEXT,
     envio             TEXT,
     destacado         INTEGER NOT NULL DEFAULT 0,
     publicado         INTEGER NOT NULL DEFAULT 1,
     orden             INTEGER NOT NULL DEFAULT 0,
     eliminado         TEXT,
     creado            TEXT NOT NULL,
     actualizado       TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ix_productos_orden ON productos (eliminado, publicado, orden)`,

  /* Las fotos van aparte para que varios ángulos de la MISMA gorra queden
     agrupados y nunca se conviertan en productos distintos. */
  `CREATE TABLE IF NOT EXISTS imagenes (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     producto_id INTEGER NOT NULL,
     src         TEXT NOT NULL,
     sm          TEXT,
     w           INTEGER, h INTEGER, sm_w INTEGER, sm_h INTEGER,
     alt         TEXT,
     orden       INTEGER NOT NULL DEFAULT 0,
     creado      TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ix_imagenes ON imagenes (producto_id, orden)`,

  `CREATE TABLE IF NOT EXISTS categorias (
     id     INTEGER PRIMARY KEY AUTOINCREMENT,
     slug   TEXT NOT NULL UNIQUE,
     nombre TEXT NOT NULL,
     orden  INTEGER NOT NULL DEFAULT 0,
     activa INTEGER NOT NULL DEFAULT 1
   )`,

  `CREATE TABLE IF NOT EXISTS ajustes (
     clave       TEXT PRIMARY KEY,
     valor       TEXT NOT NULL,
     actualizado TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS auditoria (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     usuario    TEXT,
     accion     TEXT NOT NULL,
     entidad    TEXT,
     entidad_id TEXT,
     detalle    TEXT,
     cuando     TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ix_auditoria ON auditoria (cuando)`,

  /* Archivos subidos por el panel: guarda a dónde fue cada foto */
  `CREATE TABLE IF NOT EXISTS archivos (
     nombre TEXT PRIMARY KEY,
     url    TEXT NOT NULL,
     bytes  INTEGER,
     creado TEXT NOT NULL
   )`,
];

async function asegurarEsquema() {
  if (esquemaListo) return;
  for (const sql of ESQUEMA) await db().execute(sql);
  esquemaListo = true;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const ahora = () => new Date().toISOString();

async function todos(sql, args = []) {
  await asegurarEsquema();
  const r = await db().execute({ sql, args });
  return r.rows.map((f) => ({ ...f }));
}

async function uno(sql, args = []) {
  const filas = await todos(sql, args);
  return filas[0] || null;
}

async function correr(sql, args = []) {
  await asegurarEsquema();
  const r = await db().execute({ sql, args });
  return { cambios: r.rowsAffected, id: r.lastInsertRowid !== undefined ? Number(r.lastInsertRowid) : null };
}

/* Varias sentencias como una sola unidad: si una falla, no queda a medias */
async function enLote(sentencias) {
  await asegurarEsquema();
  if (!sentencias.length) return;
  await db().batch(sentencias.map((s) => (Array.isArray(s) ? { sql: s[0], args: s[1] || [] } : s)), 'write');
}

/* ¿Está viva la base? Se usa en /api/estado para diagnosticar sin adivinar. */
async function comprobar() {
  try {
    await asegurarEsquema();
    const r = await uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NULL');
    return { ok: true, motor: urlTurso() ? 'turso' : 'sqlite local', productos: Number(r ? r.n : 0) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { db, RAIZ, ahora, todos, uno, correr, enLote, asegurarEsquema, comprobar, enVercel };
