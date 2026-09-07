// CrowCaps · build de imagenes de producto (PNG -> WebP responsive)
// Uso: NODE_PATH=<ruta a node_modules con sharp> node _tools/build-img.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/Lenovo/Desktop/crowcaps';
const OUT = path.join(__dirname, '..', 'assets', 'img');

// slug -> archivos fuente (el primero es la imagen principal)
const MAP = require('./img-map.json');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {};
  for (const [slug, files] of Object.entries(MAP)) {
    manifest[slug] = [];
    for (let i = 0; i < files.length; i++) {
      const src = path.join(SRC, files[i]);
      const base = i === 0 ? slug : `${slug}-${i + 1}`;
      const img = sharp(src).flatten({ background: '#efeae1' });
      const meta = await sharp(src).metadata();
      await img.clone().resize({ width: 340, fit: 'inside' })
        .webp({ quality: 72 }).toFile(path.join(OUT, `${base}-sm.webp`));
      await img.clone().resize({ width: 640, fit: 'inside', withoutEnlargement: false })
        .webp({ quality: 76 }).toFile(path.join(OUT, `${base}.webp`));
      const m2 = await sharp(path.join(OUT, `${base}.webp`)).metadata();
      manifest[slug].push({ file: `${base}.webp`, w: m2.width, h: m2.height, srcW: meta.width, srcH: meta.height });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'img-manifest.json'), JSON.stringify(manifest, null, 2));
  const n = Object.values(manifest).reduce((a, b) => a + b.length, 0);
  console.log('OK ->', Object.keys(manifest).length, 'productos /', n, 'imagenes x2 tamanos');
})();
