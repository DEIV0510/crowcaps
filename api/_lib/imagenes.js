/* ═══════════════════════════════════════════════════════════════════════════
   IMÁGENES SUBIDAS DESDE EL PANEL
   ───────────────────────────────────────────────────────────────────────────
   Una foto nueva recibe el MISMO trato que las que ya están en la tienda, con
   la regla que costó descubrir y que no se puede romper:

     NUNCA SE AMPLÍA. Si la foto mide menos que el ancho objetivo, se deja tal
     cual. Ampliar y luego comprimir emborrona el bordado — pasó y se notó.

   Salidas por cada foto:
     · <base>.webp     -> tamaño nativo (tope 1000 px), calidad 88
     · <base>-sm.webp  -> 360 px con un enfoque leve (ahí sí ayuda al reducir)

   Dónde quedan:
     · En tu computador -> assets/img, como el resto
     · En Vercel        -> Vercel Blob (el disco es de solo lectura)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { correr, todos, ahora, RAIZ } = require('./db');
const { ErrorDeDatos } = require('./validar');

const ANCHO_MAX = 1000;
const ANCHO_SM = 360;
const Q_GRANDE = 88;
const Q_SM = 82;
const MIN_LADO = 300;
const MAX_BYTES = 9 * 1024 * 1024;

const DIR = path.join(RAIZ, 'assets', 'img');
const usaBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/* Reconoce el tipo por los primeros bytes, no por lo que diga el nombre */
function tipoReal(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp' && buf.slice(8, 12).toString('ascii').startsWith('avi')) return 'image/avif';
  return null;
}

function baseLibre(sugerido) {
  const limpio = String(sugerido || 'gorra')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'gorra';
  return limpio + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

async function escribir(nombre, datos, tipo) {
  if (usaBlob()) {
    const { put } = require('@vercel/blob');
    const r = await put('img/' + nombre, datos, {
      access: 'public', contentType: tipo, addRandomSuffix: false, cacheControlMaxAge: 31536000,
    });
    await correr(
      `INSERT INTO archivos (nombre, url, bytes, creado) VALUES (?, ?, ?, ?)
       ON CONFLICT(nombre) DO UPDATE SET url = excluded.url, bytes = excluded.bytes`,
      [nombre, r.url, datos.length, ahora()]
    );
    return r.url;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, nombre), datos);
  return 'assets/img/' + nombre;
}

/* ── Procesa y guarda ────────────────────────────────────────────────────── */
async function guardarFoto(buffer, nombreSugerido) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ErrorDeDatos('No llegó ninguna imagen.');
  if (buffer.length > MAX_BYTES) throw new ErrorDeDatos('La imagen pesa más de 9 MB. Súbela más liviana.');

  const tipo = tipoReal(buffer);
  if (!tipo) throw new ErrorDeDatos('Ese archivo no es una imagen. Usa JPG, PNG o WEBP.');

  const sharp = require('sharp');
  let meta;
  try { meta = await sharp(buffer).metadata(); } catch (_) {
    throw new ErrorDeDatos('No pude leer esa imagen. Puede estar dañada.');
  }
  if (!meta.width || !meta.height) throw new ErrorDeDatos('No pude leer esa imagen.');
  if (meta.width < MIN_LADO || meta.height < MIN_LADO) {
    throw new ErrorDeDatos(`La imagen es muy pequeña (${meta.width}×${meta.height}). Necesito al menos ${MIN_LADO}×${MIN_LADO} píxeles.`);
  }

  const base = baseLibre(nombreSugerido);
  const fuente = sharp(buffer).rotate().flatten({ background: '#efeae1' });

  const grande = await fuente.clone()
    .resize({ width: ANCHO_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Q_GRANDE, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  const chica = await fuente.clone()
    .resize({ width: ANCHO_SM, fit: 'inside', withoutEnlargement: true })
    .sharpen({ sigma: 0.6, m1: 0.4, m2: 0.6 })
    .webp({ quality: Q_SM, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  /* Cinturón y tirantes: si por lo que sea saliera más grande que el original,
     no se guarda. La regla de no ampliar se comprueba, no se confía. */
  if (grande.info.width > meta.width) throw new ErrorDeDatos('Error interno al procesar la imagen (se amplió).');

  const [src, sm] = await Promise.all([
    escribir(base + '.webp', grande.data, 'image/webp'),
    escribir(base + '-sm.webp', chica.data, 'image/webp'),
  ]);

  return {
    src, sm,
    w: grande.info.width, h: grande.info.height,
    sm_w: chica.info.width, sm_h: chica.info.height,
    bytes: grande.data.length + chica.data.length,
    original: { w: meta.width, h: meta.height },
  };
}

/* Borrar una foto: quita el archivo (si podemos) y su rastro en la base */
async function borrarFoto(src) {
  const nombre = String(src || '').split('/').pop();
  if (!nombre) return;
  try {
    if (usaBlob() && /^https?:/.test(src)) {
      const { del } = require('@vercel/blob');
      await del(src);
    } else {
      const p = path.join(DIR, nombre);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (_) { /* si el archivo ya no está, seguimos: lo que importa es la base */ }
  await correr('DELETE FROM archivos WHERE nombre = ?', [nombre]);
}

/* Fotos que están en la carpeta del proyecto y se pueden reutilizar desde el
   panel sin volver a subirlas (las 94 que ya tiene la tienda). */
async function fotosDelProyecto() {
  try {
    return fs.readdirSync(DIR)
      .filter((f) => f.endsWith('.webp') && !f.endsWith('-sm.webp'))
      .sort()
      .map((f) => ({ src: 'assets/img/' + f, sm: 'assets/img/' + f.replace('.webp', '-sm.webp') }));
  } catch (_) {
    const filas = await todos("SELECT nombre, url FROM archivos WHERE nombre NOT LIKE '%-sm.webp' ORDER BY nombre");
    return filas.map((f) => ({ src: f.url, sm: f.url.replace('.webp', '-sm.webp') }));
  }
}

module.exports = { guardarFoto, borrarFoto, fotosDelProyecto, usaBlob, ANCHO_MAX, ANCHO_SM, MAX_BYTES };
