/* Miniaturas y hojas de contacto de Desktop/nuevascrow para agrupar las fotos
   por gorra. Cada miniatura lleva su número (IMG_xxxx → xxxx).
   Uso: node _work/nuevas2/laminas.js                                        */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/Lenovo/Desktop/nuevascrow';
const OUT = __dirname;
const MIN = path.join(OUT, 'min');
fs.mkdirSync(MIN, { recursive: true });

const fotos = fs.readdirSync(SRC).filter((f) => /\.(jpe?g|png|heic)$/i.test(f)).sort();

(async () => {
  /* 1. miniaturas de 420 px (para mirar de cerca después) */
  const info = [];
  for (const f of fotos) {
    const destino = path.join(MIN, f.replace(/\.\w+$/, '.jpg'));
    const img = sharp(path.join(SRC, f)).rotate();
    const m = await sharp(path.join(SRC, f)).metadata();
    if (!fs.existsSync(destino)) await img.resize(420, 420, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(destino);
    info.push({ f, w: m.width, h: m.height, o: m.orientation || 1 });
  }
  fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify(info, null, 1));

  /* 2. hojas de 24 (6x4) con el número grande */
  const CEL = 230, POR = 24, COL = 6;
  for (let h = 0; h * POR < fotos.length; h++) {
    const grupo = fotos.slice(h * POR, (h + 1) * POR);
    const capas = [];
    for (let i = 0; i < grupo.length; i++) {
      const f = grupo[i];
      const num = f.match(/(\d+)/)[1];
      const mini = await sharp(path.join(MIN, f.replace(/\.\w+$/, '.jpg')))
        .resize(CEL, CEL, { fit: 'contain', background: '#ffffff' }).toBuffer();
      const etiqueta = Buffer.from(`<svg width="${CEL}" height="34"><rect width="${CEL}" height="34" fill="#111"/>` +
        `<text x="10" y="24" font-family="Arial" font-size="22" font-weight="bold" fill="#fff">${num}</text></svg>`);
      const x = (i % COL) * (CEL + 8), y = Math.floor(i / COL) * (CEL + 42);
      capas.push({ input: mini, left: x, top: y + 34 }, { input: etiqueta, left: x, top: y });
    }
    const filas = Math.ceil(grupo.length / COL);
    await sharp({ create: { width: COL * (CEL + 8), height: filas * (CEL + 42), channels: 3, background: '#e9e7e2' } })
      .composite(capas).jpeg({ quality: 82 }).toFile(path.join(OUT, `hoja-${String(h + 1).padStart(2, '0')}.jpg`));
  }
  console.log(fotos.length, 'fotos ·', Math.ceil(fotos.length / POR), 'hojas en', OUT);
  const orient = info.reduce((a, x) => { a[x.w > x.h ? 'horizontal' : 'vertical'] = (a[x.w > x.h ? 'horizontal' : 'vertical'] || 0) + 1; return a; }, {});
  console.log('tamaños:', [...new Set(info.map((x) => x.w + 'x' + x.h))].join(', '), '·', JSON.stringify(orient));
})().catch((e) => { console.error(e); process.exit(1); });
