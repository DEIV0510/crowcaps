// CrowCaps · build de imagenes de producto (PNG -> WebP responsive)
// Uso: NODE_PATH=<ruta a node_modules con sharp> node _tools/build-img.js
//
// REGLA: nunca ampliar. Los originales miden ~510 px de ancho; escalarlos a 640
// inventaba pixeles y, con la compresion encima, se veian blandas. La version
// grande sale al tamano nativo y con calidad alta; la chica es solo para moviles
// de baja densidad. El manifest guarda el ANCHO REAL de cada archivo para que el
// srcset del HTML no mienta y el navegador elija bien.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/Lenovo/Desktop/crowcaps';
const OUT = path.join(__dirname, '..', 'assets', 'img');

const ANCHO_MAX = 1000;   // techo por si algun dia llegan fotos grandes
const ANCHO_SM = 360;
const Q_GRANDE = 88;
const Q_SM = 82;

// slug -> archivos fuente (el primero es la imagen principal)
const MAP = require('./img-map.json');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {};
  let ampliadas = 0;
  for (const [slug, files] of Object.entries(MAP)) {
    manifest[slug] = [];
    for (let i = 0; i < files.length; i++) {
      const src = path.join(SRC, files[i]);
      const base = i === 0 ? slug : `${slug}-${i + 1}`;
      const meta = await sharp(src).metadata();
      const img = sharp(src).flatten({ background: '#efeae1' });

      await img.clone()
        .resize({ width: ANCHO_MAX, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: Q_GRANDE, effort: 6, smartSubsample: true })
        .toFile(path.join(OUT, `${base}.webp`));

      // la chica sí baja de tamaño (~30%), y ahí un enfoque leve recupera el
      // detalle del bordado que se pierde al reducir. En la grande no se toca.
      await img.clone()
        .resize({ width: ANCHO_SM, fit: 'inside', withoutEnlargement: true })
        .sharpen({ sigma: 0.6, m1: 0.4, m2: 0.6 })
        .webp({ quality: Q_SM, effort: 6, smartSubsample: true })
        .toFile(path.join(OUT, `${base}-sm.webp`));

      const g = await sharp(path.join(OUT, `${base}.webp`)).metadata();
      const s = await sharp(path.join(OUT, `${base}-sm.webp`)).metadata();
      if (g.width > meta.width) ampliadas++;
      manifest[slug].push({
        file: `${base}.webp`, w: g.width, h: g.height,
        smFile: `${base}-sm.webp`, smW: s.width, smH: s.height,
        srcW: meta.width, srcH: meta.height,
      });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'img-manifest.json'), JSON.stringify(manifest, null, 2));
  const todas = Object.values(manifest).flat();
  const n = todas.length;
  const menor = Math.min(...todas.map(x => x.w));
  const mayor = Math.max(...todas.map(x => x.w));
  console.log('OK ->', Object.keys(manifest).length, 'productos /', n, 'imagenes x2 tamanos');
  console.log('ancho de la version grande:', menor, '-', mayor, 'px | ampliadas:', ampliadas);
  if (ampliadas) throw new Error('alguna imagen se amplio: revisa withoutEnlargement');
})();
