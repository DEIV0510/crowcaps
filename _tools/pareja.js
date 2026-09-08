/* Arma una lámina de comparación con varias fotos etiquetadas, para decidir
   si son la misma gorra. Uso:
     node _tools/pareja.js salida.jpg  A=ruta1.png  B=ruta2.png  ...        */
const sharp = require('sharp');
const path = require('path');

const [, , out, ...pares] = process.argv;
const CW = 380, CH = 500, LBL = 30;

(async () => {
  const items = pares.map(p => { const i = p.indexOf('='); return { label: p.slice(0, i), file: p.slice(i + 1) }; });
  const W = CW * items.length, H = CH + LBL;
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const buf = await sharp(items[i].file).flatten({ background: '#efeae1' })
      .resize(CW - 8, CH - 8, { fit: 'contain', background: '#efeae1' }).toBuffer();
    comps.push({ input: buf, left: i * CW + 4, top: LBL });
    const svg = `<svg width="${CW}" height="${LBL}"><rect width="${CW}" height="${LBL}" fill="#111110"/>` +
      `<text x="10" y="21" font-family="Arial" font-size="17" font-weight="bold" fill="#efeae1">${items[i].label}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: i * CW, top: 0 });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#efeae1' } })
    .composite(comps).jpeg({ quality: 84 }).toFile(out);
  console.log('->', path.basename(out));
})();
