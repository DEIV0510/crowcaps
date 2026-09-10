/* ═══════════════════════════════════════════════════════════════════════════
   PRUEBAS
   ───────────────────────────────────────────────────────────────────────────
   Sin librerías: node _tools/probar.js  (o npm test).

   Cubre lo que, si se rompe, se rompe callado: el filtro de HTML de los
   titulares, las validaciones que protegen los enlaces y los precios, y las
   reglas de los textos editables. No prueba la base ni la red: eso se prueba
   levantando el servidor.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const RAIZ = path.join(__dirname, '..');

/* La base no hace falta: se apunta al archivo local por si algún módulo la mira */
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const C = require(path.join(RAIZ, 'api', '_lib', 'contenido.js'));
const V = require(path.join(RAIZ, 'api', '_lib', 'validar.js'));
const { MAPA, valoresPorDefecto } = require(path.join(RAIZ, '_tools', 'mapa-contenido.js'));

let bien = 0;
const fallos = [];

function igual(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (ok) bien++;
  else fallos.push(`${nombre}\n      salió:    ${JSON.stringify(real)}\n      esperaba: ${JSON.stringify(esperado)}`);
}
function cierto(nombre, condicion, detalle) {
  if (condicion) bien++;
  else fallos.push(nombre + (detalle ? '\n      ' + detalle : ''));
}
function revienta(nombre, fn) {
  try { fn(); fallos.push(nombre + '\n      no lanzó ningún error'); }
  catch (e) { if (e instanceof V.ErrorDeDatos) bien++; else fallos.push(`${nombre}\n      lanzó otra cosa: ${e.message}`); }
}

/* ── El filtro de HTML de los titulares ──────────────────────────────────── */
const NUL = '\u0000';   // el separador interno del filtro
igual('deja <em>', C.htmlSeguro('el <em>resto</em>.'), 'el <em>resto</em>.');
igual('deja <strong>', C.htmlSeguro('<strong>hey</strong>'), '<strong>hey</strong>');
igual('normaliza <BR />', C.htmlSeguro('uno<BR />dos'), 'uno<br>dos');
igual('escapa <script>', C.htmlSeguro('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
igual('escapa onerror', C.htmlSeguro('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
igual('escapa <iframe>', C.htmlSeguro('<iframe src="//x"></iframe>'), '&lt;iframe src="//x"&gt;&lt;/iframe&gt;');
igual('escapa <svg>', C.htmlSeguro('<svg/onload=alert(1)>'), '&lt;svg/onload=alert(1)&gt;');
igual('escapa &', C.htmlSeguro('A & B'), 'A &amp; B');
cierto('un <em> con atributos NO pasa', !/<em /.test(C.htmlSeguro('<em onclick="alert(1)">x</em>')),
  C.htmlSeguro('<em onclick="alert(1)">x</em>'));
igual('nadie puede fabricar el separador', C.htmlSeguro(NUL + '0' + NUL), '0');
igual('ni mezclándolo con una marca real', C.htmlSeguro('<em>a</em>' + NUL + '0' + NUL), '<em>a</em>0');
igual('corta los titulares larguísimos', C.htmlSeguro('x'.repeat(900)).length, 400);

/* ── Enlaces ─────────────────────────────────────────────────────────────── */
revienta('rechaza javascript:', () => V.enlace('javascript:alert(1)'));
revienta('rechaza data:', () => V.enlace('data:text/html,<script>alert(1)</script>'));
igual('deja https', V.enlace('https://instagram.com/crowcaps.co'), 'https://instagram.com/crowcaps.co');
igual('un enlace vacío se queda vacío', V.enlace(''), '');

/* ── Teléfono y precio ───────────────────────────────────────────────────── */
igual('el WhatsApp se queda en dígitos', V.telefono('+57 320 722 4241'), '573207224241');
igual('precio con puntos', V.entero('85.000'), 85000);
igual('un precio en letras queda vacío, no en 0', V.entero('ochenta mil'), null);
igual('un precio vacío queda vacío', V.entero(''), null);

/* ── Producto ────────────────────────────────────────────────────────────── */
revienta('una gorra sin nombre no entra', () => V.producto({ name: '   ' }));
revienta('publicar sin precio no se puede', () => V.producto({ name: 'X', publicado: true, price: null, desc: 'algo' }));

/* ── Entrar por enlace ───────────────────────────────────────────────────── */
const A = require(path.join(RAIZ, 'api', '_lib', 'auth.js'));
const enlace = (o) => A.decidirEnlace(Object.assign({ codigo: '', enlaceAcceso: '', setupToken: '', yaHayClave: false }, o));

cierto('el enlace bueno entra', enlace({ codigo: 'abc123', enlaceAcceso: 'abc123' }));
cierto('un enlace equivocado no entra', !enlace({ codigo: 'otro', enlaceAcceso: 'abc123' }));
cierto('sin código no entra nadie', !enlace({ codigo: '', enlaceAcceso: 'abc123' }));
cierto('sin nada configurado no entra nadie', !enlace({ codigo: 'loquesea' }));
cierto('si hay ENLACE_ACCESO, el de instalación ya no sirve',
  !enlace({ codigo: 'instal', enlaceAcceso: 'abc123', setupToken: 'instal' }));
cierto('sin ENLACE_ACCESO sirve el de instalación mientras no haya contraseña',
  enlace({ codigo: 'instal', setupToken: 'instal' }));
cierto('en cuanto hay una contraseña, el de instalación deja de servir',
  !enlace({ codigo: 'instal', setupToken: 'instal', yaHayClave: true }));
cierto('una cuenta sin contraseña no se puede abrir con la marca interna',
  !A.verificar('sin-clave-todavia', 'sin-clave-todavia') && !A.verificar('', 'sin-clave-todavia'));
cierto('tieneClaveDeVerdad distingue el hash de la marca',
  A.tieneClaveDeVerdad(A.hashear('UnaClaveLarga1')) && !A.tieneClaveDeVerdad('sin-clave-todavia'));

/* ── Textos editables ────────────────────────────────────────────────────── */
const conEspacio = MAPA.filter((e) => typeof e.literal === 'string' && e.literal !== e.literal.trim());
cierto('ningún texto depende de un espacio invisible', conEspacio.length === 0,
  conEspacio.map((e) => e.clave).join(', '));

const porDefecto = valoresPorDefecto();
cierto('los valores por defecto están completos', Object.keys(porDefecto).length > 10);
cierto('ningún texto por defecto dice "originales"',
  !JSON.stringify(porDefecto).toLowerCase().includes('originales'));
cierto('ningún texto por defecto trae una dirección',
  !/(calle|carrera|cra.|cl.|av.)s*d/i.test(JSON.stringify(porDefecto)));

const claves = MAPA.map((e) => e.clave);
cierto('no hay claves repetidas en el mapa', new Set(claves).size === claves.length,
  claves.filter((c, i) => claves.indexOf(c) !== i).join(', '));

/* ── Resultado ───────────────────────────────────────────────────────────── */
console.log('');
if (!fallos.length) {
  console.log('  ' + bien + ' comprobaciones, todas bien');
  process.exit(0);
}
console.log('  ' + bien + ' bien · ' + fallos.length + ' MAL');
fallos.forEach((f) => console.log('   · ' + f));
process.exit(1);
