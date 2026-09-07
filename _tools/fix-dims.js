/* Ajusta width/height de las imagenes de marca al tamano real del archivo,
   para que el navegador reserve el espacio exacto (cero CLS). */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

(async () => {
  const d = {};
  for (const n of ['badge', 'wordmark', 'wordmark-ink', 'arch', 'mascot-ink']) {
    const m = await sharp(path.join(ROOT, 'assets', 'brand', n + '.webp')).metadata();
    d[n] = [m.width, m.height];
  }
  let h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const set = (re, w, hh) => { h = h.replace(re, (m) => m.replace(/width="\d+" height="\d+"/, 'width="' + w + '" height="' + hh + '"')); };

  const navW = Math.round(32 * d.wordmark[0] / d.wordmark[1]);
  const footW = Math.round(26 * d['wordmark-ink'][0] / d['wordmark-ink'][1]);
  set(/<img class="lg-paper"[^>]*>/, navW, 32);
  set(/<img class="lg-ink"[^>]*>/, navW, 32);
  set(/<img class="foot__logo"[^>]*>/, footW, 26);
  set(/<img class="loader__badge"[^>]*>/, d.badge[0], d.badge[1]);
  set(/<img class="hero__seal"[^>]*>/, d.badge[0], d.badge[1]);
  set(/<img class="about__stamp[^"]*"[^>]*>/, d.arch[0], d.arch[1]);
  set(/<img class="final__mascot"[^>]*>/, d['mascot-ink'][0], d['mascot-ink'][1]);

  fs.writeFileSync(path.join(ROOT, 'index.html'), h);
  console.log(h.match(/<img[^>]*assets\/brand[^>]*>/g).join('\n'));
})();
