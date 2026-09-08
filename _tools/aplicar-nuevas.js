/* Aplica las decisiones sobre las fotos nuevas:
   - añade/actualiza entradas en _tools/img-map.json
   - regenera las imágenes WebP (llama a build-img.js aparte)
   Espera un JSON en _work/nuevas/decisiones.json con la forma:
     { "nuevas":  [ { "id": "slug", "fotos": ["g45","g46"] } ],
       "ampliar": [ { "id": "whitesox-arena", "fotos": ["g81","g80"] } ] }
   'fotos' va en orden: la primera es la imagen principal.                    */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAPF = path.join(ROOT, '_tools', 'img-map.json');
const DEC = JSON.parse(fs.readFileSync(path.join(ROOT, '_work', 'nuevas', 'decisiones.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(MAPF, 'utf8'));

const png = g => 'gorra' + String(g).replace(/^g/, '') + '.png';
const SRC = 'C:/Users/Lenovo/Desktop/crowcaps';

let creadas = 0, ampliadas = 0;
for (const n of DEC.nuevas || []) {
  if (map[n.id]) throw new Error('el id ya existe en img-map: ' + n.id);
  map[n.id] = n.fotos.map(png);
  creadas++;
}
for (const a of DEC.ampliar || []) {
  if (!map[a.id]) throw new Error('id desconocido al ampliar: ' + a.id);
  const nuevas = a.fotos.map(png).filter(f => !map[a.id].includes(f));
  map[a.id] = a.reemplazar ? a.fotos.map(png) : map[a.id].concat(nuevas);
  ampliadas++;
}

// comprobación: todo archivo referenciado existe y ninguno se usa dos veces
const usados = {};
for (const [id, files] of Object.entries(map)) {
  for (const f of files) {
    if (!fs.existsSync(path.join(SRC, f))) throw new Error('falta el archivo fuente ' + f + ' (' + id + ')');
    if (usados[f]) throw new Error('foto repetida en dos productos: ' + f + ' -> ' + usados[f] + ' y ' + id);
    usados[f] = id;
  }
}

fs.writeFileSync(MAPF, JSON.stringify(map, null, 2) + '\n');
console.log('productos en el mapa:', Object.keys(map).length, '| nuevos:', creadas, '| ampliados:', ampliadas);
console.log('fotos usadas:', Object.keys(usados).length);
