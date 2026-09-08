/* Lee el journal del workflow de fichas y agrupa las fotos nuevas por equipo/marca,
   para que un juez visual decida después qué fotos son la MISMA gorra.
   Uso: node _tools/agrupar.js <ruta journal.jsonl>                              */
const fs = require('fs');
const path = require('path');

const journal = process.argv[2];
const ROOT = path.join(__dirname, '..');

const lineas = fs.readFileSync(journal, 'utf8').trim().split('\n')
  .map(l => { try { return JSON.parse(l) } catch (e) { return null } }).filter(Boolean);

const fichas = [];
for (const o of lineas) {
  if (o.type !== 'result') continue;
  const v = o.value ?? o.result ?? o.output ?? o.data;
  if (v && typeof v === 'object' && v.archivo) fichas.push(v);
}
fichas.sort((a, b) => parseInt(a.archivo.slice(1)) - parseInt(b.archivo.slice(1)));

// normaliza el nombre de equipo para agrupar
const norm = s => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/new york |los angeles |chicago |boston |san diego |san francisco |atlanta |detroit |oakland |toronto |pittsburgh |washington |seattle |charlotte /g, '')
  .replace(/[^a-z ]/g, '').trim();

const CLAVES = [
  ['yankees', /yankee|\bny\b/], ['dodgers', /dodger|\bla\b/], ['redsox', /red sox|redsox/],
  ['whitesox', /white sox|whitesox|\bsox\b/], ['braves', /brave/], ['mets', /mets/],
  ['padres', /padre|\bsd\b/], ['tigers', /tiger|detroit/], ['athletics', /athletic|\ba\'?s\b|oakland/],
  ['angels', /angel/], ['bluejays', /blue jay|jays|toronto/], ['pirates', /pirate|pittsburgh/],
  ['giants', /giant|\bsf\b/], ['nationals', /national/], ['bulls', /bull/], ['hornets', /hornet/],
];
function equipo(f) {
  // SOLO el campo equipo_marca: el texto libre está en castellano y "la"/"a's"
  // hacían falsos positivos con Dodgers y Athletics.
  const t = norm(String(f.equipo_marca).replace(/\([^)]*\)/g, ' ').split(/[;,—]/)[0]);
  for (const [k, re] of CLAVES) if (re.test(t)) return k;
  return 'otras';
}

const grupos = {};
fichas.forEach(f => { const k = equipo(f); (grupos[k] = grupos[k] || []).push(f); });

const salida = Object.entries(grupos).map(([k, v]) => ({
  equipo: k,
  fotos: v.map(f => ({
    archivo: f.archivo,
    huella: f.huella,
    corona: f.color_corona,
    visera: f.color_visera,
    parche: f.parche_lateral,
    toma: f.tipo_toma,
    escena: f.escena,
    pistas: f.pistas_sesion,
    solo_producto: f.solo_producto,
    logo: f.logo_frontal,
  })),
}));

fs.writeFileSync(path.join(ROOT, '_work/nuevas/grupos.json'), JSON.stringify(salida, null, 1));
fs.writeFileSync(path.join(ROOT, '_work/nuevas/fichas.json'), JSON.stringify(fichas, null, 1));
console.log('fichas leidas:', fichas.length);
salida.sort((a, b) => b.fotos.length - a.fotos.length)
  .forEach(g => console.log(String(g.fotos.length).padStart(3), g.equipo, '->', g.fotos.map(f => f.archivo.replace('.jpg', '')).join(' ')));
