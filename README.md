# CrowCaps · tienda + panel de administración

Tienda de gorras (Medellín) con su propio CMS. Un solo proyecto: la parte
pública y el panel comparten código, datos y despliegue.

- **Tienda:** https://crowcaps.co
- **Panel:** https://crowcaps.co/admin

## Cómo funciona

```
Navegador  ─▶  api/index.js  ─┬─▶  /            portada armada desde la base
                              ├─▶  /admin       panel privado (no indexable)
                              └─▶  /api/...     API, con sesión obligatoria

_plantilla/index.html   la página con {{marcadores}}
_tools/render.js        el ÚNICO sitio donde se arma el HTML
_plantilla/respaldo.html  copia de seguridad: si la base falla, se sirve esto
```

**Importante:** no puede existir un `index.html` en la raíz. Si existe, Vercel
lo sirve como archivo estático y la función nunca corre: el dueño guardaría
cambios y la tienda seguiría igual. (Pasó; por eso el respaldo vive en
`_plantilla/`.)

## Trabajar en el computador

```bash
npm install
node _tools/sembrar.js          # vuelca el catálogo a _datos/crowcaps.db
npm run dev
```

→ http://localhost:5325 y http://localhost:5325/admin

Si no pones `SETUP_TOKEN`, el servidor local inventa uno en cada arranque y lo
imprime en la consola: es el código para crear el primer administrador.

| Comando | Qué hace |
|---|---|
| `npm test` | comprueba el filtro de HTML de los titulares y las validaciones |
| `npm run sitio` | regenera `_plantilla/respaldo.html` desde la base |
| `npm run plantilla` | rehace `_plantilla/index.html` (los `{{marcadores}}`) |
| `npm run verificar` | ninguna imagen ampliada y ningún `srcset` que mienta |
| `npm run imagenes` | reconstruye las fotos y luego el respaldo |
| `npm run sembrar` | vuelca `js/products.js` a la base (`--rehacer` borra antes) |

**Regla al tocar los textos:** ningún valor editable puede empezar ni terminar
con espacio. El espacio va en el HTML de la plantilla (`{{clave}} <span…`),
porque el panel recorta los textos al guardar. `npm run plantilla` se planta si
alguien la incumple.

En local la base es un archivo SQLite y las fotos se guardan en `assets/img`.
En Vercel, lo mismo pero con Turso y Vercel Blob: el código es el mismo.

## Variables de entorno (Vercel)

| Variable | Para qué |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | base de datos (las pone la integración) |
| `BLOB_READ_WRITE_TOKEN` | fotos que se suben desde el panel |
| `SETUP_TOKEN` | código para crear el PRIMER administrador |
| `ENLACE_ACCESO` | código del enlace `/admin?entrar=…`, para entrar sin escribir contraseña |

Si no pones `ENLACE_ACCESO`, el enlace acepta el `SETUP_TOKEN` **mientras nadie
le haya puesto contraseña al panel**: en esa ventana ese código ya permitía
crear el primer administrador, así que no da ningún poder nuevo. En cuanto hay
una contraseña de verdad, deja de servir.

`/api/estado` dice si todo está conectado, sin exponer nada sensible.

## Seguridad

- La contraseña se guarda como hash **scrypt** con sal; nunca en claro.
- La sesión es una **cookie httpOnly**; en la base solo queda su hash.
- **Cada** ruta `/api/admin/*` comprueba la sesión en el servidor.
- Máximo 8 intentos de acceso por IP y por correo cada 15 minutos.
- Las peticiones que cambian algo exigen mismo origen (anti-CSRF).
- Los titulares admiten solo `<em>`, `<strong>` y `<br>`; lo demás se escapa.
- El panel va con `noindex`, `no-store` y `X-Frame-Options: DENY`.

## Órdenes útiles

```bash
node _tools/build-html.js        # regenera el respaldo desde la base
node _tools/hacer-plantilla.js   # regenera la plantilla desde el respaldo
node _tools/build-img.js         # PNG originales -> WebP (nunca amplía)
node _tools/verificar-imagenes.js
node _tools/build-favicon.js
```

## Calidad de imagen (no romper esto)

Los originales miden **~510 px de ancho**. `build-img.js` NUNCA amplía
(`withoutEnlargement: true`): la versión grande sale al tamaño nativo con
calidad 88, y la chica a 360 px con un enfoque leve. Ampliar a 640 y comprimir
a 76 —como se hacía antes— costaba ~10 dB de PSNR y se notaba borroso.

El `srcset` lleva el ancho REAL de cada archivo, tomado del manifest.
Después de tocar imágenes:

```bash
node _tools/build-img.js && node _tools/build-html.js && node _tools/fix-dims-img.js
node _tools/verificar-imagenes.js   # falla si algo se amplió o el srcset miente
```

## SEO e iconos

- `favicon.ico` va en la RAÍZ (Google lo busca ahí) y lleva 16+32+48 dentro.
  Se genera con `node _tools/build-favicon.js` a partir de la CARA de la
  mascota: el sello con el aro de texto no se lee a 16 px.
- `robots.txt` y `sitemap.xml` también en la raíz.
- El `<head>` declara Organization + WebSite + ItemList en JSON-LD, con URL y
  logo absolutos: eso es lo que Google usa para el nombre y el icono de marca.
- Si el snippet de Google se ve viejo, no es el sitio: hay que pedir la
  reindexación en Search Console. El HTML servido se comprueba con
  `curl -s https://crowcaps.co | grep description`.

## Decisiones que hay que respetar

- **No se inventa información.** Las fichas describen solo lo que se ve en la foto:
  colores, bordados, parches y forma. Nada de materiales, tallas, tecnologías ni
  certificaciones. **Precio único de $85.000** en `price` (pesos colombianos), por
  producto para poder variarlo después; el CTA lleva a WhatsApp con el precio en el mensaje.
- **Sin punto físico.** En ningún lado se muestra dirección ni mapa.
- **Fotos reales, sin filtros** que alteren el color del producto.
- Los logos de equipos/marcas que aparecen bordados se nombran tal cual se ven;
  la referencia sin marca identificable (`royal-b-nike`) usa un nombre descriptivo.

## Datos de contacto

- WhatsApp: +57 320 722 4241 (`573207224241`)
- Instagram / TikTok: @crowcaps.co · Facebook: CrowCaps
- Envíos gratis a todo Colombia · Incluye empaque especial

## Pendientes para publicar

1. **Precios por producto**: hoy las 61 comparten `price: 85000`. Si alguna cambia,
   basta editar su `price` y correr `node _tools/build-html.js`.
2. **URLs reales de redes**: los enlaces asumen `instagram.com/crowcaps.co`,
   `tiktok.com/@crowcaps.co` y `facebook.com/crowcaps`. Confirmar antes de salir.
3. **Dominio**: `canonical` y `og:url` apuntan a `https://crowcaps.co/`; cambiar si
   el dominio final es otro.
4. **Imagen Open Graph**: hoy usa una foto de producto; sirve, pero una pieza
   diseñada 1200×630 rendiría mejor al compartir.
