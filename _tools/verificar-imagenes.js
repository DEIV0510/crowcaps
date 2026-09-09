/* Guardia de calidad de imagen. Falla si:
   - alguna imagen construida es más ancha que su original (ampliar = emborronar)
   - algún ancho declarado en un srcset no coincide con el archivo real
   - alguna imagen del HTML no existe en disco
   Uso: NODE_PATH=<...sharp> node _tools/verificar-imagenes.js                  */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = 'C:/Users/Lenovo/Desktop/crowcaps';
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'img-map.json'), 'utf8'));
const IMG = path.join(ROOT, 'assets', 'img');

(async () => {
  const fallos = [];
  let revisadas = 0;

  // 1. ninguna construida puede superar a su fuente
  for (const [slug, fuentes] of Object.entries(MAP)) {
    for (let i = 0; i < fuentes.length; i++) {
      const base = i === 0 ? slug : `${slug}-${i + 1}`;
      const orig = await sharp(path.join(SRC, fuentes[i])).metadata();
      for (const f of [`${base}.webp`, `${base}-sm.webp`]) {
        const p = path.join(IMG, f);
        if (!fs.existsSync(p)) { fallos.push(`falta el archivo ${f}`); continue; }
        const m = await sharp(p).metadata();
        revisadas++;
        if (m.width > orig.width) fallos.push(`${f} (${m.width}px) es más ancha que su original ${fuentes[i]} (${orig.width}px)`);
      }
    }
  }

  // 2. los anchos del srcset tienen que ser los reales
  const html = fs.readFileSync(path.join(ROOT, '_plantilla', 'respaldo.html'), 'utf8');
  const sets = html.match(/srcset="[^"]+"/g) || [];
  for (const s of sets) {
    for (const par of s.slice(8, -1).split(',')) {
      const [ruta, w] = par.trim().split(/\s+/);
      if (!ruta || !w) continue;
      const p = path.join(ROOT, ruta);
      if (!fs.existsSync(p)) { fallos.push(`srcset apunta a un archivo inexistente: ${ruta}`); continue; }
      const m = await sharp(p).metadata();
      if (m.width !== parseInt(w)) fallos.push(`${ruta} declara ${w} en el srcset pero mide ${m.width}px`);
    }
  }

  // 3. toda imagen del HTML existe
  for (const m of html.matchAll(/src="(assets\/[^"]+)"/g)) {
    if (!fs.existsSync(path.join(ROOT, m[1]))) fallos.push(`src roto: ${m[1]}`);
  }

  if (fallos.length) {
    console.error('FALLOS DE IMAGEN (' + fallos.length + '):');
    fallos.slice(0, 25).forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('imágenes OK ·', revisadas, 'archivos revisados · ninguna ampliada · srcset coherente');
})();
