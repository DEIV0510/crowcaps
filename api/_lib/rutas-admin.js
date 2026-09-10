/* ═══════════════════════════════════════════════════════════════════════════
   RUTAS DEL PANEL
   ───────────────────────────────────────────────────────────────────────────
   TODAS piden sesión antes de tocar nada (menos el login y /api/estado). La
   comprobación se hace aquí, en el servidor: da igual lo que haga el navegador.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const { todos, uno, correr, ahora } = require('./db');
const auth = require('./auth');
const { ok, fallo, cuerpoJson } = require('./http');
const V = require('./validar');
const C = require('./contenido');
const IMG = require('./imagenes');

const { ErrorDeDatos } = V;

/* Marca el producto como tocado y devuelve el nuevo sello de tiempo. El editor
   lo necesita para no confundir su propio cambio con el de otra persona. */
async function sellar(productoId) {
  const t = ahora();
  await correr('UPDATE productos SET actualizado = ? WHERE id = ?', [t, productoId]);
  return t;
}

/* ── Auditoría ───────────────────────────────────────────────────────────── */
async function anotar(usuario, accion, entidad, entidadId, detalle) {
  try {
    await correr(
      'INSERT INTO auditoria (usuario, accion, entidad, entidad_id, detalle, cuando) VALUES (?, ?, ?, ?, ?, ?)',
      [usuario ? usuario.correo : null, accion, entidad || null, entidadId == null ? null : String(entidadId), detalle || null, ahora()]
    );
  } catch (_) { /* que un fallo del registro no tumbe la operación real */ }
}

/* ── Instalación: crear el primer administrador ──────────────────────────────
   Solo funciona si NO hay ningún usuario todavía y quien llama trae el token
   de instalación (variable de entorno). Así nadie puede reclamar el panel. */
async function instalar(req, res) {
  const hay = await uno('SELECT COUNT(*) AS n FROM usuarios');
  if (Number(hay.n) > 0) return fallo(res, 409, 'El panel ya está instalado.');

  const esperado = process.env.SETUP_TOKEN || '';
  if (!esperado) return fallo(res, 503, 'Falta configurar SETUP_TOKEN en el servidor.');

  const d = await cuerpoJson(req);
  if (String(d.token || '') !== esperado) return fallo(res, 403, 'Código de instalación incorrecto.');

  const correo = V.correoValido(d.correo);
  if (!correo) throw new ErrorDeDatos('Escribe un correo válido.');
  const flojera = auth.revisarFortaleza(d.clave);
  if (flojera) throw new ErrorDeDatos(flojera);

  const r = await correr(
    'INSERT INTO usuarios (correo, nombre, clave, rol, activo, creado) VALUES (?, ?, ?, ?, 1, ?)',
    [correo, V.limpio(d.nombre, 60) || 'Administrador', auth.hashear(d.clave), 'admin', ahora()]
  );
  await anotar({ correo }, 'instalar', 'usuario', r.id, 'primer administrador');
  await auth.abrirSesion(res, r.id, req.headers['user-agent']);
  return ok(res, { correo });
}

/* ── Login / logout ──────────────────────────────────────────────────────── */
async function login(req, res) {
  const d = await cuerpoJson(req);
  const correo = V.correoValido(d.correo);
  const ip = auth.ipDe(req);

  /* El freno cuenta por IP y por correo: ni fuerza bruta desde un sitio ni
     repartida entre muchos contra la misma cuenta. */
  if (await auth.demasiadosIntentos('ip:' + ip) || (correo && await auth.demasiadosIntentos('correo:' + correo))) {
    return fallo(res, 429, `Demasiados intentos. Espera ${auth.VENTANA_MINUTOS} minutos y vuelve a probar.`);
  }

  const usuario = correo ? await uno('SELECT * FROM usuarios WHERE correo = ?', [correo]) : null;
  const valida = usuario && usuario.activo && auth.verificar(d.clave, usuario.clave);

  if (!valida) {
    await auth.anotarIntento('ip:' + ip);
    if (correo) await auth.anotarIntento('correo:' + correo);
    // Mismo mensaje exista o no el correo: no se confirma qué cuentas hay
    return fallo(res, 401, 'Credenciales incorrectas.');
  }

  await auth.limpiarIntentos('ip:' + ip);
  await auth.limpiarIntentos('correo:' + correo);
  await auth.abrirSesion(res, usuario.id, req.headers['user-agent']);
  await anotar(usuario, 'entrar', 'usuario', usuario.id, null);
  return ok(res, { usuario: { correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol } });
}

async function logout(req, res) {
  await auth.cerrarSesion(req, res);
  return ok(res);
}

async function yo(req, res) {
  const u = await auth.usuarioActual(req);
  const hay = await uno('SELECT COUNT(*) AS n FROM usuarios');
  return ok(res, {
    usuario: u,
    instalado: Number(hay.n) > 0,
    /* Para que el panel pueda recordarle que todavía no le puso contraseña */
    faltaClave: await auth.faltaPonerClave(u),
  });
}

async function cambiarClave(req, res, usuario) {
  const d = await cuerpoJson(req);
  const fila = await uno('SELECT * FROM usuarios WHERE id = ?', [usuario.id]);
  if (!fila) throw new ErrorDeDatos('La contraseña actual no es correcta.');
  /* Si la cuenta entró por enlace y todavía no tiene contraseña, esta es la
     primera: no hay ninguna anterior que pedir. Para llegar aquí ya hizo falta
     una sesión válida, así que no se salta ningún control. */
  const yaTenia = auth.tieneClaveDeVerdad(fila.clave);
  if (yaTenia && !auth.verificar(d.actual, fila.clave)) {
    throw new ErrorDeDatos('La contraseña actual no es correcta.');
  }
  const flojera = auth.revisarFortaleza(d.nueva);
  if (flojera) throw new ErrorDeDatos(flojera);
  await correr('UPDATE usuarios SET clave = ? WHERE id = ?', [auth.hashear(d.nueva), usuario.id]);
  /* Cambiar la contraseña cierra las demás sesiones */
  await correr('DELETE FROM sesiones WHERE usuario_id = ?', [usuario.id]);
  await auth.abrirSesion(res, usuario.id, req.headers['user-agent']);
  await anotar(usuario, 'cambiar-clave', 'usuario', usuario.id, null);
  return ok(res);
}

/* ── Dashboard ───────────────────────────────────────────────────────────── */
async function resumen(req, res) {
  const [n, pub, ocultos, dest, sinFoto] = await Promise.all([
    uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NULL'),
    uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NULL AND publicado = 1'),
    uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NULL AND publicado = 0'),
    uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NULL AND destacado = 1'),
    uno(`SELECT COUNT(*) AS n FROM productos p WHERE p.eliminado IS NULL
           AND NOT EXISTS (SELECT 1 FROM imagenes i WHERE i.producto_id = p.id)`),
  ]);
  const movimientos = await todos('SELECT * FROM auditoria ORDER BY id DESC LIMIT 12');
  const papelera = await uno('SELECT COUNT(*) AS n FROM productos WHERE eliminado IS NOT NULL');
  return ok(res, {
    total: Number(n.n), publicados: Number(pub.n), ocultos: Number(ocultos.n),
    destacados: Number(dest.n), sinFoto: Number(sinFoto.n), papelera: Number(papelera.n),
    movimientos,
  });
}

/* ── Productos ───────────────────────────────────────────────────────────── */
async function listarProductos(req, res, usuario, url) {
  const q = V.limpio(url.searchParams.get('q'), 60).toLowerCase();
  const estado = url.searchParams.get('estado') || 'todos';
  const orden = url.searchParams.get('orden') || 'manual';

  /* La papelera es una consulta aparte: son justo las que las demás excluyen */
  let P = await C.productos({ soloPublicados: false, papelera: estado === 'papelera' });
  if (estado === 'publicados') P = P.filter((p) => p.publicado);
  if (estado === 'ocultos') P = P.filter((p) => !p.publicado);
  if (estado === 'destacados') P = P.filter((p) => p.destacado);
  if (estado === 'sin-foto') P = P.filter((p) => !p.imagenes.length);

  if (q) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = norm(q);
    P = P.filter((p) => norm([p.name, p.team, p.modelo, p.colorway].join(' ')).includes(t));
  }

  const cmp = {
    manual: (a, b) => a.orden - b.orden || a.dbId - b.dbId,
    nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    precio: (a, b) => (b.price || 0) - (a.price || 0),
    nuevos: (a, b) => b.dbId - a.dbId,
    viejos: (a, b) => a.dbId - b.dbId,
  }[orden] || ((a, b) => a.orden - b.orden);
  P.sort(cmp);

  return ok(res, { productos: P, total: P.length });
}

async function verProducto(req, res, usuario, url, id) {
  const P = await C.productos({ soloPublicados: false });
  const p = P.find((x) => String(x.dbId) === String(id) || x.id === String(id));
  if (!p) return fallo(res, 404, 'Esa gorra ya no existe.');
  return ok(res, { producto: p });
}

async function slugLibre(base, exceptoId) {
  let slug = base, i = 2;
  for (;;) {
    const fila = await uno('SELECT id FROM productos WHERE slug = ?', [slug]);
    if (!fila || (exceptoId && String(fila.id) === String(exceptoId))) return slug;
    slug = base + '-' + i++;
    if (i > 200) throw new ErrorDeDatos('No pude generar una dirección única para esta gorra.');
  }
}

async function crearProducto(req, res, usuario) {
  const d = await cuerpoJson(req);
  const p = V.producto(d, { esNuevo: true });
  p.slug = await slugLibre(p.slug);

  const ultimo = await uno('SELECT MAX(orden) AS m FROM productos WHERE eliminado IS NULL');
  const orden = p.orden !== undefined ? p.orden : Number(ultimo && ultimo.m ? ultimo.m : 0) + 1;

  const r = await correr(
    `INSERT INTO productos (slug, nombre, equipo, modelo, colorway, precio, precio_antes,
       descripcion, descripcion_corta, caracteristicas, categorias, incluye, envio,
       destacado, publicado, orden, creado, actualizado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.slug, p.nombre, p.equipo, p.modelo, p.colorway, p.precio, p.precio_antes,
     p.descripcion, p.descripcion_corta, JSON.stringify(p.caracteristicas), JSON.stringify(p.categorias),
     p.incluye, p.envio, p.destacado, p.publicado, orden, ahora(), ahora()]
  );
  await anotar(usuario, 'crear', 'producto', r.id, p.nombre);
  return ok(res, { id: r.id, slug: p.slug });
}

async function editarProducto(req, res, usuario, url, id) {
  const actual = await uno('SELECT * FROM productos WHERE id = ? AND eliminado IS NULL', [id]);
  if (!actual) return fallo(res, 404, 'Esa gorra ya no existe.');

  const d = await cuerpoJson(req);

  /* Dos pestañas abiertas no se pisan: si el registro cambió después de que
     esta pantalla lo cargó, se avisa en vez de sobrescribir a ciegas. */
  if (d.actualizado && String(d.actualizado) !== String(actual.actualizado)) {
    return fallo(res, 409, 'Alguien más guardó cambios en esta gorra mientras la editabas. Vuelve a abrirla para no pisar su trabajo.');
  }

  const p = V.producto({ ...d, slug: d.slug || actual.slug });
  p.slug = await slugLibre(p.slug, id);

  /* Publicar exige al menos una foto: una ficha sin imagen rompe la tienda */
  if (p.publicado) {
    const fotos = await uno('SELECT COUNT(*) AS n FROM imagenes WHERE producto_id = ?', [id]);
    if (!Number(fotos.n)) throw new ErrorDeDatos('Para publicar, la gorra necesita al menos una foto.');
  }

  await correr(
    `UPDATE productos SET slug=?, nombre=?, equipo=?, modelo=?, colorway=?, precio=?, precio_antes=?,
       descripcion=?, descripcion_corta=?, caracteristicas=?, categorias=?, incluye=?, envio=?,
       destacado=?, publicado=?, orden=?, actualizado=?
     WHERE id = ?`,
    [p.slug, p.nombre, p.equipo, p.modelo, p.colorway, p.precio, p.precio_antes,
     p.descripcion, p.descripcion_corta, JSON.stringify(p.caracteristicas), JSON.stringify(p.categorias),
     p.incluye, p.envio, p.destacado, p.publicado, p.orden !== undefined ? p.orden : actual.orden, ahora(), id]
  );
  await anotar(usuario, 'editar', 'producto', id, p.nombre);
  const nuevo = await uno('SELECT actualizado FROM productos WHERE id = ?', [id]);
  return ok(res, { slug: p.slug, actualizado: nuevo.actualizado });
}

async function borrarProducto(req, res, usuario, url, id) {
  const p = await uno('SELECT * FROM productos WHERE id = ?', [id]);
  if (!p) return fallo(res, 404, 'Esa gorra ya no existe.');
  /* Borrado suave: sale de la tienda y del listado, pero se puede recuperar */
  await correr('UPDATE productos SET eliminado = ?, publicado = 0, actualizado = ? WHERE id = ?', [ahora(), ahora(), id]);
  await anotar(usuario, 'eliminar', 'producto', id, p.nombre);
  return ok(res);
}

async function restaurarProducto(req, res, usuario, url, id) {
  const p = await uno('SELECT * FROM productos WHERE id = ?', [id]);
  if (!p) return fallo(res, 404, 'Esa gorra ya no existe.');
  await correr('UPDATE productos SET eliminado = NULL, actualizado = ? WHERE id = ?', [ahora(), id]);
  await anotar(usuario, 'restaurar', 'producto', id, p.nombre);
  return ok(res);
}

async function duplicarProducto(req, res, usuario, url, id) {
  const p = await uno('SELECT * FROM productos WHERE id = ? AND eliminado IS NULL', [id]);
  if (!p) return fallo(res, 404, 'Esa gorra ya no existe.');

  const slug = await slugLibre(p.slug + '-copia');
  const ultimo = await uno('SELECT MAX(orden) AS m FROM productos WHERE eliminado IS NULL');
  const r = await correr(
    `INSERT INTO productos (slug, nombre, equipo, modelo, colorway, precio, precio_antes,
       descripcion, descripcion_corta, caracteristicas, categorias, incluye, envio,
       destacado, publicado, orden, creado, actualizado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    [slug, p.nombre + ' (copia)', p.equipo, p.modelo, p.colorway, p.precio, p.precio_antes,
     p.descripcion, p.descripcion_corta, p.caracteristicas, p.categorias, p.incluye, p.envio,
     0, Number(ultimo && ultimo.m ? ultimo.m : 0) + 1, ahora(), ahora()]
  );
  /* La copia nace como borrador y comparte las MISMAS fotos ya procesadas */
  const fotos = await todos('SELECT * FROM imagenes WHERE producto_id = ? ORDER BY orden', [id]);
  for (const f of fotos) {
    await correr(
      'INSERT INTO imagenes (producto_id, src, sm, w, h, sm_w, sm_h, alt, orden, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [r.id, f.src, f.sm, f.w, f.h, f.sm_w, f.sm_h, f.alt, f.orden, ahora()]
    );
  }
  await anotar(usuario, 'duplicar', 'producto', r.id, p.nombre);
  return ok(res, { id: r.id, slug });
}

async function ordenarProductos(req, res, usuario) {
  const d = await cuerpoJson(req);
  const ids = Array.isArray(d.ids) ? d.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new ErrorDeDatos('No llegó ningún orden.');
  for (let i = 0; i < ids.length; i++) {
    await correr('UPDATE productos SET orden = ?, actualizado = ? WHERE id = ?', [i + 1, ahora(), ids[i]]);
  }
  await anotar(usuario, 'ordenar', 'producto', null, ids.length + ' gorras');
  return ok(res, { n: ids.length });
}

/* Interruptores rápidos desde el listado */
async function alternar(req, res, usuario, url, id, campo) {
  const p = await uno('SELECT * FROM productos WHERE id = ? AND eliminado IS NULL', [id]);
  if (!p) return fallo(res, 404, 'Esa gorra ya no existe.');
  const nuevo = p[campo] ? 0 : 1;
  if (campo === 'publicado' && nuevo === 1) {
    const fotos = await uno('SELECT COUNT(*) AS n FROM imagenes WHERE producto_id = ?', [id]);
    if (!Number(fotos.n)) throw new ErrorDeDatos('Para publicar, la gorra necesita al menos una foto.');
    if (!p.descripcion) throw new ErrorDeDatos('Para publicar, la gorra necesita una descripción.');
    if (p.precio === null) throw new ErrorDeDatos('Para publicar, la gorra necesita un precio.');
  }
  await correr(`UPDATE productos SET ${campo} = ?, actualizado = ? WHERE id = ?`, [nuevo, ahora(), id]);
  await anotar(usuario, nuevo ? campo : 'no-' + campo, 'producto', id, p.nombre);
  return ok(res, { [campo]: !!nuevo });
}

/* ── Imágenes ────────────────────────────────────────────────────────────── */
async function subirImagen(req, res, usuario, url, id) {
  const p = await uno('SELECT * FROM productos WHERE id = ? AND eliminado IS NULL', [id]);
  if (!p) return fallo(res, 404, 'Esa gorra ya no existe.');

  const d = await cuerpoJson(req);

  /* Reutilizar una foto que ya está en el proyecto (no vuelve a subir nada) */
  if (d.existente) {
    const src = V.enlace(d.existente, { permitirVacio: false });
    const ultimo = await uno('SELECT MAX(orden) AS m FROM imagenes WHERE producto_id = ?', [id]);
    const r = await correr(
      'INSERT INTO imagenes (producto_id, src, sm, w, h, sm_w, sm_h, alt, orden, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, src, src.replace('.webp', '-sm.webp'), d.w || 515, d.h || 717, 360, 501,
       V.limpio(d.alt, 160), Number(ultimo && ultimo.m ? ultimo.m : 0) + 1, ahora()]
    );
    const sello1 = await sellar(id);
    await anotar(usuario, 'foto-existente', 'producto', id, src);
    return ok(res, { id: r.id, src, actualizado: sello1 });
  }

  const base64 = String(d.datos || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new ErrorDeDatos('No llegó ninguna imagen.');
  const buffer = Buffer.from(base64, 'base64');
  const foto = await IMG.guardarFoto(buffer, d.nombre || p.slug);

  const ultimo = await uno('SELECT MAX(orden) AS m FROM imagenes WHERE producto_id = ?', [id]);
  const r = await correr(
    'INSERT INTO imagenes (producto_id, src, sm, w, h, sm_w, sm_h, alt, orden, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, foto.src, foto.sm, foto.w, foto.h, foto.sm_w, foto.sm_h, V.limpio(d.alt, 160),
     Number(ultimo && ultimo.m ? ultimo.m : 0) + 1, ahora()]
  );
  const sello2 = await sellar(id);
  await anotar(usuario, 'subir-foto', 'producto', id, `${foto.w}×${foto.h}`);
  return ok(res, { id: r.id, ...foto, actualizado: sello2 });
}

async function borrarImagen(req, res, usuario, url, id) {
  const f = await uno('SELECT * FROM imagenes WHERE id = ?', [id]);
  if (!f) return fallo(res, 404, 'Esa foto ya no está.');

  /* Si la foto también la usa otro producto (duplicado), no se borra el
     archivo: solo se quita de esta ficha. */
  const otras = await uno('SELECT COUNT(*) AS n FROM imagenes WHERE src = ? AND id <> ?', [f.src, id]);
  await correr('DELETE FROM imagenes WHERE id = ?', [id]);
  if (!Number(otras.n) && !/^assets\/img\//.test(f.src)) await IMG.borrarFoto(f.src);

  const sello3 = await sellar(f.producto_id);
  await anotar(usuario, 'borrar-foto', 'producto', f.producto_id, f.src);
  return ok(res, { actualizado: sello3 });
}

async function ordenarImagenes(req, res, usuario) {
  const d = await cuerpoJson(req);
  const ids = Array.isArray(d.ids) ? d.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new ErrorDeDatos('No llegó ningún orden.');
  for (let i = 0; i < ids.length; i++) {
    await correr('UPDATE imagenes SET orden = ? WHERE id = ?', [i, ids[i]]);
  }
  const sello4 = d.producto_id ? await sellar(d.producto_id) : null;
  return ok(res, { n: ids.length, actualizado: sello4 });
}

async function biblioteca(req, res) {
  const fotos = await IMG.fotosDelProyecto();
  const usadas = await todos('SELECT DISTINCT src FROM imagenes');
  const enUso = new Set(usadas.map((x) => x.src));
  return ok(res, { fotos: fotos.map((f) => ({ ...f, enUso: enUso.has(f.src) })) });
}

/* ── Categorías ──────────────────────────────────────────────────────────── */
async function listarCategorias(req, res) {
  const cats = await C.categorias({ soloActivas: false });
  const P = await C.productos({ soloPublicados: false });
  const cuenta = {};
  P.forEach((p) => (p.colors || []).forEach((c) => { cuenta[c] = (cuenta[c] || 0) + 1; }));
  return ok(res, { categorias: cats.map((c) => ({ ...c, usos: cuenta[c.slug] || 0 })) });
}

async function guardarCategoria(req, res, usuario, url, id) {
  const d = await cuerpoJson(req);
  const c = V.categoria(d);
  if (id) {
    const existe = await uno('SELECT id FROM categorias WHERE slug = ? AND id <> ?', [c.slug, id]);
    if (existe) throw new ErrorDeDatos('Ya hay otra categoría con ese nombre.');
    await correr('UPDATE categorias SET slug=?, nombre=?, orden=?, activa=? WHERE id=?', [c.slug, c.nombre, c.orden, c.activa, id]);
    await anotar(usuario, 'editar', 'categoria', id, c.nombre);
    return ok(res, { id: Number(id) });
  }
  const existe = await uno('SELECT id FROM categorias WHERE slug = ?', [c.slug]);
  if (existe) throw new ErrorDeDatos('Ya hay una categoría con ese nombre.');
  const r = await correr('INSERT INTO categorias (slug, nombre, orden, activa) VALUES (?,?,?,?)', [c.slug, c.nombre, c.orden, c.activa]);
  await anotar(usuario, 'crear', 'categoria', r.id, c.nombre);
  return ok(res, { id: r.id });
}

async function borrarCategoria(req, res, usuario, url, id) {
  const c = await uno('SELECT * FROM categorias WHERE id = ?', [id]);
  if (!c) return fallo(res, 404, 'Esa categoría ya no existe.');
  const P = await C.productos({ soloPublicados: false });
  const usos = P.filter((p) => (p.colors || []).includes(c.slug)).length;
  if (usos) throw new ErrorDeDatos(`No puedo borrarla: ${usos} gorra(s) la están usando. Quítasela primero o desactívala.`);
  await correr('DELETE FROM categorias WHERE id = ?', [id]);
  await anotar(usuario, 'eliminar', 'categoria', id, c.nombre);
  return ok(res);
}

/* ── Contenido / configuración ───────────────────────────────────────────── */
async function verContenido(req, res) {
  const c = await C.contenido();
  const P = await C.productos({ soloPublicados: false });
  return ok(res, {
    contenido: c,
    productos: P.map((p) => ({ id: p.id, nombre: p.name, publicado: p.publicado, foto: p.imagenes[0] ? p.imagenes[0].sm : null })),
  });
}

async function guardarContenido(req, res, usuario) {
  const d = await cuerpoJson(req);
  const cambios = d.cambios || {};
  const n = await C.guardar(cambios);
  /* Si no cambió nada no se anota: el historial sirve para ver qué se tocó, y
     llenarlo de líneas vacías es la manera más rápida de volverlo inútil. */
  if (n > 0) await anotar(usuario, 'editar', 'contenido', null, Object.keys(cambios).join(', ').slice(0, 200));
  return ok(res, { guardados: n });
}

async function verAuditoria(req, res, usuario, url) {
  const limite = Math.min(Number(url.searchParams.get('n')) || 50, 200);
  const filas = await todos('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?', [limite]);
  return ok(res, { movimientos: filas });
}

module.exports = {
  instalar, login, logout, yo, cambiarClave, resumen,
  listarProductos, verProducto, crearProducto, editarProducto, borrarProducto,
  restaurarProducto, duplicarProducto, ordenarProductos, alternar,
  subirImagen, borrarImagen, ordenarImagenes, biblioteca,
  listarCategorias, guardarCategoria, borrarCategoria,
  verContenido, guardarContenido, verAuditoria, anotar,
};
