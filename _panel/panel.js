/* ===========================================================================
   PANEL DE CROWCAPS
   ---------------------------------------------------------------------------
   Vanilla, sin dependencias. Todo lo que hace pasa por la API, que es quien
   comprueba la sesión: aquí no hay ninguna decisión de seguridad.
   =========================================================================== */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var cop = function (n) { return n == null ? '—' : '$' + Number(n).toLocaleString('es-CO'); };

  var estado = { usuario: null, vista: 'panel', sucio: false, productos: [], contenido: null, categorias: [], faltaClave: false };

  /* ── API ────────────────────────────────────────────────────────────────── */
  function api(metodo, ruta, datos) {
    var opciones = { method: metodo, credentials: 'same-origin', headers: {} };
    if (datos !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }
    return fetch(ruta, opciones).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'El servidor respondió algo inesperado.' }; })
        .then(function (j) {
          if (!r.ok || j.ok === false) {
            var e = new Error(j.error || 'No se pudo completar la operación.');
            e.codigo = r.status; e.errores = j.errores || [];
            throw e;
          }
          return j;
        });
    });
  }

  /* ── Avisos ─────────────────────────────────────────────────────────────── */
  function avisar(texto, mal) {
    var d = document.createElement('div');
    d.className = 'toast' + (mal ? ' mal' : '');
    d.textContent = texto;
    $('#avisos').appendChild(d);
    setTimeout(function () { d.remove(); }, mal ? 6000 : 3200);
  }

  function confirmar(titulo, texto, etiqueta) {
    return new Promise(function (resolver) {
      var m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML =
        '<div class="modal__fondo"></div><div class="modal__caja">' +
        '<h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p>' +
        '<div class="modal__acc"><button class="btn" data-no>Cancelar</button>' +
        '<button class="btn btn--peligro" data-si>' + esc(etiqueta || 'Eliminar') + '</button></div></div>';
      $('#modales').appendChild(m);
      var cerrar = function (v) { m.remove(); resolver(v); };
      $('[data-no]', m).onclick = function () { cerrar(false); };
      $('[data-si]', m).onclick = function () { cerrar(true); };
      $('.modal__fondo', m).onclick = function () { cerrar(false); };
      $('[data-si]', m).focus();
    });
  }

  /* Marca que hay cambios sin guardar y avisa antes de salir */
  function ensuciar(v) {
    estado.sucio = v !== false;
    var b = $('#btnGuardar');
    if (b) b.disabled = !estado.sucio;
  }
  window.addEventListener('beforeunload', function (e) {
    if (estado.sucio) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ── Acceso ─────────────────────────────────────────────────────────────── */
  function mostrarAcceso(instalado) {
    $('#app').hidden = true;
    $('#acceso').hidden = false;
    $('#formInstalar').hidden = instalado;
    $('#formEntrar').hidden = !instalado;
    (instalado ? $('#eCorreo') : $('#iToken')).focus();
  }

  function conError(caja, fn) {
    return function (ev) {
      ev.preventDefault();
      var boton = $('button[type=submit]', ev.target);
      var err = $(caja);
      err.hidden = true;
      boton.disabled = true;
      var textoOriginal = boton.textContent;
      boton.textContent = 'Un momento…';
      fn(ev).catch(function (e) {
        err.textContent = e.message;
        err.hidden = false;
      }).then(function () {
        boton.disabled = false;
        boton.textContent = textoOriginal;
      });
    };
  }

  $('#formInstalar').addEventListener('submit', conError('#errInstalar', function () {
    return api('POST', '/api/auth/instalar', {
      token: $('#iToken').value, nombre: $('#iNombre').value,
      correo: $('#iCorreo').value, clave: $('#iClave').value,
    }).then(arrancar);
  }));

  $('#formEntrar').addEventListener('submit', conError('#errEntrar', function () {
    return api('POST', '/api/auth/login', { correo: $('#eCorreo').value, clave: $('#eClave').value })
      .then(arrancar);
  }));

  $('#salir').addEventListener('click', function () {
    api('POST', '/api/auth/logout', {}).then(function () { location.reload(); });
  });

  /* ── Navegación ─────────────────────────────────────────────────────────── */
  $('#menu').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-vista]');
    if (!b) return;
    irA(b.dataset.vista);
  });
  $('#hamburguesa').addEventListener('click', function () { document.body.classList.toggle('menu'); });

  var VISTAS = {};
  function irA(nombre, args) {
    if (estado.sucio && !confirmSalir()) return;
    ensuciar(false);
    estado.vista = nombre;
    document.body.classList.remove('menu');
    $$('#menu button').forEach(function (b) { b.classList.toggle('on', b.dataset.vista === nombre.split(':')[0]); });
    $('#accionesBarra').innerHTML = '';
    $('#vista').innerHTML = '<p style="color:#8a8a95">Cargando…</p>';
    var fn = VISTAS[nombre.split(':')[0]];
    Promise.resolve(fn(args)).catch(function (e) {
      $('#vista').innerHTML = '<div class="aviso">' + esc(e.message) + '</div>';
    });
  }
  function confirmSalir() {
    return window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?');
  }

  /* ── Vista: panel ───────────────────────────────────────────────────────── */
  VISTAS.panel = function () {
    $('#titulo').textContent = 'Panel';
    return api('GET', '/api/admin/resumen').then(function (d) {
      var cifra = function (n, t, clase) {
        return '<div class="cifra' + (clase || '') + '"><b>' + n + '</b><span>' + t + '</span></div>';
      };
      var movs = d.movimientos.map(function (m) {
        return '<div class="mov"><span>' + esc(describir(m)) + '</span><time>' + hace(m.cuando) + '</time></div>';
      }).join('') || '<p style="color:#8a8a95">Todavía no hay movimientos.</p>';

      $('#vista').innerHTML =
        '<div class="cifras">' +
          cifra(d.total, 'Gorras en total') +
          cifra(d.publicados, 'Publicadas') +
          cifra(d.ocultos, 'Borradores') +
          cifra(d.destacados, 'Destacadas') +
          (d.sinFoto ? cifra(d.sinFoto, 'Sin foto', ' aviso') : '') +
          (d.papelera ? cifra(d.papelera, 'En papelera') : '') +
        '</div>' +
        '<div class="tarjeta" style="margin-top:16px"><div class="tarjeta__cab"><h2>Últimos cambios</h2></div>' +
        '<div class="tarjeta__cuerpo"><div class="movs">' + movs + '</div></div></div>' +
        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Atajos</h2></div><div class="tarjeta__cuerpo" style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn--primario" data-ir="nueva">+ Nueva gorra</button>' +
        '<button class="btn" data-ir="productos">Ver todas las gorras</button>' +
        '<button class="btn" data-ir="home">Editar la portada</button>' +
        '<a class="btn" href="/vista-previa" target="_blank" rel="noopener">Vista previa</a>' +
        '</div></div>';

      $$('#vista [data-ir]').forEach(function (b) {
        b.onclick = function () { b.dataset.ir === 'nueva' ? editor(null) : irA(b.dataset.ir); };
      });
    });
  };

  function describir(m) {
    var q = { crear: 'creó', editar: 'actualizó', eliminar: 'eliminó', duplicar: 'duplicó',
      publicado: 'publicó', 'no-publicado': 'ocultó', destacado: 'destacó', 'no-destacado': 'quitó de destacadas',
      restaurar: 'restauró', ordenar: 'reordenó', 'subir-foto': 'subió una foto a', 'borrar-foto': 'borró una foto de',
      'foto-existente': 'añadió una foto a', entrar: 'entró al panel', instalar: 'instaló el panel',
      'cambiar-clave': 'cambió su contraseña' }[m.accion] || m.accion;
    var quien = (m.usuario || 'alguien').split('@')[0];
    var qué = m.detalle ? ' ' + m.detalle : (m.entidad ? ' ' + m.entidad : '');
    return quien + ' ' + q + qué;
  }

  function hace(iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  /* ── Vista: productos ───────────────────────────────────────────────────── */
  VISTAS.productos = function () {
    $('#titulo').textContent = 'Gorras';
    $('#accionesBarra').innerHTML = '<button class="btn btn--primario" id="btnNueva">+ Nueva gorra</button>';
    $('#btnNueva').onclick = function () { editor(null); };

    var filtros = { q: '', estado: 'todos', orden: 'manual' };

    function pintar() {
      var url = '/api/admin/productos?q=' + encodeURIComponent(filtros.q) +
        '&estado=' + filtros.estado + '&orden=' + filtros.orden;
      return api('GET', url).then(function (d) {
        estado.productos = d.productos;
        $('#listaP').innerHTML = d.productos.length ? d.productos.map(fila).join('') : '';
        $('#vacioP').hidden = d.productos.length > 0;
        $('#cuenta').textContent = d.total + (d.total === 1 ? ' gorra' : ' gorras');
        conectarLista();
      });
    }

    function fila(p) {
      var foto = p.imagenes[0] ? p.imagenes[0].sm : '';
      return '<div class="item" data-id="' + p.dbId + '" draggable="' + (filtros.orden === 'manual') + '">' +
        '<div class="item__asa" title="Arrastra para ordenar">⠿</div>' +
        (foto ? '<img class="item__foto" src="' + esc(foto) + '" alt="" loading="lazy">'
              : '<div class="item__foto" title="Sin foto"></div>') +
        '<div class="item__txt"><b>' + esc(p.name) + '</b>' +
        '<span>' + esc(p.team || 'Sin equipo') + ' · ' + cop(p.price) + ' · ' + esc(p.colorway || '') + '</span></div>' +
        '<div class="item__acc">' +
          (p.publicado ? '<span class="etiqueta etiqueta--ok">Publicada</span>'
                       : '<span class="etiqueta etiqueta--off">Borrador</span>') +
          (p.destacado ? '<span class="etiqueta etiqueta--dest">Destacada</span>' : '') +
          (!p.imagenes.length ? '<span class="etiqueta etiqueta--aviso">Sin foto</span>' : '') +
          '<button class="btn btn--sm" data-act="editar">Editar</button>' +
          '<button class="btn btn--sm" data-act="publicar">' + (p.publicado ? 'Ocultar' : 'Publicar') + '</button>' +
          '<button class="btn btn--sm" data-act="destacar">' + (p.destacado ? 'Quitar' : 'Destacar') + '</button>' +
          '<button class="btn btn--sm" data-act="duplicar">Duplicar</button>' +
          '<button class="btn btn--sm btn--peligro" data-act="borrar">Eliminar</button>' +
        '</div></div>';
    }

    function conectarLista() {
      var lista = $('#listaP');
      $$('.item', lista).forEach(function (el) {
        var id = el.dataset.id;
        $$('[data-act]', el).forEach(function (b) {
          b.onclick = function () {
            var p = estado.productos.filter(function (x) { return String(x.dbId) === id; })[0];
            if (b.dataset.act === 'editar') return editor(id);
            b.disabled = true;
            var fin = function () { b.disabled = false; };
            if (b.dataset.act === 'publicar') {
              return api('POST', '/api/admin/productos/' + id + '/publicado', {})
                .then(function (r) { avisar(r.publicado ? 'Gorra publicada.' : 'Gorra oculta.'); return pintar(); })
                .catch(function (e) { avisar(e.message, true); }).then(fin);
            }
            if (b.dataset.act === 'destacar') {
              return api('POST', '/api/admin/productos/' + id + '/destacado', {})
                .then(function () { avisar('Listo.'); return pintar(); })
                .catch(function (e) { avisar(e.message, true); }).then(fin);
            }
            if (b.dataset.act === 'duplicar') {
              return api('POST', '/api/admin/productos/' + id + '/duplicar', {})
                .then(function (r) { avisar('Copia creada como borrador.'); editor(r.id); })
                .catch(function (e) { avisar(e.message, true); }).then(fin);
            }
            if (b.dataset.act === 'borrar') {
              fin();
              return confirmar('¿Eliminar «' + p.name + '»?',
                'Sale de la tienda y del listado. Queda en la papelera por si te arrepientes.', 'Eliminar')
                .then(function (si) {
                  if (!si) return;
                  return api('DELETE', '/api/admin/productos/' + id)
                    .then(function () { avisar('Gorra eliminada.'); return pintar(); })
                    .catch(function (e) { avisar(e.message, true); });
                });
            }
          };
        });
      });
      if (filtros.orden === 'manual') arrastrable(lista, '.item', function (ids) {
        api('POST', '/api/admin/productos/orden', { ids: ids.map(Number) })
          .then(function () { avisar('Orden guardado.'); })
          .catch(function (e) { avisar(e.message, true); pintar(); });
      });
    }

    $('#vista').innerHTML =
      '<div class="filtros">' +
        '<input type="search" id="fq" placeholder="Buscar por nombre, equipo o modelo…">' +
        '<select id="fe"><option value="todos">Todas</option><option value="publicados">Publicadas</option>' +
        '<option value="ocultos">Borradores</option><option value="destacados">Destacadas</option>' +
        '<option value="sin-foto">Sin foto</option></select>' +
        '<select id="fo"><option value="manual">Orden de la tienda</option><option value="nuevos">Más recientes</option>' +
        '<option value="viejos">Más antiguas</option><option value="nombre">Nombre</option><option value="precio">Precio</option></select>' +
        '<span id="cuenta" style="color:#8a8a95;font-size:13px"></span>' +
      '</div>' +
      '<div class="lista" id="listaP"></div>' +
      '<div class="vacio" id="vacioP" hidden><b>No hay gorras que mostrar</b>' +
      '<p>Cambia los filtros o crea la primera.</p>' +
      '<button class="btn btn--primario" id="btnPrimera">+ Crear la primera gorra</button></div>';

    $('#btnPrimera').onclick = function () { editor(null); };
    var t;
    $('#fq').oninput = function () { clearTimeout(t); filtros.q = this.value; t = setTimeout(pintar, 180); };
    $('#fe').onchange = function () { filtros.estado = this.value; pintar(); };
    $('#fo').onchange = function () { filtros.orden = this.value; pintar(); };
    return pintar();
  };

  /* Arrastrar y soltar para reordenar */
  function arrastrable(cont, selector, alSoltar) {
    var origen = null;
    $$(selector, cont).forEach(function (el) {
      el.addEventListener('dragstart', function () { origen = el; el.classList.add('arrastrando'); });
      el.addEventListener('dragend', function () {
        el.classList.remove('arrastrando');
        $$(selector, cont).forEach(function (x) { x.classList.remove('encima'); });
        alSoltar($$(selector, cont).map(function (x) { return x.dataset.id; }));
      });
      el.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!origen || origen === el) return;
        el.classList.add('encima');
        var caja = el.getBoundingClientRect();
        var despues = (e.clientY - caja.top) > caja.height / 2;
        cont.insertBefore(origen, despues ? el.nextSibling : el);
      });
      el.addEventListener('dragleave', function () { el.classList.remove('encima'); });
    });
  }

  /* ── Editor de producto ─────────────────────────────────────────────────── */
  function editor(id) {
    estado.vista = 'productos';
    $$('#menu button').forEach(function (b) { b.classList.toggle('on', b.dataset.vista === 'productos'); });
    $('#titulo').textContent = id ? 'Editar gorra' : 'Nueva gorra';
    $('#accionesBarra').innerHTML = '<button class="btn" id="btnVolver">← Volver</button>';
    $('#btnVolver').onclick = function () { irA('productos'); };
    $('#vista').innerHTML = '<p style="color:#8a8a95">Cargando…</p>';

    Promise.all([
      id ? api('GET', '/api/admin/productos/' + id) : Promise.resolve({ producto: nuevoProducto() }),
      api('GET', '/api/admin/categorias'),
    ]).then(function (r) {
      var p = r[0].producto;
      var cats = r[1].categorias;
      pintarEditor(p, cats, id);
    }).catch(function (e) { $('#vista').innerHTML = '<div class="aviso">' + esc(e.message) + '</div>'; });
  }

  function nuevoProducto() {
    return { dbId: null, name: '', team: '', modelo: '', colorway: '', price: null, precio_antes: null,
      desc: '', desc_corta: '', features: [], colors: [], destacado: false, publicado: false,
      imagenes: [], incluye: '', envio: '' };
  }

  function pintarEditor(p, cats, id) {
    var campo = function (etiqueta, html, pista) {
      return '<div class="campo"><label>' + esc(etiqueta) + '</label>' + html +
        (pista ? '<span class="pista">' + esc(pista) + '</span>' : '') + '</div>';
    };

    $('#vista').innerHTML =
      '<div class="editor">' +
      '<div>' +
        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Información</h2></div><div class="tarjeta__cuerpo">' +
          campo('Nombre *', '<input id="pNombre" type="text" value="' + esc(p.name) + '" maxlength="120">') +
          '<div class="fila">' +
            campo('Equipo o marca', '<input id="pEquipo" type="text" value="' + esc(p.team) + '">') +
            campo('Modelo', '<input id="pModelo" type="text" value="' + esc(p.modelo || '') + '">') +
          '</div>' +
          '<div class="fila">' +
            campo('Colorway', '<input id="pColorway" type="text" value="' + esc(p.colorway) + '">', 'Ej: Negro · Rojo') +
            campo('Precio (COP) *', '<input id="pPrecio" type="number" min="0" step="1000" value="' + (p.price == null ? '' : p.price) + '">') +
          '</div>' +
          campo('Precio anterior (opcional)', '<input id="pAntes" type="number" min="0" step="1000" value="' + (p.precio_antes == null ? '' : p.precio_antes) + '">', 'Solo si quieres mostrar un descuento. Debe ser mayor que el precio.') +
          campo('Descripción *', '<textarea id="pDesc" maxlength="1200">' + esc(p.desc) + '</textarea>', 'Describe solo lo que se ve en la foto. Nada de materiales ni tallas.') +
          campo('Descripción corta (opcional)', '<input id="pDescCorta" type="text" maxlength="200" value="' + esc(p.desc_corta || '') + '">') +
        '</div></div>' +

        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Características</h2>' +
          '<button class="btn btn--sm" id="btnCar">+ Agregar</button></div>' +
          '<div class="tarjeta__cuerpo"><div class="caracteristicas" id="cars"></div></div></div>' +

        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Envío e incluye</h2>' +
          '<p>Si lo dejas vacío se usa el texto general de la tienda.</p></div>' +
          '<div class="tarjeta__cuerpo">' +
          campo('Incluye', '<input id="pIncluye" type="text" maxlength="200" value="' + esc(p.incluye || '') + '">') +
          campo('Información de envío', '<input id="pEnvio" type="text" maxlength="200" value="' + esc(p.envio || '') + '">') +
        '</div></div>' +
      '</div>' +

      '<div>' +
        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Estado</h2></div><div class="tarjeta__cuerpo">' +
          '<label class="interruptor" style="margin-bottom:12px"><input type="checkbox" id="pPublicado"' + (p.publicado ? ' checked' : '') + '><i></i><span>Publicada en la tienda</span></label>' +
          '<label class="interruptor"><input type="checkbox" id="pDestacado"' + (p.destacado ? ' checked' : '') + '><i></i><span>Destacada</span></label>' +
        '</div></div>' +

        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Categorías</h2></div><div class="tarjeta__cuerpo" id="cajaCats">' +
          cats.map(function (c) {
            return '<label class="interruptor" style="margin-bottom:9px"><input type="checkbox" value="' + esc(c.slug) + '"' +
              (p.colors.indexOf(c.slug) > -1 ? ' checked' : '') + '><i></i><span>' + esc(c.nombre) + '</span></label>';
          }).join('') +
        '</div></div>' +

        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Fotos</h2>' +
          '<p>La primera es la principal. Arrástralas para cambiar el orden.</p></div>' +
          '<div class="tarjeta__cuerpo">' +
            (id ? '<div class="fotos" id="fotos"></div>' +
                  '<input type="file" id="archivo" accept="image/*" multiple hidden>' +
                  '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
                  '<button class="btn btn--sm" id="btnBiblio">Elegir de la biblioteca</button></div>'
                : '<p style="color:#8a8a95;font-size:13px">Guarda la gorra primero y después le subes las fotos.</p>') +
        '</div></div>' +
      '</div></div>' +

      '<div class="guardando">' +
        '<button class="btn btn--primario" id="btnGuardar" disabled>Guardar cambios</button>' +
        (id ? '<button class="btn" id="btnVer">Ver en la tienda</button>' : '') +
        '<span class="estado" id="estadoGuardado"></span>' +
      '</div>';

    /* Características */
    var cars = p.features.slice();
    function pintarCars() {
      $('#cars').innerHTML = cars.map(function (c, i) {
        return '<div class="caracteristica" data-i="' + i + '" draggable="true">' +
          '<span class="asa">⠿</span>' +
          '<input type="text" value="' + esc(c) + '" maxlength="160">' +
          '<button class="btn btn--sm btn--fantasma" title="Quitar">✕</button></div>';
      }).join('') || '<p style="color:#8a8a95;font-size:13px">Sin características todavía.</p>';
      $$('#cars .caracteristica').forEach(function (el) {
        var i = Number(el.dataset.i);
        $('input', el).oninput = function () { cars[i] = this.value; ensuciar(); };
        $('button', el).onclick = function () { cars.splice(i, 1); pintarCars(); ensuciar(); };
      });
      arrastrable($('#cars'), '.caracteristica', function () {
        cars = $$('#cars .caracteristica input').map(function (x) { return x.value; });
        ensuciar();
      });
    }
    pintarCars();
    $('#btnCar').onclick = function () { cars.push(''); pintarCars(); ensuciar(); };

    /* Fotos */
    function pintarFotos() {
      if (!id) return;
      var caja = $('#fotos');
      caja.innerHTML = p.imagenes.map(function (im, i) {
        return '<div class="foto" data-id="' + im.id + '" draggable="true">' +
          (i === 0 ? '<span class="foto__p">Principal</span>' : '') +
          '<img src="' + esc(im.sm || im.src) + '" alt="">' +
          '<button class="foto__x" title="Quitar">✕</button></div>';
      }).join('') + '<div class="soltar" id="soltar">Arrastra fotos aquí<br>o haz clic para elegir</div>';

      $$('.foto', caja).forEach(function (el) {
        $('.foto__x', el).onclick = function () {
          confirmar('¿Quitar esta foto?', 'Se borra de la gorra. Si no la usa nadie más, se elimina del almacenamiento.', 'Quitar')
            .then(function (si) {
              if (!si) return;
              api('DELETE', '/api/admin/imagenes/' + el.dataset.id).then(function (r) {
                if (r.actualizado) p.actualizado = r.actualizado;
                p.imagenes = p.imagenes.filter(function (x) { return String(x.id) !== el.dataset.id; });
                pintarFotos(); avisar('Foto quitada.');
              }).catch(function (e) { avisar(e.message, true); });
            });
        };
      });

      arrastrable(caja, '.foto', function (ids) {
        api('POST', '/api/admin/imagenes/orden', { ids: ids.map(Number), producto_id: id })
          .then(function (r) {
            if (r.actualizado) p.actualizado = r.actualizado;
            p.imagenes.sort(function (a, b) { return ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)); });
            pintarFotos(); avisar('Orden de fotos guardado.');
          }).catch(function (e) { avisar(e.message, true); });
      });

      var soltar = $('#soltar');
      soltar.onclick = function () { $('#archivo').click(); };
      soltar.ondragover = function (e) { e.preventDefault(); soltar.classList.add('encima'); };
      soltar.ondragleave = function () { soltar.classList.remove('encima'); };
      soltar.ondrop = function (e) {
        e.preventDefault(); soltar.classList.remove('encima');
        subirArchivos(e.dataTransfer.files);
      };
    }

    function subirArchivos(archivos) {
      var lista = Array.prototype.slice.call(archivos || []);
      if (!lista.length) return;
      var soltar = $('#soltar');
      var hechas = 0;
      soltar.textContent = 'Subiendo 1 de ' + lista.length + '…';

      lista.reduce(function (cadena, f) {
        return cadena.then(function () {
          if (!/^image\//.test(f.type)) { avisar(f.name + ' no es una imagen.', true); return; }
          if (f.size > 9 * 1024 * 1024) { avisar(f.name + ' pesa más de 9 MB.', true); return; }
          soltar.textContent = 'Subiendo ' + (hechas + 1) + ' de ' + lista.length + '…';
          return leerArchivo(f).then(function (datos) {
            return api('POST', '/api/admin/productos/' + id + '/imagenes', { datos: datos, nombre: f.name });
          }).then(function (r) {
            if (r.actualizado) p.actualizado = r.actualizado;
            p.imagenes.push({ id: r.id, src: r.src, sm: r.sm, w: r.w, h: r.h });
            hechas++;
          }).catch(function (e) { avisar(f.name + ': ' + e.message, true); });
        });
      }, Promise.resolve()).then(function () {
        pintarFotos();
        if (hechas) avisar(hechas === 1 ? 'Foto subida.' : hechas + ' fotos subidas.');
      });
    }

    function leerArchivo(f) {
      return new Promise(function (ok, mal) {
        var lector = new FileReader();
        lector.onload = function () { ok(String(lector.result).split(',')[1]); };
        lector.onerror = function () { mal(new Error('No pude leer el archivo.')); };
        lector.readAsDataURL(f);
      });
    }

    if (id) {
      pintarFotos();
      $('#archivo').onchange = function () { subirArchivos(this.files); this.value = ''; };
      $('#btnBiblio').onclick = function () { abrirBiblioteca(id, p, pintarFotos); };
      $('#btnVer').onclick = function () {
        window.open(p.publicado ? '/#coleccion' : '/vista-previa', '_blank', 'noopener');
      };
    }

    /* Guardar */
    $$('#vista input, #vista textarea, #vista select').forEach(function (el) {
      el.addEventListener('input', function () { ensuciar(); });
      el.addEventListener('change', function () { ensuciar(); });
    });

    $('#btnGuardar').onclick = function () {
      var b = this;
      b.disabled = true;
      $('#estadoGuardado').textContent = 'Guardando…';
      var datos = {
        nombre: $('#pNombre').value, equipo: $('#pEquipo').value, modelo: $('#pModelo').value,
        colorway: $('#pColorway').value, precio: $('#pPrecio').value, precio_antes: $('#pAntes').value,
        descripcion: $('#pDesc').value, descripcion_corta: $('#pDescCorta').value,
        caracteristicas: cars.filter(function (c) { return c.trim(); }),
        categorias: $$('#cajaCats input:checked').map(function (x) { return x.value; }),
        incluye: $('#pIncluye').value, envio: $('#pEnvio').value,
        destacado: $('#pDestacado').checked, publicado: $('#pPublicado').checked,
        actualizado: p.actualizado,
      };
      var peticion = id
        ? api('PUT', '/api/admin/productos/' + id, datos)
        : api('POST', '/api/admin/productos', datos);

      peticion.then(function (r) {
        ensuciar(false);
        $('#estadoGuardado').textContent = 'Guardado ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        avisar('Cambios guardados.');
        if (!id) { avisar('Ahora súbele las fotos.'); editor(r.id); }
        else { p.actualizado = r.actualizado; }
      }).catch(function (e) {
        $('#estadoGuardado').textContent = '';
        avisar(e.message, true);
        b.disabled = false;
      });
    };
  }

  /* Biblioteca de fotos ya procesadas */
  function abrirBiblioteca(id, p, alTerminar) {
    api('GET', '/api/admin/biblioteca').then(function (d) {
      var m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = '<div class="modal__fondo"></div><div class="modal__caja" style="width:min(760px,100%)">' +
        '<h3>Fotos del proyecto</h3><p>Fotos que ya están procesadas en la tienda. Haz clic para añadirla a esta gorra.</p>' +
        '<div class="fotos" style="max-height:52vh;overflow:auto">' +
        d.fotos.map(function (f) {
          return '<div class="foto" data-src="' + esc(f.src) + '" style="cursor:pointer">' +
            '<img src="' + esc(f.sm) + '" alt="" loading="lazy">' +
            (f.enUso ? '<span class="foto__p">En uso</span>' : '') + '</div>';
        }).join('') +
        '</div><div class="modal__acc"><button class="btn" data-no>Cerrar</button></div></div>';
      $('#modales').appendChild(m);
      $('[data-no]', m).onclick = function () { m.remove(); };
      $('.modal__fondo', m).onclick = function () { m.remove(); };
      $$('.foto', m).forEach(function (el) {
        el.onclick = function () {
          api('POST', '/api/admin/productos/' + id + '/imagenes', { existente: el.dataset.src })
            .then(function (r) {
              if (r.actualizado) p.actualizado = r.actualizado;
              p.imagenes.push({ id: r.id, src: r.src, sm: r.src.replace('.webp', '-sm.webp') });
              alTerminar(); avisar('Foto añadida.'); m.remove();
            }).catch(function (e) { avisar(e.message, true); });
        };
      });
    }).catch(function (e) { avisar(e.message, true); });
  }

  /* ── Vista: categorías ──────────────────────────────────────────────────── */
  VISTAS.categorias = function () {
    $('#titulo').textContent = 'Categorías';
    return api('GET', '/api/admin/categorias').then(function (d) {
      estado.categorias = d.categorias;
      $('#vista').innerHTML =
        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Filtros de la tienda</h2>' +
        '<p>Son los botones que el cliente ve encima de la colección.</p></div>' +
        '<div class="tarjeta__cuerpo"><div class="lista" id="listaC">' +
        d.categorias.map(function (c) {
          return '<div class="item" data-id="' + c.id + '" style="grid-template-columns:1fr auto">' +
            '<div class="item__txt"><b>' + esc(c.nombre) + '</b><span>' + esc(c.slug) + ' · ' + c.usos + ' gorra(s)' +
            (c.activa ? '' : ' · oculta') + '</span></div>' +
            '<div class="item__acc">' +
            '<button class="btn btn--sm" data-act="editar">Renombrar</button>' +
            '<button class="btn btn--sm" data-act="activar">' + (c.activa ? 'Ocultar' : 'Mostrar') + '</button>' +
            '<button class="btn btn--sm btn--peligro" data-act="borrar">Eliminar</button></div></div>';
        }).join('') +
        '</div><div style="margin-top:14px;display:flex;gap:8px">' +
        '<input type="text" id="catNueva" placeholder="Nombre de la nueva categoría" style="max-width:280px">' +
        '<button class="btn btn--primario" id="btnCatNueva">Agregar</button></div>' +
        '</div></div>';

      $('#btnCatNueva').onclick = function () {
        var n = $('#catNueva').value.trim();
        if (!n) return avisar('Escribe un nombre.', true);
        api('POST', '/api/admin/categorias', { nombre: n, orden: d.categorias.length + 1 })
          .then(function () { avisar('Categoría creada.'); irA('categorias'); })
          .catch(function (e) { avisar(e.message, true); });
      };

      $$('#listaC .item').forEach(function (el) {
        var c = d.categorias.filter(function (x) { return String(x.id) === el.dataset.id; })[0];
        $$('[data-act]', el).forEach(function (b) {
          b.onclick = function () {
            if (b.dataset.act === 'editar') {
              var n = window.prompt('Nuevo nombre para la categoría:', c.nombre);
              if (n == null) return;
              return api('PUT', '/api/admin/categorias/' + c.id, { nombre: n, slug: c.slug, orden: c.orden, activa: c.activa })
                .then(function () { avisar('Categoría actualizada.'); irA('categorias'); })
                .catch(function (e) { avisar(e.message, true); });
            }
            if (b.dataset.act === 'activar') {
              return api('PUT', '/api/admin/categorias/' + c.id, { nombre: c.nombre, slug: c.slug, orden: c.orden, activa: !c.activa })
                .then(function () { irA('categorias'); })
                .catch(function (e) { avisar(e.message, true); });
            }
            confirmar('¿Eliminar «' + c.nombre + '»?', 'Solo se puede si ninguna gorra la usa.', 'Eliminar').then(function (si) {
              if (!si) return;
              api('DELETE', '/api/admin/categorias/' + c.id)
                .then(function () { avisar('Categoría eliminada.'); irA('categorias'); })
                .catch(function (e) { avisar(e.message, true); });
            });
          };
        });
      });
    });
  };

  /* ── Formularios de contenido ───────────────────────────────────────────── */
  function editorContenido(titulo, grupos) {
    $('#titulo').textContent = titulo;
    return api('GET', '/api/admin/contenido').then(function (d) {
      estado.contenido = d.contenido;
      var C = d.contenido;
      var valor = function (ruta) {
        return ruta.split('.').reduce(function (n, k) { return (n && n[k] !== undefined) ? n[k] : ''; }, C);
      };

      var html = grupos.map(function (g) {
        return '<div class="tarjeta"><div class="tarjeta__cab"><h2>' + esc(g.titulo) + '</h2>' +
          (g.nota ? '<p>' + esc(g.nota) + '</p>' : '') + '</div><div class="tarjeta__cuerpo">' +
          g.campos.map(function (c) {
            var v = valor(c.clave);
            if (c.tipo === 'switch') {
              return '<label class="interruptor" style="margin-bottom:11px"><input type="checkbox" data-clave="' + c.clave + '"' +
                (v ? ' checked' : '') + '><i></i><span>' + esc(c.etiqueta) + '</span></label>';
            }
            var entrada;
            if (c.tipo === 'area') entrada = '<textarea data-clave="' + c.clave + '">' + esc(v) + '</textarea>';
            else if (c.tipo === 'lista') entrada = '<textarea data-clave="' + c.clave + '" data-lista="1">' + esc(Array.isArray(v) ? v.join('\n') : '') + '</textarea>';
            else if (c.tipo === 'producto') {
              entrada = '<select data-clave="' + c.clave + '">' + d.productos.map(function (p) {
                return '<option value="' + esc(p.id) + '"' + (p.id === v ? ' selected' : '') + '>' + esc(p.nombre) + (p.publicado ? '' : ' (borrador)') + '</option>';
              }).join('') + '</select>';
            } else entrada = '<input type="text" data-clave="' + c.clave + '" value="' + esc(v) + '">';
            return '<div class="campo"><label>' + esc(c.etiqueta) + '</label>' + entrada +
              (c.pista ? '<span class="pista">' + esc(c.pista) + '</span>' : '') + '</div>';
          }).join('') + '</div></div>';
      }).join('');

      $('#vista').innerHTML = html +
        '<div class="guardando"><button class="btn btn--primario" id="btnGuardar" disabled>Guardar cambios</button>' +
        '<a class="btn" href="/vista-previa" target="_blank" rel="noopener">Vista previa</a>' +
        '<span class="estado" id="estadoGuardado"></span></div>';

      $$('#vista [data-clave]').forEach(function (el) {
        el.addEventListener('input', function () { ensuciar(); });
        el.addEventListener('change', function () { ensuciar(); });
      });

      $('#btnGuardar').onclick = function () {
        var b = this;
        b.disabled = true;
        $('#estadoGuardado').textContent = 'Guardando…';
        var cambios = {};
        $$('#vista [data-clave]').forEach(function (el) {
          var k = el.dataset.clave;
          if (el.type === 'checkbox') cambios[k] = el.checked;
          else if (el.dataset.lista) cambios[k] = el.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          else cambios[k] = el.value;
        });
        api('PUT', '/api/admin/contenido', { cambios: cambios }).then(function () {
          ensuciar(false);
          $('#estadoGuardado').textContent = 'Guardado ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
          avisar('Cambios guardados. Ya se ven en la tienda.');
        }).catch(function (e) {
          $('#estadoGuardado').textContent = '';
          avisar(e.message, true);
          b.disabled = false;
        });
      };
    });
  }

  VISTAS.home = function () {
    return editorContenido('Portada', [
      { titulo: 'Secciones visibles', nota: 'Apaga una sección y desaparece de la tienda sin borrar nada.', campos: [
        { clave: 'secciones.hero', etiqueta: 'Portada (hero)', tipo: 'switch' },
        { clave: 'secciones.coleccion', etiqueta: 'Colección', tipo: 'switch' },
        { clave: 'secciones.perks', etiqueta: 'Beneficios', tipo: 'switch' },
        { clave: 'secciones.editorial', etiqueta: 'Editorial', tipo: 'switch' },
        { clave: 'secciones.about', etiqueta: 'Sobre la marca', tipo: 'switch' },
        { clave: 'secciones.feed', etiqueta: 'Feed de fotos', tipo: 'switch' },
        { clave: 'secciones.final', etiqueta: 'Cierre', tipo: 'switch' },
      ] },
      { titulo: 'Titular', campos: [
        { clave: 'hero.eyebrow_pre', etiqueta: 'Línea de arriba', pista: 'Antes del número de referencias.' },
        { clave: 'hero.eyebrow_post', etiqueta: 'Línea de arriba (después del número)' },
        { clave: 'hero.titulo1', etiqueta: 'Titular · línea 1' },
        { clave: 'hero.titulo2', etiqueta: 'Titular · línea 2' },
        { clave: 'hero.titulo3', etiqueta: 'Titular · línea 3', pista: 'Puedes resaltar una palabra con <em>palabra</em>.' },
        { clave: 'hero.lead', etiqueta: 'Texto de apoyo', tipo: 'area' },
        { clave: 'hero.cta1', etiqueta: 'Botón principal' },
        { clave: 'hero.cta2', etiqueta: 'Botón de WhatsApp' },
      ] },
      { titulo: 'Gorra de la portada', campos: [
        { clave: 'hero.principal', etiqueta: 'Foto grande del hero', tipo: 'producto' },
        { clave: 'hero.destacadas', etiqueta: 'Miniaturas para cambiar la foto', tipo: 'lista', pista: 'Una dirección (slug) por línea. Ej: yankees-navy-hueso' },
      ] },
      { titulo: 'Cifras del hero', campos: [
        { clave: 'hero.stat1_etiqueta', etiqueta: 'Cifra 1 · etiqueta', pista: 'El número lo pone solo el sistema.' },
        { clave: 'hero.stat2_valor', etiqueta: 'Cifra 2 · valor' },
        { clave: 'hero.stat2_etiqueta', etiqueta: 'Cifra 2 · etiqueta' },
        { clave: 'hero.stat3_valor', etiqueta: 'Cifra 3 · valor' },
        { clave: 'hero.stat3_etiqueta', etiqueta: 'Cifra 3 · etiqueta' },
      ] },
      { titulo: 'Cinta en movimiento', campos: [
        { clave: 'ticker.palabras', etiqueta: 'Palabras', tipo: 'lista', pista: 'Una por línea.' },
      ] },
    ]);
  };

  VISTAS.textos = function () {
    return editorContenido('Textos', [
      { titulo: 'Colección', campos: [
        { clave: 'coleccion.titulo', etiqueta: 'Título' },
        { clave: 'coleccion.texto', etiqueta: 'Texto', tipo: 'area' },
        { clave: 'coleccion.buscador', etiqueta: 'Texto del buscador' },
        { clave: 'coleccion.vacio_titulo', etiqueta: 'Sin resultados · título' },
        { clave: 'coleccion.vacio_texto', etiqueta: 'Sin resultados · texto', tipo: 'area' },
        { clave: 'coleccion.vacio_cta', etiqueta: 'Sin resultados · botón' },
      ] },
      { titulo: 'Beneficios', campos: [
        { clave: 'perks.1_titulo', etiqueta: '1 · título' }, { clave: 'perks.1_texto', etiqueta: '1 · texto' },
        { clave: 'perks.2_titulo', etiqueta: '2 · título' }, { clave: 'perks.2_texto', etiqueta: '2 · texto' },
        { clave: 'perks.3_titulo', etiqueta: '3 · título' }, { clave: 'perks.3_texto', etiqueta: '3 · texto' },
        { clave: 'perks.4_titulo', etiqueta: '4 · título' }, { clave: 'perks.4_texto', etiqueta: '4 · texto' },
      ] },
      { titulo: 'Editorial', campos: [
        { clave: 'editorial.eyebrow', etiqueta: 'Antetítulo' },
        { clave: 'editorial.titulo', etiqueta: 'Título', pista: 'Admite <em>énfasis</em> y <br> para partir la línea.' },
        { clave: 'editorial.texto', etiqueta: 'Texto', tipo: 'area' },
        { clave: 'editorial.cta', etiqueta: 'Botón', pista: 'El número de gorras se agrega solo.' },
        { clave: 'editorial.imagen', etiqueta: 'Imagen', pista: 'Ruta dentro de assets/img o URL completa.' },
        { clave: 'editorial.img_alt', etiqueta: 'Texto alternativo de la imagen' },
      ] },
      { titulo: 'Sobre la marca', campos: [
        { clave: 'about.eyebrow', etiqueta: 'Antetítulo' },
        { clave: 'about.p1', etiqueta: 'Párrafo 1', tipo: 'area' },
        { clave: 'about.p2', etiqueta: 'Párrafo 2', tipo: 'area' },
        { clave: 'about.cita', etiqueta: 'Frase' },
        { clave: 'about.cita_autor', etiqueta: 'Autor de la frase' },
      ] },
      { titulo: 'Feed', campos: [
        { clave: 'feed.titulo', etiqueta: 'Título' },
        { clave: 'feed.texto', etiqueta: 'Texto', tipo: 'area' },
      ] },
      { titulo: 'Cierre', campos: [
        { clave: 'final.titulo', etiqueta: 'Título', pista: 'Admite <em> y <br>.' },
        { clave: 'final.texto', etiqueta: 'Texto', tipo: 'area' },
      ] },
      { titulo: 'Ficha de producto', campos: [
        { clave: 'envios.texto_ficha', etiqueta: 'Etiqueta de "Incluye"' },
        { clave: 'ficha.incluye', etiqueta: 'Qué incluye' },
        { clave: 'envios.texto_corto', etiqueta: 'Etiqueta de envío' },
        { clave: 'ficha.envio', etiqueta: 'Texto de envío' },
        { clave: 'ficha.disponibilidad', etiqueta: 'Texto de disponibilidad' },
        { clave: 'ficha.nota_precio', etiqueta: 'Nota bajo el botón' },
      ] },
      { titulo: 'Pie de página', campos: [
        { clave: 'footer.nota', etiqueta: 'Nota principal', tipo: 'area' },
        { clave: 'footer.col2', etiqueta: 'Columna 2 · título' },
        { clave: 'footer.col3', etiqueta: 'Columna 3 · título' },
        { clave: 'footer.col3_wa', etiqueta: 'Columna 3 · WhatsApp' },
        { clave: 'footer.col3_envio', etiqueta: 'Columna 3 · envíos' },
        { clave: 'footer.col4', etiqueta: 'Columna 4 · título' },
        { clave: 'footer.copyright', etiqueta: 'Copyright' },
        { clave: 'footer.lema', etiqueta: 'Lema' },
      ] },
    ]);
  };

  VISTAS.marca = function () {
    return editorContenido('Marca y contacto', [
      { titulo: 'Marca', campos: [
        { clave: 'marca.nombre', etiqueta: 'Nombre' },
        { clave: 'nav.menu_ciudad', etiqueta: 'Ciudad (menú móvil)' },
        { clave: 'nav.cta', etiqueta: 'Botón del menú' },
      ] },
      { titulo: 'WhatsApp', nota: 'De aquí salen TODOS los botones de WhatsApp de la tienda.', campos: [
        { clave: 'contacto.whatsapp', etiqueta: 'Número (solo dígitos, con indicativo)', pista: 'Ej: 573207224241' },
        { clave: 'contacto.whatsapp_visible', etiqueta: 'Número como se muestra' },
        { clave: 'contacto.mensaje_general', etiqueta: 'Mensaje general', tipo: 'area' },
        { clave: 'contacto.mensaje_producto', etiqueta: 'Mensaje al pedir una gorra', tipo: 'area',
          pista: 'Usa {producto}, {equipo} y {precio}: se reemplazan solos.' },
        { clave: 'contacto.mensaje_busqueda', etiqueta: 'Mensaje cuando no encuentra nada', tipo: 'area' },
        { clave: 'contacto.mensaje_cierre', etiqueta: 'Mensaje del cierre', tipo: 'area' },
      ] },
      { titulo: 'Redes', campos: [
        { clave: 'redes.instagram_visible', etiqueta: 'Mostrar Instagram', tipo: 'switch' },
        { clave: 'redes.instagram_url', etiqueta: 'Instagram · enlace' },
        { clave: 'redes.instagram_etiqueta', etiqueta: 'Instagram · texto' },
        { clave: 'redes.tiktok_visible', etiqueta: 'Mostrar TikTok', tipo: 'switch' },
        { clave: 'redes.tiktok_url', etiqueta: 'TikTok · enlace' },
        { clave: 'redes.tiktok_etiqueta', etiqueta: 'TikTok · texto' },
        { clave: 'redes.facebook_visible', etiqueta: 'Mostrar Facebook', tipo: 'switch' },
        { clave: 'redes.facebook_url', etiqueta: 'Facebook · enlace' },
        { clave: 'redes.facebook_etiqueta', etiqueta: 'Facebook · texto' },
      ] },
      { titulo: 'Navegación', campos: [
        { clave: 'nav.coleccion', etiqueta: 'Menú · colección' },
        { clave: 'nav.marca', etiqueta: 'Menú · marca' },
        { clave: 'nav.feed', etiqueta: 'Menú · feed' },
        { clave: 'nav.contacto', etiqueta: 'Menú móvil · contacto' },
      ] },
    ]);
  };

  VISTAS.seo = function () {
    return editorContenido('SEO', [
      { titulo: 'Buscadores', nota: 'Lo que Google muestra en los resultados.', campos: [
        { clave: 'seo.titulo', etiqueta: 'Título de la página', pista: 'Lo ideal: menos de 60 caracteres.' },
        { clave: 'seo.descripcion', etiqueta: 'Descripción', tipo: 'area', pista: 'Entre 120 y 160 caracteres.' },
        { clave: 'seo.canonical', etiqueta: 'Dirección oficial del sitio' },
      ] },
      { titulo: 'Al compartir en redes', campos: [
        { clave: 'seo.og_url', etiqueta: 'Dirección' },
        { clave: 'seo.og_descripcion', etiqueta: 'Descripción', tipo: 'area' },
        { clave: 'seo.og_imagen', etiqueta: 'Imagen (URL completa)' },
        { clave: 'seo.og_imagen_alt', etiqueta: 'Texto alternativo de la imagen' },
      ] },
    ]);
  };

  /* ── Vista: cuenta ──────────────────────────────────────────────────────── */
  VISTAS.cuenta = function () {
    $('#titulo').textContent = 'Cuenta';
    return Promise.all([api('GET', '/api/estado'), api('GET', '/api/admin/auditoria?n=40')]).then(function (r) {
      var e = r[0], a = r[1];
      /* Si entró por enlace y todavía no hay contraseña, no se le pide una
         anterior que no existe: es la primera. */
      var primera = estado.faltaClave;
      $('#vista').innerHTML =
        '<div class="tarjeta"><div class="tarjeta__cab">' +
        '<h2>' + (primera ? 'Ponerle contraseña a la cuenta' : 'Cambiar contraseña') + '</h2>' +
        '<p>' + (primera
          ? 'Ahora entras con tu enlace privado. Si le pones contraseña, podrás entrar también con correo y contraseña.'
          : 'Al cambiarla se cierran las demás sesiones.') + '</p></div><div class="tarjeta__cuerpo">' +
        '<div class="aviso" id="errClave" hidden></div>' +
        (primera ? '' :
          '<div class="campo"><label for="cActual">Contraseña actual</label><input type="password" id="cActual" autocomplete="current-password"></div>') +
        '<div class="campo"><label for="cNueva">' + (primera ? 'Contraseña' : 'Contraseña nueva') + '</label>' +
        '<input type="password" id="cNueva" autocomplete="new-password">' +
        '<span class="pista">Mínimo 10 caracteres, con letras y números.</span></div>' +
        '<button class="btn btn--primario" id="btnClave">' +
        (primera ? 'Guardar contraseña' : 'Cambiar contraseña') + '</button></div></div>' +

        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Estado del sistema</h2></div><div class="tarjeta__cuerpo">' +
        '<div class="cifras">' +
        '<div class="cifra"><b>' + (e.ok ? 'OK' : 'Error') + '</b><span>Base de datos (' + esc(e.base) + ')</span></div>' +
        '<div class="cifra"><b>' + e.productos + '</b><span>Gorras publicadas</span></div>' +
        '<div class="cifra"><b>' + esc(e.almacenamiento) + '</b><span>Fotos nuevas</span></div>' +
        '<div class="cifra"><b>' + esc(e.entorno) + '</b><span>Entorno</span></div>' +
        '</div></div></div>' +

        '<div class="tarjeta"><div class="tarjeta__cab"><h2>Historial</h2></div><div class="tarjeta__cuerpo"><div class="movs">' +
        a.movimientos.map(function (m) {
          return '<div class="mov"><span>' + esc(describir(m)) + '</span><time>' + hace(m.cuando) + '</time></div>';
        }).join('') + '</div></div></div>';

      $('#btnClave').onclick = function () {
        var b = this; b.disabled = true;
        var err = $('#errClave'); err.hidden = true;
        var actual = $('#cActual') ? $('#cActual').value : '';
        api('POST', '/api/admin/clave', { actual: actual, nueva: $('#cNueva').value })
          .then(function () {
            avisar(primera ? 'Listo, ya tiene contraseña.' : 'Contraseña cambiada.');
            if ($('#cActual')) $('#cActual').value = '';
            $('#cNueva').value = '';
            if (primera) {
              estado.faltaClave = false;
              $('#sinClave').hidden = true;
              irA('cuenta');
            }
          })
          .catch(function (e2) { err.textContent = e2.message; err.hidden = false; })
          .then(function () { b.disabled = false; });
      };
    });
  };

  /* ── Arranque ───────────────────────────────────────────────────────────── */
  function arrancar(d) {
    estado.usuario = (d && d.usuario) || null;
    estado.faltaClave = !!(d && d.faltaClave);
    $('#acceso').hidden = true;
    $('#app').hidden = false;
    $('#quien').textContent = estado.usuario ? estado.usuario.correo : '';
    $('#sinClave').hidden = !estado.faltaClave;
    irA('panel');
  }

  $('#irACuenta').addEventListener('click', function () { irA('cuenta'); });

  api('GET', '/api/auth/yo').then(function (d) {
    if (d.usuario) return arrancar(d);
    mostrarAcceso(d.instalado);
    /* Volvió de /admin?entrar=… con un código que no era */
    if (/[?&]error=enlace/.test(location.search)) {
      var err = $('#errEntrar');
      if (err && !$('#formEntrar').hidden) {
        err.textContent = 'Ese enlace de acceso no es válido. Pide uno nuevo.';
        err.hidden = false;
      } else {
        avisar('Ese enlace de acceso no es válido.', true);
      }
    }
  }).catch(function () {
    document.body.innerHTML = '<div class="acceso"><div class="acceso__caja">' +
      '<h1>El panel no está disponible</h1>' +
      '<p class="sub">No pude hablar con el servidor. Revisa /api/estado e inténtalo de nuevo.</p></div></div>';
  });
})();
