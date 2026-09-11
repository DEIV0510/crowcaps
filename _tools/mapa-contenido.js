/* ═══════════════════════════════════════════════════════════════════════════
   MAPA DE CONTENIDO EDITABLE
   ───────────────────────────────────────────────────────────────────────────
   Una sola lista que dice, para cada texto de la página pública:

     clave    -> cómo se llama dentro del CMS (ruta con puntos)
     literal  -> el texto EXACTO que hoy está escrito en index.html
     html     -> true si el valor lleva etiquetas y no se debe escapar
     veces    -> cuántas veces aparece ese literal en la página (por defecto 1)

   De esta lista salen dos cosas, así que nunca se pueden desincronizar:

     · _plantilla/index.html   (index.html con {{marcadores}})   -> hacer-plantilla.js
     · los valores por defecto del CMS                            -> valoresPorDefecto()

   Si alguien cambia index.html a mano y un literal deja de coincidir,
   hacer-plantilla.js falla en vez de generar una plantilla rota.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const WA_GENERAL = 'https://wa.me/573207224241?text=Hola%20CrowCaps%2C%20quiero%20ver%20las%20gorras%20disponibles.';

const MAPA = [
  /* ── SEO ─────────────────────────────────────────────────────────────── */
  { clave: 'seo.titulo', literal: 'CrowCaps | Gorras y Streetwear en Colombia', veces: 2 },
  { clave: 'seo.descripcion', literal: 'Gorras seleccionadas en Medellín: beisboleras, urbanas y de equipo. 61 referencias reales, envíos GRATIS a todo Colombia y pedidos directo por WhatsApp.' },
  { clave: 'seo.canonical', literal: 'https://crowcaps.co/', busca: 'href="https://crowcaps.co/"', pon: 'href="{{seo.canonical}}"' },
  { clave: 'seo.og_url', literal: 'https://crowcaps.co/', busca: '<meta property="og:url" content="https://crowcaps.co/">', pon: '<meta property="og:url" content="{{seo.og_url}}">' },
  { clave: 'seo.og_descripcion', literal: 'Gorras seleccionadas en Medellín. Envíos GRATIS a todo Colombia. Pide la tuya por WhatsApp.' },
  { clave: 'seo.og_imagen', literal: 'https://crowcaps.co/assets/img/yankees-navy-hueso.webp' },
  { clave: 'seo.og_imagen_alt', literal: 'Gorra Yankees azul marino con visera hueso', busca: '<meta property="og:image:alt" content="Gorra Yankees azul marino con visera hueso">', pon: '<meta property="og:image:alt" content="{{seo.og_imagen_alt}}">' },

  /* ── Marca ───────────────────────────────────────────────────────────── */
  { clave: 'marca.nombre', literal: 'CrowCaps', busca: '<meta property="og:site_name" content="CrowCaps">', pon: '<meta property="og:site_name" content="{{marca.nombre}}">' },
  { clave: 'marca.nombre_loader', literal: 'Crowcaps' },

  /* ── Navegación ──────────────────────────────────────────────────────── */
  { clave: 'nav.coleccion', literal: 'Colección', busca: '<a href="#coleccion">Colección</a>', pon: '<a href="#coleccion">{{nav.coleccion}}</a>' },
  { clave: 'nav.coleccion_movil', literal: 'Colección', busca: '<a href="#coleccion" data-close>Colección</a>', pon: '<a href="#coleccion" data-close>{{nav.coleccion_movil}}</a>' },
  { clave: 'nav.marca', literal: 'Marca', busca: '<a href="#marca">Marca</a>', pon: '<a href="#marca">{{nav.marca}}</a>' },
  { clave: 'nav.marca_movil', literal: 'Marca', busca: '<a href="#marca" data-close>Marca</a>', pon: '<a href="#marca" data-close>{{nav.marca_movil}}</a>' },
  { clave: 'nav.feed', literal: 'Feed', busca: '<a href="#feed">Feed</a>', pon: '<a href="#feed">{{nav.feed}}</a>' },
  { clave: 'nav.feed_movil', literal: 'Feed', busca: '<a href="#feed" data-close>Feed</a>', pon: '<a href="#feed" data-close>{{nav.feed_movil}}</a>' },
  { clave: 'nav.contacto', literal: 'Contacto', busca: '<a href="#contacto" data-close>Contacto</a>', pon: '<a href="#contacto" data-close>{{nav.contacto}}</a>' },
  { clave: 'nav.cta', literal: 'Comprar' },
  /* 5: los cuatro botones de la página y el enlace del pie. Ese último llevaba
     el número escrito a mano y no seguía al panel; hacer-plantilla.js lo
     normaliza antes de aplicar este mapa. */
  { clave: 'nav.wa_url', literal: WA_GENERAL, veces: 5 },
  { clave: 'nav.menu_ciudad', literal: 'Medellín · CO' },

  /* ── Hero ────────────────────────────────────────────────────────────── */
  /* El espacio va en el HTML, NUNCA dentro del texto: al guardar desde el panel
     los textos se recortan (y con razón), así que un texto que dependa de un
     espacio invisible al final se rompe la primera vez que el dueño lo edita. */
  { clave: 'hero.eyebrow_pre', literal: 'Medellín · Colombia —',
    busca: '>Medellín · Colombia — <span id="refCount">', pon: '>{{hero.eyebrow_pre}} <span id="refCount">' },
  { clave: 'hero.eyebrow_post', literal: 'referencias',
    busca: '</span> referencias</p>', pon: '</span> {{hero.eyebrow_post}}</p>' },
  { clave: 'hero.titulo1', literal: 'La gorra' },
  { clave: 'hero.titulo2', literal: 'decide' },
  { clave: 'hero.titulo3', literal: 'el <em>resto</em>.', html: true },
  { clave: 'hero.lead', literal: 'Gorras elegidas una por una y fotografiadas como llegan. Ni catálogo infinito ni relleno: solo las que aguantan el outfit completo.' },
  { clave: 'hero.cta1', literal: 'Ver colección',
    busca: '>Ver colección <span class="arw">', pon: '>{{hero.cta1}} <span class="arw">' },
  { clave: 'hero.cta2', literal: 'Pedir por WhatsApp', veces: 4 },
  { clave: 'hero.stat1_etiqueta', literal: 'Referencias' },
  { clave: 'hero.stat2_valor', literal: 'Gratis' },
  { clave: 'hero.stat2_etiqueta', literal: 'Envíos a todo el país' },
  { clave: 'hero.stat3_valor', literal: 'MED' },
  { clave: 'hero.stat3_etiqueta', literal: 'Origen' },

  /* ── Colección ───────────────────────────────────────────────────────── */
  { clave: 'coleccion.titulo', literal: 'La colección' },
  { clave: 'coleccion.texto', literal: 'Cada gorra tiene su propia ficha: colorway, bordados y detalles reales de la foto. Elige la tuya y la despachamos el mismo día hábil.' },
  { clave: 'coleccion.buscador', literal: 'Buscar equipo o color…' },
  { clave: 'coleccion.vacio_titulo', literal: 'Nada por aquí' },
  { clave: 'coleccion.vacio_texto', literal: 'No encontramos gorras con esa búsqueda. Prueba con otro equipo o escríbenos y te decimos qué hay disponible.' },
  { clave: 'coleccion.vacio_cta', literal: 'Preguntar por WhatsApp',
    busca: '>Preguntar por WhatsApp <span class="arw">', pon: '>{{coleccion.vacio_cta}} <span class="arw">' },
  { clave: 'coleccion.vacio_wa', literal: 'https://wa.me/573207224241?text=Hola%20CrowCaps%2C%20estoy%20buscando%20una%20gorra%20en%20espec%C3%ADfico.' },

  /* ── Beneficios ──────────────────────────────────────────────────────── */
  { clave: 'perks.1_titulo', literal: 'Envíos gratis', busca: '<h3>Envíos gratis</h3>', pon: '<h3>{{perks.1_titulo}}</h3>' },
  { clave: 'perks.1_texto', literal: 'A todo Colombia, sin mínimo de compra.' },
  { clave: 'perks.2_titulo', literal: 'Compra online' },
  { clave: 'perks.2_texto', literal: 'Sin punto físico: pides, confirmamos y despachamos.' },
  { clave: 'perks.3_titulo', literal: 'Atención por WhatsApp' },
  { clave: 'perks.3_texto', literal: 'Responde una persona, no un bot.' },
  { clave: 'perks.4_titulo', literal: 'Empaque especial' },
  { clave: 'perks.4_texto', literal: 'Tu gorra sale protegida y lista para regalo.' },

  /* ── Editorial ───────────────────────────────────────────────────────── */
  { clave: 'editorial.img_alt', literal: 'Hombre con gorra azul marino tonal en la calle' },
  { clave: 'editorial.eyebrow', literal: 'Capítulo 01' },
  { clave: 'editorial.titulo', literal: 'No es solo una gorra.<br>Es la primera <em>decisión</em> del día.', html: true },
  { clave: 'editorial.texto', literal: 'Te la pones antes de salir y ya definiste el tono de todo lo demás. Por eso no vendemos cualquiera: si no aporta, no entra.' },
  /* El número ya viene como {{N}}: hacer-plantilla.js cambia los contadores antes
     de aplicar este mapa, para no depender de cuántas gorras haya hoy. */
  { clave: 'editorial.cta', literal: 'Ver las',
    busca: '>Ver las {{N}} <span class="arw">', pon: '>{{editorial.cta}} {{N}} <span class="arw">' },

  /* ── Sobre la marca ──────────────────────────────────────────────────── */
  { clave: 'about.eyebrow', literal: 'Sobre nosotros' },
  { clave: 'about.p1', literal: 'Nacimos en Medellín con una idea sencilla: que conseguir una buena gorra no dependa de la suerte. Buscamos, elegimos y fotografiamos cada pieza como es, sin retoques que cambien el color real.' },
  { clave: 'about.p2', literal: 'No tenemos local. Tenemos WhatsApp, y del otro lado responde una persona que sabe qué hay disponible. Enviamos gratis a cualquier ciudad del país.' },
  { clave: 'about.cita', literal: '“It was a collective decision.”' },
  { clave: 'about.cita_autor', literal: '— Lema de la casa' },

  /* ── Feed ────────────────────────────────────────────────────────────── */
  { clave: 'feed.titulo', literal: 'Follow the crow' },
  { clave: 'feed.texto', literal: 'Fotos reales de las gorras que tenemos. Lo nuevo cae primero en Instagram y TikTok: @crowcaps.co' },

  /* ── Cierre ──────────────────────────────────────────────────────────── */
  { clave: 'final.titulo', literal: '¿Ya encontraste<br><em>la tuya?</em>', html: true },
  { clave: 'final.texto', literal: 'Escríbenos con el nombre de la gorra y te confirmamos disponibilidad al instante. Envío gratis a toda Colombia.' },
  { clave: 'final.cta_wa', literal: 'https://wa.me/573207224241?text=Hola%20CrowCaps%2C%20quiero%20pedir%20una%20gorra.' },

  /* ── Footer ──────────────────────────────────────────────────────────── */
  { clave: 'footer.nota', literal: 'Medellín, Antioquia, Colombia. Ventas online — no contamos con punto físico.' },
  { clave: 'footer.col2', literal: 'Tienda' },
  { clave: 'footer.col2_l1', literal: 'Colección', busca: '<li><a href="#coleccion">Colección</a></li>', pon: '<li><a href="#coleccion">{{footer.col2_l1}}</a></li>' },
  { clave: 'footer.col2_l2', literal: 'Sobre CrowCaps' },
  { clave: 'footer.col2_l3', literal: 'Feed', busca: '<li><a href="#feed">Feed</a></li>', pon: '<li><a href="#feed">{{footer.col2_l3}}</a></li>' },
  { clave: 'footer.col3', literal: 'Contacto', busca: '<h4>Contacto</h4>', pon: '<h4>{{footer.col3}}</h4>' },
  { clave: 'footer.col3_wa', literal: 'WhatsApp +57 320 722 4241' },
  { clave: 'footer.col3_envio', literal: 'Envíos gratis a todo Colombia', busca: '<li><a href="#coleccion">Envíos gratis a todo Colombia</a></li>', pon: '<li><a href="#coleccion">{{footer.col3_envio}}</a></li>' },
  { clave: 'footer.col4', literal: 'Redes' },
  { clave: 'footer.copyright', literal: '© 2026 CrowCaps. Todos los derechos reservados.' },
  { clave: 'footer.lema', literal: 'It was a collective decision' },

  /* ── Ficha de producto (drawer) ──────────────────────────────────────── */
  { clave: 'ficha.incluye', literal: 'gorra + empaque especial.' },
  { clave: 'ficha.envio', literal: 'a todo Colombia.',
    busca: '</b> a todo Colombia.</span>', pon: '</b> {{ficha.envio}}</span>' },
  { clave: 'ficha.disponibilidad', literal: 'confirmada por WhatsApp.',
    busca: '</b> confirmada por WhatsApp.</span>', pon: '</b> {{ficha.disponibilidad}}</span>' },
  { clave: 'ficha.nota_precio', literal: 'Envío gratis incluido · Confirmamos disponibilidad por WhatsApp.' },

  /* ── Redes (URLs) ────────────────────────────────────────────────────── */
  { clave: 'redes.instagram_url', literal: 'https://instagram.com/crowcaps.co', veces: 11 },
  { clave: 'redes.tiktok_url', literal: 'https://tiktok.com/@crowcaps.co', veces: 2 },
  { clave: 'redes.facebook_url', literal: 'https://facebook.com/crowcaps' },
  { clave: 'redes.instagram_etiqueta', literal: 'Instagram @crowcaps.co' },
  { clave: 'redes.tiktok_etiqueta', literal: 'TikTok @crowcaps.co' },
  { clave: 'redes.facebook_etiqueta', literal: 'Facebook CrowCaps' },
];

/* Valores que NO salen de index.html porque no están escritos ahí, pero que el
   panel sí administra (mensajes de WhatsApp, número, banderas de sección…). */
const EXTRAS = {
  'contacto.whatsapp': '573207224241',
  'contacto.whatsapp_visible': '+57 320 722 4241',
  'contacto.mensaje_general': 'Hola CrowCaps, quiero ver las gorras disponibles.',
  'contacto.mensaje_producto': 'Hola CrowCaps, estoy interesado en la Gorra {producto} ({equipo}) de {precio}. Quisiera conocer disponibilidad y realizar mi pedido.',
  'contacto.mensaje_busqueda': 'Hola CrowCaps, estoy buscando una gorra en específico.',
  'contacto.mensaje_cierre': 'Hola CrowCaps, quiero pedir una gorra.',

  'redes.instagram_visible': true,
  'redes.tiktok_visible': true,
  'redes.facebook_visible': true,

  'envios.texto_corto': 'Envíos GRATIS',
  'envios.texto_ficha': 'Incluye',

  /* Píxeles de publicidad. Vacíos = no se carga NADA: la tienda no llama a
     Meta ni a Google mientras el dueño no pegue sus identificadores. */
  'medicion.meta_pixel': '',
  'medicion.google_tag': '',

  'secciones.hero': true,
  'secciones.coleccion': true,
  'secciones.perks': true,
  'secciones.editorial': true,
  'secciones.about': true,
  'secciones.feed': true,
  'secciones.final': true,

  'hero.destacadas': ['yankees-navy-hueso', 'redsox-khaki-roja', 'padres-rosa-azul'],
  'hero.principal': 'yankees-navy-hueso',
  'editorial.imagen': 'assets/img/nationals-navy.webp',
  'feed.imagenes': [],   // lo llena el seed con las 9 actuales
  'ticker.palabras': ['Crowcaps', 'Streetwear', 'Medellín', 'Envíos gratis', 'Crowcaps', 'Colombia'],
};

/* ── Utilidades de rutas con puntos ──────────────────────────────────────── */
function poner(obj, ruta, valor) {
  const partes = ruta.split('.');
  let n = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    if (typeof n[partes[i]] !== 'object' || n[partes[i]] === null) n[partes[i]] = {};
    n = n[partes[i]];
  }
  n[partes[partes.length - 1]] = valor;
}

function sacar(obj, ruta) {
  return ruta.split('.').reduce((n, k) => (n && n[k] !== undefined ? n[k] : undefined), obj);
}

function valoresPorDefecto() {
  const salida = {};
  MAPA.forEach((e) => poner(salida, e.clave, e.literal));
  Object.entries(EXTRAS).forEach(([k, v]) => poner(salida, k, Array.isArray(v) ? v.slice() : v));
  return salida;
}

module.exports = { MAPA, EXTRAS, valoresPorDefecto, poner, sacar, WA_GENERAL };
