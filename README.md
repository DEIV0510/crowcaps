# CrowCaps · Gorras y Streetwear (Medellín, Colombia)

Experiencia web de una sola página, sin frameworks ni build step. HTML + CSS + JS
vanilla, imágenes optimizadas a WebP y venta 100% por WhatsApp.

## Correr el proyecto

```bash
node serve.js
```

→ http://localhost:5325 (también funciona abriendo `index.html` directo: todas las rutas son relativas).

## Estructura

```
index.html            página completa; la grilla de producto va escrita en el HTML
css/style.css         sistema visual completo (tokens, componentes, responsive)
js/products.js        catálogo: 38 gorras (datos separados de la presentación)
js/app.js             loader, nav, filtros, buscador, drawer, cursor, reveal
assets/img/           94 fotos reales en WebP, en 2 tamaños (340w y 640w)
assets/brand/         logo, sello, mascota y wordmark extraídos del PDF de marca
_tools/               scripts de build (imágenes, marca, grilla)
_work/                material intermedio (rasterizado del PDF, previews)
```

## Scripts de build

Necesitan `sharp`. Si no está instalado en el proyecto, se puede apuntar a otro:

```bash
export NODE_PATH="C:/Users/Lenovo/Desktop/PROYECTOS-CLAUDE/capsclub/node_modules"
node _tools/build-img.js     # PNG originales -> WebP responsive + manifest
node _tools/build-brand.js   # lámina del logo -> sello/mascota/wordmark (papel e ink)
node _tools/build-html.js    # vuelca products.js dentro de index.html (+ JSON-LD)
node _tools/fix-dims.js      # sincroniza width/height de las imágenes de marca
```

Después de tocar `js/products.js` hay que correr `node _tools/build-html.js`.

Las fotos fuente viven en `C:\Users\Lenovo\Desktop\crowcaps` (`build-img.js`, constante `SRC`).

## Colección por tandas

La grilla trae las 62 fichas escritas en el HTML (SEO y funciona sin JS), pero el JS
muestra **tandas de 12** con el botón "Ver más" y un contador `12 / 62` en la barra de
filtros. Filtrar o buscar reinicia la tanda. El tamaño de tanda es la constante `PASO`
en `js/app.js`.

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

1. **Precios por producto**: hoy las 62 comparten `price: 85000`. Si alguna cambia,
   basta editar su `price` y correr `node _tools/build-html.js`.
2. **URLs reales de redes**: los enlaces asumen `instagram.com/crowcaps.co`,
   `tiktok.com/@crowcaps.co` y `facebook.com/crowcaps`. Confirmar antes de salir.
3. **Dominio**: `canonical` y `og:url` apuntan a `https://crowcaps.co/`; cambiar si
   el dominio final es otro.
4. **Imagen Open Graph**: hoy usa una foto de producto; sirve, pero una pieza
   diseñada 1200×630 rendiría mejor al compartir.
