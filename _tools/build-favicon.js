/* Genera el juego de iconos que Google necesita para mostrar el logo en los
   resultados, en vez del globo genérico:
     - /favicon.ico en la RAÍZ (16+32+48 dentro del mismo archivo)
     - icon-48/96/192/512.png y apple-touch-icon.png
   Google pide un favicon cuadrado, múltiplo de 48, accesible y declarado con
   <link rel="icon">. A 16 px el sello con el aro de texto se vuelve una mancha,
   así que el icono usa solo la CARA de la mascota, que sí se lee en pequeño.
   Uso: NODE_PATH=<...sharp> node _tools/build-favicon.js                      */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FUENTE = path.join(ROOT, '_work', 'logo-1.png');   // lámina del sello, 4500x4500
const BRAND = path.join(ROOT, 'assets', 'brand');
const PAPEL = { r: 239, g: 234, b: 225 };
const TINTA = { r: 17, g: 17, b: 16 };

// Empaqueta varios PNG en un .ico (el formato admite PNG embebido desde Vista)
function ico(pngs) {
  const n = pngs.length;
  const cab = Buffer.alloc(6 + 16 * n);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(n, 4);
  let off = 6 + 16 * n;
  pngs.forEach((p, i) => {
    const e = 6 + 16 * i;
    cab.writeUInt8(p.size >= 256 ? 0 : p.size, e);
    cab.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    cab.writeUInt8(0, e + 2); cab.writeUInt8(0, e + 3);
    cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(p.buf.length, e + 8);
    cab.writeUInt32LE(off, e + 12);
    off += p.buf.length;
  });
  return Buffer.concat([cab, ...pngs.map(p => p.buf)]);
}

(async () => {
  // 1. recorto la cara del centro del sello y la dejo negra sobre papel
  const m = await sharp(FUENTE).metadata();
  const lado = Math.round(m.width * 0.48);
  const cara = await sharp(FUENTE)
    .extract({ left: Math.round((m.width - lado) / 2), top: Math.round((m.height - lado) / 2), width: lado, height: lado })
    .greyscale().raw().toBuffer({ resolveWithObject: true });

  // luminancia -> alfa (el arte viene negro sobre blanco), color tinta sobre papel
  const px = cara.info.width * cara.info.height;
  const rgba = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    rgba[i * 4] = 17; rgba[i * 4 + 1] = 17; rgba[i * 4 + 2] = 16;
    rgba[i * 4 + 3] = 255 - cara.data[i * cara.info.channels];
  }
  // el recorte cuadrado arrastra trozos del aro de texto en las esquinas: me
  // quedo solo con la mancha conectada más grande, que es la cara
  const W = cara.info.width, H = cara.info.height;
  const visto = new Int32Array(W * H).fill(-1);
  const pila = new Int32Array(W * H);
  // se descarta lo que TOCA el borde (son trozos del aro de texto) y las motas.
  // Así sobreviven la cara y las cejas, que van sueltas pero quedan por dentro.
  const fuera = [];
  let id = 0, guardadas = 0;
  for (let p = 0; p < W * H; p++) {
    if (visto[p] !== -1 || rgba[p * 4 + 3] < 40) continue;
    let tope = 0, tam = 0, tocaBorde = false, sx = 0, sy = 0;
    pila[tope++] = p; visto[p] = id;
    while (tope) {
      const q = pila[--tope]; tam++;
      const x = q % W, y = (q / W) | 0;
      sx += x; sy += y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tocaBorde = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r = ny * W + nx;
        if (visto[r] === -1 && rgba[r * 4 + 3] >= 40) { visto[r] = id; pila[tope++] = r; }
      }
    }
    // medido: cara 0.11, cejas 0.38, trozos del aro 0.55+ -> corte en 0.45
    const dist = Math.hypot(sx / tam - W / 2, sy / tam - H / 2) / W;
    if (tocaBorde || dist > 0.45 || tam < W * H * 0.0008) fuera.push(id); else guardadas++;
    id++;
  }
  const quitar = new Set(fuera);
  for (let p = 0; p < W * H; p++) if (quitar.has(visto[p])) rgba[p * 4 + 3] = 0;
  console.log('regiones:', id, '· conservadas:', guardadas, '· descartadas:', fuera.length);

  const arte = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 20 }).png().toBuffer();

  /* 2. Cara negra dentro de un círculo de papel, sobre un cuadrado de tinta.

     Antes era la cara sobre un cuadrado de papel y en Google no se leía: el
     papel es casi blanco, así que contra la página blanca de resultados el
     icono no tenía silueta y la cara quedaba flotando como una mancha. Con el
     círculo claro sobre fondo oscuro se distingue la marca a 16 px aunque los
     ojos y la sonrisa ya no se separen, y aguanta el recorte circular que
     Google le hace en el móvil.

     Es el mismo tratamiento que usa la página sobre fondo oscuro: la mascota
     NUNCA va en negativo, va la original negra dentro de un círculo de papel. */
  const cuadro = async (size) => {
    /* En los tamaños chicos la cara va algo más grande: al reducir se comen los
       detalles y conviene que la mancha llene más el círculo. */
    const dentro = Math.max(1, Math.round(size * (size <= 32 ? 0.68 : 0.62)));
    const capa = await sharp(arte)
      .resize({ width: dentro, height: dentro, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    /* El círculo se dibuja a 8x y se reduce: así el borde no queda dentado */
    const G = 8;
    const circulo = await sharp(Buffer.from(
      '<svg width="' + size * G + '" height="' + size * G + '">' +
      '<circle cx="' + (size * G / 2) + '" cy="' + (size * G / 2) + '" r="' + (size * G * 0.455) + '" ' +
      'fill="rgb(' + PAPEL.r + ',' + PAPEL.g + ',' + PAPEL.b + ')"/></svg>'
    )).resize(size, size).png().toBuffer();

    return sharp({ create: { width: size, height: size, channels: 3, background: TINTA } })
      .composite([{ input: circulo, gravity: 'center' }, { input: capa, gravity: 'center' }])
      .png({ compressionLevel: 9 }).toBuffer();
  };

  fs.mkdirSync(BRAND, { recursive: true });
  const tamanos = [16, 32, 48, 96, 144, 180, 192, 512];
  const hechos = {};
  for (const s of tamanos) hechos[s] = await cuadro(s);

  for (const s of [48, 96, 192, 512]) fs.writeFileSync(path.join(BRAND, `icon-${s}.png`), hechos[s]);
  fs.writeFileSync(path.join(BRAND, 'apple-touch-icon.png'), hechos[180]);
  fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico([16, 32, 48].map(s => ({ size: s, buf: hechos[s] }))));

  console.log('favicon.ico:', fs.statSync(path.join(ROOT, 'favicon.ico')).size, 'bytes (16+32+48)');
  console.log('iconos PNG:', [48, 96, 192, 512].map(s => `icon-${s}`).join(', '), '+ apple-touch-icon');
})();
