/* Ayuda para mirar fotos de cerca (la usan los revisores).
   Convierte a JPG legible cualquier foto (JPEG del iPhone o WebP de la tienda)
   y, si se pide, recorta una zona en porcentajes.

   node _work/nuevas2/ver.js 7745                  → foto nueva entera (1200 px)
   node _work/nuevas2/ver.js 7745 20 25 60 40       → recorte: x y ancho alto en %
   node _work/nuevas2/ver.js assets/img/xx.webp     → foto que ya está en la tienda
   Imprime la ruta del JPG que hay que abrir con Read.                        */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'ver');
fs.mkdirSync(OUT, { recursive: true });

const [arg, ...pct] = process.argv.slice(2);
let src;
if (/^\d+$/.test(arg)) src = 'C:/Users/Lenovo/Desktop/nuevascrow/IMG_' + arg + '.jpeg';
else src = path.isAbsolute(arg) ? arg : path.join(RAIZ, arg);
if (!fs.existsSync(src)) { console.error('no existe: ' + src); process.exit(1); }

(async () => {
  let img = sharp(src).rotate();
  const buf = await img.toBuffer();
  const m = await sharp(buf).metadata();
  let base = sharp(buf);
  let sufijo = '';
  if (pct.length === 4) {
    const [x, y, w, h] = pct.map(Number);
    const left = Math.max(0, Math.round(m.width * x / 100));
    const top = Math.max(0, Math.round(m.height * y / 100));
    const width = Math.min(m.width - left, Math.round(m.width * w / 100));
    const height = Math.min(m.height - top, Math.round(m.height * h / 100));
    base = base.extract({ left, top, width, height });
    sufijo = '-' + pct.join('_');
  }
  const nombre = path.basename(src).replace(/\.\w+$/, '') + sufijo + '.jpg';
  const destino = path.join(OUT, nombre);
  await base.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(destino);
  console.log(destino.replace(/\\/g, '/'));
})().catch((e) => { console.error(e.message); process.exit(1); });
