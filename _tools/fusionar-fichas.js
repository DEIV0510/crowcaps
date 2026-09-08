/* Toma las fichas nuevas (salida del workflow de copy) y las añade a js/products.js.
   Valida antes de escribir: ids únicos, etiquetas de color válidas, 4 características,
   descripciones no repetidas y que todas las imágenes existan.
   Uso: node _tools/fusionar-fichas.js <ruta al .output del workflow>            */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const salida = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nuevas = salida.result;
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'img-map.json'), 'utf8'));

global.window = {};
require(path.join(ROOT, 'js', 'products.js'));
const viejos = global.window.CROWCAPS_PRODUCTS;

const COLORES = ['negras', 'blancas', 'beige', 'rojas', 'azules', 'bicolor'];
const PRECIO = 85000;
const errores = [];
const idsViejos = new Set(viejos.map(p => p.id));
const nombres = new Set(viejos.map(p => p.name.toLowerCase()));
const descs = new Set(viejos.map(p => p.desc));

const limpio = nuevas.map(f => {
  if (!f || !f.id) { errores.push('ficha sin id'); return null; }
  if (idsViejos.has(f.id)) errores.push('id repetido: ' + f.id);
  if (!MAP[f.id]) errores.push('sin imágenes en img-map: ' + f.id);
  if (nombres.has(String(f.name).toLowerCase())) errores.push('nombre repetido: ' + f.name);
  if (descs.has(f.desc)) errores.push('descripción repetida: ' + f.id);
  nombres.add(String(f.name).toLowerCase());
  descs.add(f.desc);

  const colors = (f.colors || []).filter(c => COLORES.includes(c));
  if (!colors.length) errores.push('sin etiquetas de color válidas: ' + f.id);
  const features = (f.features || []).slice(0, 4);
  if (features.length !== 4) errores.push('no tiene 4 características: ' + f.id);

  return {
    id: f.id, team: f.team, name: f.name, colorway: f.colorway,
    colors, price: PRECIO, desc: f.desc, features,
    imgs: MAP[f.id].map(x => x.replace('.png', '.webp')).map((x, i) => i === 0 ? f.id + '.webp' : f.id + '-' + (i + 1) + '.webp'),
  };
}).filter(Boolean);

if (errores.length) { console.error('ERRORES:\n' + errores.join('\n')); process.exit(1); }

const esc = s => String(s).replace(/'/g, "\\'");
const bloque = p => `  {
    id: '${p.id}', team: '${esc(p.team)}', name: '${esc(p.name)}',
    colorway: '${esc(p.colorway)}', colors: [${p.colors.map(c => `'${c}'`).join(', ')}],
    price: ${p.price},
    desc: '${esc(p.desc)}',
    features: [${p.features.map(x => `'${esc(x)}'`).join(', ')}],
    imgs: [${p.imgs.map(x => `'${x}'`).join(', ')}]
  }`;

const file = path.join(ROOT, 'js', 'products.js');
let src = fs.readFileSync(file, 'utf8');
const cierre = src.lastIndexOf('\n];');
if (cierre < 0) throw new Error('no encuentro el cierre del array');
src = src.slice(0, cierre) + ',\n' + limpio.map(bloque).join(',\n') + src.slice(cierre);
fs.writeFileSync(file, src);
console.log('fichas añadidas:', limpio.length);
