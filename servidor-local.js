/* ═══════════════════════════════════════════════════════════════════════════
   SERVIDOR PARA TRABAJAR EN EL COMPUTADOR
   ───────────────────────────────────────────────────────────────────────────
   Hace lo mismo que Vercel: los archivos estáticos se sirven del disco y todo
   lo demás (portada, panel y API) lo atiende api/index.js. Así lo que se prueba
   aquí es exactamente lo que va a producción.

   node servidor-local.js   ->  http://localhost:5325
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = process.env.PORT || 5325;
const RAIZ = __dirname;

/* Códigos de acceso. En producción SIEMPRE vienen de variables de entorno;
   aquí, si no las pusiste, se inventan distintas en cada arranque y se imprimen
   al final. Nunca hay una clave fija escrita en el código. */
const inventados = [];
for (const nombre of ['SETUP_TOKEN', 'ENLACE_ACCESO']) {
  if (!process.env[nombre]) {
    process.env[nombre] = require('crypto').randomBytes(12).toString('hex');
    inventados.push(nombre);
  }
}

const handler = require('./api/index.js');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

/* Lo que se sirve tal cual del disco. Todo lo demás pasa por la función. */
const ESTATICO = /^\/(assets|css|js)\//;
const SUELTOS = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);

http.createServer(async (req, res) => {
  const ruta = decodeURIComponent(req.url.split('?')[0]);

  if (ESTATICO.test(ruta) || SUELTOS.has(ruta)) {
    const archivo = path.join(RAIZ, path.normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
    if (archivo.startsWith(RAIZ) && fs.existsSync(archivo) && fs.statSync(archivo).isFile()) {
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      return res.end(fs.readFileSync(archivo));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }

  try {
    await handler(req, res);
  } catch (e) {
    console.error('[servidor]', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Error interno');
  }
}).listen(PUERTO, () => {
  console.log('CrowCaps  ->  http://localhost:' + PUERTO);
  console.log('Panel     ->  http://localhost:' + PUERTO + '/admin');
  if (inventados.includes('ENLACE_ACCESO')) {
    console.log('Entrar sin contraseña (solo para este arranque):');
    console.log('  http://localhost:' + PUERTO + '/admin?entrar=' + process.env.ENLACE_ACCESO);
  }
  if (inventados.includes('SETUP_TOKEN')) {
    console.log('Código para crear el primer administrador: ' + process.env.SETUP_TOKEN);
  }
});
