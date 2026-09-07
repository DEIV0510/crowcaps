// CrowCaps · extrae los 4 logos de la lamina PDF (ya rasterizada) y genera
// versiones planas sobre papel (#efeae1) e sobre tinta (#111110) para evitar
// el bug de PNG con alfa que Chromium pinta como parche blanco.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const W = path.join(__dirname, '..', '_work');
const OUT = path.join(__dirname, '..', 'assets', 'brand');
const PAPER = '#efeae1';
const INK = '#111110';

// El PDF trae textos de lamina en los margenes: recortamos el 76% central.
async function plate(file) {
  const src = path.join(W, file);
  const m = await sharp(src).metadata();
  const inset = Math.round(m.width * 0.12);
  return sharp(src)
    .extract({ left: inset, top: inset, width: m.width - inset * 2, height: m.height - inset * 2 })
    .toBuffer();
}

async function emit(buf, name, size) {
  const trimmed = await sharp(buf).trim({ threshold: 25 }).resize({ width: size, fit: 'inside' }).toBuffer();
  // El arte viene negro sobre blanco: convertimos la luminancia en alfa para
  // que no quede una caja blanca sobre el papel crema, y luego aplanamos.
  const { data, info } = await sharp(trimmed).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const mk = async (rgb, bg, file) => {
    const out = Buffer.alloc(px * 4);
    for (let i = 0; i < px; i++) {
      out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2];
      out[i * 4 + 3] = 255 - data[i * info.channels];
    }
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .flatten({ background: bg }).webp({ lossless: true, effort: 6 }).toFile(path.join(OUT, file));
  };
  await mk([17, 17, 16], PAPER, name + '.webp');
  await mk([239, 234, 225], INK, name + '-ink.webp');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const badge = await plate('logo-1.png');
  await emit(badge, 'badge', 340);

  // logo-2: mascota arriba + wordmark abajo -> recortamos solo la mascota
  const p2 = await plate('logo-2.png');
  const m2 = await sharp(p2).metadata();
  const mascot = await sharp(p2)
    .extract({ left: 0, top: 0, width: m2.width, height: Math.round(m2.height * 0.66) })
    .toBuffer();
  await emit(mascot, 'mascot', 320);

  const arch = await plate('logo-3.png');
  await emit(arch, 'arch', 420);

  const word = await plate('logo-4.png');
  await emit(word, 'wordmark', 440);

  // favicon a partir del sello
  const t = await sharp(badge).trim({ threshold: 25 }).toBuffer();
  for (const s of [32, 180]) {
    await sharp(t).resize({ width: s, height: s, fit: 'contain', background: PAPER })
      .flatten({ background: PAPER }).png().toFile(path.join(OUT, `favicon-${s}.png`));
  }
  console.log('brand ok');
})();
