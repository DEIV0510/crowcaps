/* Pone en index.html el width/height REAL de cada imagen de producto que está
   escrita a mano (hero y feed), leyéndolo del manifest. Si no coinciden, el
   navegador reserva un hueco de otra proporción y hay salto de layout.
   Uso: node _tools/fix-dims-img.js                                            */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'img-manifest.json'), 'utf8'));

// archivo -> {w,h} de las dos variantes
const dim = {};
for (const lista of Object.values(MAN)) {
  for (const x of lista) {
    dim[x.file] = { w: x.w, h: x.h };
    if (x.smFile) dim[x.smFile] = { w: x.smW, h: x.smH };
  }
}

const file = path.join(ROOT, 'index.html');
let html = fs.readFileSync(file, 'utf8');
let tocadas = 0, sinDato = [];

html = html.replace(/<img\b[^>]*>/g, (tag) => {
  const m = tag.match(/src="assets\/img\/([^"]+)"/);
  if (!m) return tag;
  const d = dim[m[1]];
  if (!d) { sinDato.push(m[1]); return tag; }
  if (!/width="\d+"\s+height="\d+"/.test(tag) && !/width="\d+"[\s\S]*?height="\d+"/.test(tag)) return tag;
  const nuevo = tag.replace(/width="\d+"/, `width="${d.w}"`).replace(/height="\d+"/, `height="${d.h}"`);
  if (nuevo !== tag) tocadas++;
  return nuevo;
});

fs.writeFileSync(file, html);
console.log('imágenes de producto con medidas corregidas:', tocadas);
if (sinDato.length) console.log('sin dato en el manifest:', [...new Set(sinDato)].join(', '));
