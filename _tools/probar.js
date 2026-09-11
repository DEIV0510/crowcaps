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

igual('un precio negativo no pasa', V.entero('-85000', { min: 1 }), null);
igual('un precio de 0 no pasa', V.entero('0', { min: 1 }), null);
igual('el celular sin indicativo se completa', V.telefono('320 722 4241'), '573207224241');
igual('el que ya trae indicativo se queda igual', V.telefono('+57 320 722 4241'), '573207224241');
revienta('un número demasiado corto no pasa', () => V.telefono('12345'));

/* ── Producto ────────────────────────────────────────────────────────────── */
revienta('una gorra sin nombre no entra', () => V.producto({ nombre: '   ' }));
revienta('publicar sin precio no se puede',
  () => V.producto({ nombre: 'X', publicado: true, precio: '', descripcion: 'algo' }));
/* Con precio 0 la ficha salía a "$0" y se podía comprar */
revienta('publicar con precio 0 no se puede',
  () => V.producto({ nombre: 'X', publicado: true, precio: 0, descripcion: 'algo' }));
revienta('publicar con precio negativo tampoco',
  () => V.producto({ nombre: 'X', publicado: true, precio: -85000, descripcion: 'algo' }));
igual('un precio normal se guarda tal cual',
  V.producto({ nombre: 'X', precio: '85.000' }).precio, 85000);

/* El editor no manda `orden`: si se forzara a 0, guardar una gorra la mandaría
   al primer puesto de la tienda y desharía el orden hecho a mano. */
cierto('guardar sin tocar el orden lo deja sin definir',
  V.producto({ nombre: 'X', descripcion: 'algo' }).orden === undefined);
igual('si se manda un orden, se respeta', V.producto({ nombre: 'X', orden: 7 }).orden, 7);

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

/* ── El renderizador ─────────────────────────────────────────────────────── */
const fs = require('fs');
const { renderizar } = require(path.join(RAIZ, '_tools', 'render.js'));
const PLANTILLA = fs.readFileSync(path.join(RAIZ, '_plantilla', 'index.html'), 'utf8');
const pintar = (productos, extra) => renderizar({
  productos, plantilla: PLANTILLA,
  contenido: Object.assign(valoresPorDefecto(), extra || {}),
});

const vacia = pintar([]);
cierto('sin gorras publicadas la tienda se pinta igual', vacia.length > 5000);
cierto('sin gorras no queda ninguna img sin src', !/src=""/.test(vacia));
cierto('sin gorras no quedan marcadores a medio poner', !/\{\{[\w.]+\}\}/.test(vacia));

const conCat = pintar([], { categorias: [{ slug: 'camo', nombre: 'Camufladas' }] });
cierto('las categorías del panel llegan a la tienda', conCat.includes('"camo"') && conCat.includes('Camufladas'));

const sinFace = pintar([], { redes: Object.assign({}, valoresPorDefecto().redes, { facebook_visible: false }) });
cierto('apagar Facebook lo quita del pie', !sinFace.includes('facebook.com/crowcaps'));
cierto('y no toca Instagram', sinFace.includes('instagram.com/crowcaps.co'));

const otroWa = pintar([], { contacto: Object.assign({}, valoresPorDefecto().contacto, { whatsapp: '573001112233' }) });
cierto('cambiar el WhatsApp cambia TODOS los enlaces, también el del pie',
  !otroWa.includes('wa.me/573207224241') && otroWa.includes('wa.me/573001112233'));

const otroMenu = pintar([], { nav: Object.assign({}, valoresPorDefecto().nav, { coleccion: 'Catálogo' }) });
cierto('el menú del celular sigue al del computador',
  (otroMenu.match(/Catálogo/g) || []).length >= 2);

/* ── Píxeles de publicidad ───────────────────────────────────────────────── */
const { bloqueMedicion } = require(path.join(RAIZ, '_tools', 'render.js'));
const pixeles = (meta, google) => bloqueMedicion({ medicion: { meta_pixel: meta, google_tag: google } });

igual('sin identificadores no se carga nada', pixeles('', ''), '');
cierto('la tienda no llama a nadie mientras no haya píxel',
  !pintar([]).includes('facebook.net') && !pintar([]).includes('googletagmanager'));
cierto('el píxel de Meta se monta con su ID', pixeles('123456789012345', '').includes('fbq("init","123456789012345")'));
cierto('Meta deja también la imagen para quien no tenga JavaScript',
  pixeles('123456789012345', '').includes('facebook.com/tr?id=123456789012345'));
cierto('GA4 se monta con gtag', pixeles('', 'G-ABCD123456').includes('gtag("config","G-ABCD123456")'));
cierto('Google Ads también', pixeles('', 'AW-123456789').includes('AW-123456789'));
cierto('Tag Manager usa su propio arranque', pixeles('', 'GTM-ABC1234').includes('gtm.js?id='));
cierto('los dos a la vez conviven',
  pixeles('123456789012345', 'G-ABCD123456').includes('fbevents') &&
  pixeles('123456789012345', 'G-ABCD123456').includes('googletagmanager'));
/* Lo que se escriba en el panel acaba DENTRO de un <script> */
igual('un ID con código colado no se monta', pixeles('</script><script>alert(1)', '" onload="x'), '');
igual('ni con comillas ni espacios', pixeles('123 456", evil:"1', 'G-ABC"+alert(1)+"'), '');

/* ── Resultado ───────────────────────────────────────────────────────────── */
console.log('');
if (!fallos.length) {
  console.log('  ' + bien + ' comprobaciones, todas bien');
  process.exit(0);
}
console.log('  ' + bien + ' bien · ' + fallos.length + ' MAL');
fallos.forEach((f) => console.log('   · ' + f));
process.exit(1);
