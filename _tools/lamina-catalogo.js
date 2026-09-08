/* Arma una lámina por equipo con las gorras que YA están en el catálogo,
   etiquetadas con su id, para que el juez visual detecte repetidas.
   Uso: node _tools/lamina-catalogo.js                                        */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = 'C:/Users/Lenovo/Desktop/crowcaps';
const OUT = path.join(ROOT, '_work', 'nuevas');

global.window = {};
require(path.join(ROOT, 'js', 'products.js'));
const P = global.window.CROWCAPS_PRODUCTS;
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'img-map.json'), 'utf8'));

const CLAVES = [
  ['yankees', /yankees/i], ['dodgers', /dodgers/i], ['redsox', /red sox/i],
  ['whitesox', /white sox/i], ['braves', /braves/i], ['mets', /mets/i],
  ['padres', /padres/i], ['tigers', /tigers/i], ['athletics', /athletics/i],
  ['angels', /angels/i], ['bluejays', /blue jays/i], ['pirates', /pirates/i],
  ['giants', /giants/i], ['nationals', /nationals/i], ['bulls', /bulls/i],
  ['hornets', /hornets/i],
];
const equipo = t => (CLAVES.find(([, re]) => re.test(t)) || ['otras'])[0];

const porEquipo = {};
P.forEach(p => { const k = equipo(p.team); (porEquipo[k] = porEquipo[k] || []).push(p); });

const CW = 300, CH = 400, LBL = 30, COLS = 4;

(async () => {
  const hechas = {};
  for (const [k, prods] of Object.entries(porEquipo)) {
    const cols = Math.min(COLS, prods.length);
    const rows = Math.ceil(prods.length / cols);
    const comps = [];
    for (let i = 0; i < prods.length; i++) {
      const src = path.join(SRC, (MAP[prods[i].id] || [])[0]);
      if (!fs.existsSync(src)) continue;
      const x = (i % cols) * CW, y = Math.floor(i / cols) * (CH + LBL);
      const buf = await sharp(src).flatten({ background: '#efeae1' })
        .resize(CW - 8, CH - 8, { fit: 'contain', background: '#efeae1' }).toBuffer();
      comps.push({ input: buf, left: x + 4, top: y + LBL });
      const svg = `<svg width="${CW}" height="${LBL}"><rect width="${CW}" height="${LBL}" fill="#111110"/>` +
        `<text x="8" y="21" font-family="Arial" font-size="16" font-weight="bold" fill="#efeae1">${prods[i].id}</text></svg>`;
      comps.push({ input: Buffer.from(svg), left: x, top: y });
    }
    if (!comps.length) continue;
    const file = path.join(OUT, `cat-${k}.jpg`);
    await sharp({ create: { width: cols * CW, height: rows * (CH + LBL), channels: 3, background: '#efeae1' } })
      .composite(comps).jpeg({ quality: 84 }).toFile(file);
    hechas[k] = prods.map(p => p.id);
  }
  fs.writeFileSync(path.join(OUT, 'catalogo-por-equipo.json'), JSON.stringify(hechas, null, 1));
  Object.entries(hechas).forEach(([k, v]) => console.log(k.padEnd(11), v.length, '->', v.join(' ')));
})();
