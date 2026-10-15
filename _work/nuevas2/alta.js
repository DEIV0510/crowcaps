/* ═══════════════════════════════════════════════════════════════════════════
   ALTA DE LAS GORRAS NUEVAS (Desktop/nuevascrow)
   ───────────────────────────────────────────────────────────────────────────
   Lee _work/nuevas2/decisiones.json y:
     1. Pasa las fotos elegidas a WebP con las reglas de siempre: nunca se
        amplía; la grande a 1000 px de ancho y calidad 88, la chica a 360 px
        con un enfoque leve. Se llaman <slug>-<nº de foto>.webp.
     2. Da de alta las gorras nuevas y, a las que ya estaban en la tienda,
        les suma las fotos nuevas detrás de las que ya tenían.
     3. Pone esas gorras primero en la tienda, en el orden de «primero»,
        sin cambiar el orden relativo de las demás.
     4. Deja la portada (hero) mostrando las nuevas.

   Por defecto escribe en la base LOCAL. Con --prod escribe en la de
   producción (Turso), con las credenciales de .env.local. Se puede correr
   dos veces: lo que ya está, se salta.

   node _work/nuevas2/alta.js            (local)
   node _work/nuevas2/alta.js --prod     (producción, SOLO con OK del dueño)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
process.chdir(RAIZ);

const PROD = process.argv.includes('--prod');
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
if (PROD) {
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^(TURSO_[A-Z_]+)="?(.*?)"?$/);
    if (m) process.env[m[1]] = m[2];
  });
  if (!process.env.TURSO_DATABASE_URL) throw new Error('No encuentro TURSO_DATABASE_URL en .env.local');
}

const sharp = require('sharp');
const { uno, todos, correr, ahora } = require(path.join(RAIZ, 'api', '_lib', 'db.js'));

const FUENTE = 'C:/Users/Lenovo/Desktop/nuevascrow';
const IMG = path.join(RAIZ, 'assets', 'img');
const ANCHO = 1000, ANCHO_SM = 360;
const DEC = JSON.parse(fs.readFileSync(path.join(__dirname, 'decisiones.json'), 'utf8'));

async function prepararFoto(slug, n) {
  const src = path.join(FUENTE, 'IMG_' + n + '.jpeg');
  const base = slug + '-' + n;
  const grande = path.join(IMG, base + '.webp');
  const chica = path.join(IMG, base + '-sm.webp');
  const orig = await sharp(src).rotate().toBuffer({ resolveWithObject: true });
  if (!fs.existsSync(grande)) {
    await sharp(orig.data).resize({ width: ANCHO, withoutEnlargement: true })
      .webp({ quality: 88, smartSubsample: true, effort: 6 }).toFile(grande);
  }
  if (!fs.existsSync(chica)) {
    await sharp(orig.data).resize({ width: ANCHO_SM, withoutEnlargement: true }).sharpen({ sigma: 0.6 })
      .webp({ quality: 82, smartSubsample: true, effort: 6 }).toFile(chica);
  }
  const g = await sharp(grande).metadata();
  const c = await sharp(chica).metadata();
  if (g.width > orig.info.width || c.width > orig.info.width) throw new Error('se amplió ' + base);
  return { src: 'assets/img/' + base + '.webp', sm: 'assets/img/' + base + '-sm.webp', w: g.width, h: g.height, smW: c.width, smH: c.height };
}

(async () => {
  console.log('base:', PROD ? 'PRODUCCIÓN (Turso)' : 'local');

  /* 1. Fotos */
  let hechas = 0;
  const fotosDe = {};
  for (const g of [...(DEC.gorras || []), ...(DEC.agregarFotos || [])]) {
    const slug = g.slug || g.a;
    fotosDe[slug] = [];
    for (const n of g.fotos) { fotosDe[slug].push(await prepararFoto(slug, n)); hechas++; }
  }
  console.log('fotos listas:', hechas);

  /* 2a. Gorras nuevas */
  let creadas = 0, yaEstaban = 0;
  for (const g of DEC.gorras || []) {
    if (await uno('SELECT id FROM productos WHERE slug = ?', [g.slug])) { yaEstaban++; continue; }
    const r = await correr(
      `INSERT INTO productos (slug, nombre, equipo, modelo, colorway, precio, precio_antes,
         descripcion, descripcion_corta, caracteristicas, categorias, incluye, envio,
         destacado, publicado, orden, creado, actualizado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [g.slug, g.nombre, g.equipo, null, g.colorway, g.precio || 85000, null,
       g.desc, null, JSON.stringify(g.caracteristicas || []), JSON.stringify(g.colores || []),
       null, null, 0, 1, 0, ahora(), ahora()]
    );
    const fotos = fotosDe[g.slug];
    for (let k = 0; k < fotos.length; k++) {
      const f = fotos[k];
      await correr('INSERT INTO imagenes (producto_id, src, sm, w, h, sm_w, sm_h, alt, orden, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id, f.src, f.sm, f.w, f.h, f.smW, f.smH, k === 0 ? `Gorra ${g.nombre} — ${g.colorway}` : '', k, ahora()]);
    }
    creadas++;
  }
  console.log('gorras nuevas:', creadas, '· ya estaban:', yaEstaban);

  /* 2b. Fotos nuevas de gorras que ya estaban: van detrás de las suyas */
  let ampliadas = 0;
  for (const a of DEC.agregarFotos || []) {
    const p = await uno('SELECT id, nombre, colorway FROM productos WHERE slug = ?', [a.a]);
    if (!p) { console.log('  ✗ no existe', a.a); continue; }
    const fotos = fotosDe[a.a].filter(Boolean);
    const ya = await todos('SELECT src FROM imagenes WHERE producto_id = ?', [p.id]);
    const nuevas = fotos.filter((f) => !ya.some((y) => y.src === f.src));
    if (!nuevas.length) continue;
    const ult = await uno('SELECT MAX(orden) m FROM imagenes WHERE producto_id = ?', [p.id]);
    const desde = (ult && ult.m != null ? Number(ult.m) : -1) + 1;
    for (let k = 0; k < nuevas.length; k++) {
      const f = nuevas[k];
      await correr('INSERT INTO imagenes (producto_id, src, sm, w, h, sm_w, sm_h, alt, orden, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [p.id, f.src, f.sm, f.w, f.h, f.smW, f.smH, '', desde + k, ahora()]);
    }
    await correr('UPDATE productos SET actualizado = ? WHERE id = ?', [ahora(), p.id]);
    ampliadas++;
  }
  console.log('gorras de antes con fotos nuevas:', ampliadas);

  /* 3. Orden: las de «primero» arriba, el resto detrás en su mismo orden */
  const primero = DEC.primero || [];
  const vivas = await todos('SELECT id, slug FROM productos WHERE eliminado IS NULL ORDER BY orden ASC, id ASC');
  const delante = primero.map((s) => vivas.find((v) => v.slug === s)).filter(Boolean);
  const detras = vivas.filter((v) => !primero.includes(v.slug));
  const final = [...delante, ...detras];
  for (let i = 0; i < final.length; i++) await correr('UPDATE productos SET orden = ? WHERE id = ?', [i + 1, final[i].id]);
  console.log('orden: primeras', delante.length, '· total', final.length);

  /* 4. Portada */
  if (DEC.hero) {
    const poner = (clave, valor) => correr(
      `INSERT INTO ajustes (clave, valor, actualizado) VALUES (?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado`,
      [clave, JSON.stringify(valor), ahora()]);
    if (DEC.hero.principal) await poner('hero.principal', DEC.hero.principal);
    if (DEC.hero.destacadas) await poner('hero.destacadas', DEC.hero.destacadas);
    console.log('portada:', DEC.hero.principal, '·', (DEC.hero.destacadas || []).join(', '));
  }

  const t = await uno('SELECT COUNT(*) n, SUM(publicado) pub FROM productos WHERE eliminado IS NULL');
  console.log('en la base:', t.n, 'gorras ·', t.pub, 'publicadas');
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
