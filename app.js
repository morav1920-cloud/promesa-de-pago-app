/* ============================================================
   app.js — Lógica de interfaz: navegación, formulario, listas,
   pestañas del gestor, edición, foto comprimida, contacto
   rápido, alta de usuarios, resumen WhatsApp, panel del
   supervisor, toasts, estado de conexión y envío simulado.

   Lenguaje de UI: español de México, palabras del gestor.
   Prohibido mostrar: "sincronizar", "cache", "API".
   ============================================================ */

(() => {
  "use strict";

  // ---------- Estado de sesión y de interfaz ----------
  let rolActual = null;            // "gestor" | "supervisor"
  let gestorActual = null;         // objeto usuario cuando rol = "gestor"
  let usuarios = [];               // catálogo completo (gestores + supervisores)
  let tabActiva = "cobrar";        // "cobrar" | "hoy"
  let editandoId = null;           // id de la promesa en edición, o null
  let fotoTemporal = null;         // dataURL comprimida lista para guardar
  let promesaModalActual = null;   // promesa abierta en el modal
  let filtroGestorId = "";         // filtro por gestor en el panel del supervisor

  // Datos de ejemplo: apagados por defecto; el switch del login los enciende.
  // Se recuerda la elección para no tener que activarlo en cada recarga.
  let mostrarSeed = localStorage.getItem("ppd_mostrar_seed") === "1";

  /** Filtra las promesas visibles según el switch de datos de ejemplo. */
  function filtrarVisibles(todas) {
    return todas.filter((p) => mostrarSeed || !p.es_seed);
  }

  const $ = (selector) => document.querySelector(selector);

  const vistas = {
    login: $("#view-login"),
    gestor: $("#view-gestor"),
    supervisor: $("#view-supervisor"),
  };

  // ============================================================
  // Utilidades de formato
  // ============================================================

  const formatoMoneda = new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2,
  });

  function dinero(monto) { return formatoMoneda.format(monto || 0); }

  function fechaBonita(iso) {
    if (!iso) return "—";
    const f = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
    return f.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  }

  function fechaCompletaHoy() {
    return new Date().toLocaleDateString("es-MX", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }

  function esHoy(isoFechaCaptura) {
    const f = new Date(isoFechaCaptura);
    const hoy = new Date();
    return f.getFullYear() === hoy.getFullYear()
        && f.getMonth() === hoy.getMonth()
        && f.getDate() === hoy.getDate();
  }

  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  /** Días de atraso: solo si la fecha compromiso ya pasó y no está cumplida. */
  function diasDeAtraso(p) {
    if (p.estado === "cumplida") return 0;
    const compromiso = new Date(p.fecha_pago + "T23:59:59");
    const ahora = new Date();
    if (compromiso >= ahora) return 0;
    return Math.floor((ahora - compromiso) / 86400000) + 1;
  }

  function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  const estadoTexto = { capturada: "Capturada", cumplida: "Cumplida", incumplida: "Incumplida" };

  // ============================================================
  // Toasts (feedback visible de cada acción)
  // ============================================================

  function toast(mensaje, tipo = "exito") {
    const zona = $("#toast-zone");
    const el = document.createElement("div");
    el.className = `toast toast-${tipo}`;
    el.textContent = mensaje;
    zona.appendChild(el);
    setTimeout(() => {
      el.classList.add("saliendo");
      setTimeout(() => el.remove(), 200);
    }, 3200);
  }

  // ============================================================
  // Estado de conexión + envío simulado
  // ============================================================

  function actualizarBadgeConexion() {
    const badge = $("#badge-conexion");
    if (navigator.onLine) {
      badge.textContent = "Con señal";
      badge.className = "badge badge-online";
    } else {
      badge.textContent = "Sin señal — trabajando sin conexión";
      badge.className = "badge badge-offline";
    }
  }

  /** Si hay señal y hay promesas pendientes, las "envía" tras 2 segundos. */
  async function intentarEnvio() {
    if (!navigator.onLine) return;
    const promesas = await DB.obtenerPromesas();
    const pendientes = promesas.filter((p) => p.sync_pending).length;
    if (pendientes === 0) return;

    setTimeout(async () => {
      if (!navigator.onLine) return;
      const enviadas = await DB.marcarPendientesComoEnviadas();
      if (enviadas > 0) {
        toast("Promesas enviadas al recuperar señal.", "info");
        refrescarVistaActual();
      }
    }, 2000);
  }

  window.addEventListener("online", () => { actualizarBadgeConexion(); intentarEnvio(); });
  window.addEventListener("offline", actualizarBadgeConexion);

  // ============================================================
  // Navegación entre vistas
  // ============================================================

  function mostrarVista(nombre) {
    Object.values(vistas).forEach((v) => (v.hidden = true));
    vistas[nombre].hidden = false;
    $("#btn-cambiar-rol").hidden = nombre === "login";
    window.scrollTo({ top: 0 });
  }

  function refrescarVistaActual() {
    if (rolActual === "gestor" && gestorActual) renderVistaGestor();
    else if (rolActual === "supervisor") renderVistaSupervisor();
  }

  function cerrarSesion() {
    rolActual = null;
    gestorActual = null;
    salirModoEdicion();
    localStorage.removeItem("ppd_sesion");
    $("#selector-gestor").hidden = true;
    mostrarVista("login");
  }

  // ============================================================
  // LOGIN (con alta de usuarios)
  // ============================================================

  function gestoresActivos() {
    return usuarios.filter((u) => (u.rol || "gestor") === "gestor");
  }

  function supervisoresActivos() {
    return usuarios.filter((u) => u.rol === "supervisor");
  }

  function initLogin() {
    // Switch de datos de ejemplo para demostración
    const toggleSeed = $("#toggle-seed");
    toggleSeed.checked = mostrarSeed;
    toggleSeed.addEventListener("change", () => {
      mostrarSeed = toggleSeed.checked;
      localStorage.setItem("ppd_mostrar_seed", mostrarSeed ? "1" : "0");
      refrescarVistaActual();
      toast(mostrarSeed ? "Datos de ejemplo visibles." : "Datos de ejemplo ocultos.", "info");
    });

    $("#btn-rol-gestor").addEventListener("click", () => {
      const selector = $("#selector-gestor");
      selector.hidden = !selector.hidden;
      if (!selector.hidden) renderBotonesUsuarios();
    });

    $("#btn-rol-supervisor").addEventListener("click", () => {
      const supers = supervisoresActivos();
      if (supers.length === 0) {
        entrarComoSupervisor(); // entrada directa (comportamiento original)
      } else {
        // Si hay supervisores dados de alta, se elige quién entra
        const selector = $("#selector-gestor");
        selector.hidden = false;
        renderBotonesUsuarios(true);
      }
    });

    $("#btn-reseed").addEventListener("click", async () => {
      await restablecerDemo();
      usuarios = await DB.obtenerGestores();
      cerrarSesion();
      toast("Datos de demo restablecidos.", "info");
    });

    $("#btn-nuevo-usuario").addEventListener("click", abrirModalUsuario);
    $("#btn-cambiar-rol").addEventListener("click", cerrarSesion);
  }

  function renderBotonesUsuarios(mostrarSupervisores = false) {
    const cont = $("#lista-gestores-login");
    const titulo = $("#selector-gestor h2");
    const lista = mostrarSupervisores ? supervisoresActivos() : gestoresActivos();
    titulo.textContent = mostrarSupervisores ? "¿Quién entra como supervisor?" : "¿Quién eres?";

    cont.innerHTML = "";
    lista.forEach((u) => {
      // Fila: botón de entrar + botón de eliminar (gestión de plantilla)
      const fila = document.createElement("div");
      fila.className = "gestor-row";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gestor-btn";
      btn.innerHTML = `<span class="gestor-btn-nombre">${escapar(u.nombre)}</span>
                       <span class="gestor-btn-zona">${escapar(u.zona || "Supervisión general")}</span>`;
      btn.addEventListener("click", () =>
        mostrarSupervisores ? entrarComoSupervisor(u) : entrarComoGestor(u)
      );

      const btnBorrar = document.createElement("button");
      btnBorrar.type = "button";
      btnBorrar.className = "btn-borrar-usuario";
      btnBorrar.setAttribute("aria-label", `Eliminar a ${u.nombre}`);
      btnBorrar.title = `Eliminar a ${u.nombre}`;
      btnBorrar.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      btnBorrar.addEventListener("click", async (e) => {
        e.stopPropagation(); // que el clic en la basura no inicie sesión
        if (!confirm("¿Eliminar a este usuario? Sus promesas capturadas se mantendrán en el sistema.")) return;
        await DB.eliminarGestor(u.id);
        usuarios = await DB.obtenerGestores();
        renderBotonesUsuarios(mostrarSupervisores);
        toast(`${u.nombre} eliminado de la plantilla.`, "info");
      });

      fila.appendChild(btn);
      fila.appendChild(btnBorrar);
      cont.appendChild(fila);
    });
  }

  function entrarComoGestor(usuario) {
    rolActual = "gestor";
    gestorActual = usuario;
    tabActiva = "cobrar";
    localStorage.setItem("ppd_sesion", JSON.stringify({ rol: "gestor", gestor_id: usuario.id }));
    renderVistaGestor();
    mostrarVista("gestor");
  }

  function entrarComoSupervisor() {
    rolActual = "supervisor";
    gestorActual = null;
    localStorage.setItem("ppd_sesion", JSON.stringify({ rol: "supervisor" }));
    renderVistaSupervisor();
    mostrarVista("supervisor");
  }

  /** Restaura la sesión previa si existe (sobrevive a recarga de página). */
  async function restaurarSesion() {
    try {
      const cruda = localStorage.getItem("ppd_sesion");
      if (!cruda) return;
      const sesion = JSON.parse(cruda);
      if (sesion.rol === "supervisor") {
        entrarComoSupervisor();
      } else if (sesion.rol === "gestor") {
        const usuario = usuarios.find((u) => u.id === sesion.gestor_id);
        if (usuario) entrarComoGestor(usuario);
      }
    } catch { /* sesión inválida: se queda en login */ }
  }

  // ---------- Alta de nuevo usuario ----------

  function abrirModalUsuario() {
    $("#form-usuario").reset();
    $("#u-error").hidden = true;
    $("#u-zona-wrap").hidden = false;
    $("#modal-usuario").hidden = false;
    $("#u-nombre").focus();
  }

  function cerrarModalUsuario() { $("#modal-usuario").hidden = true; }

  function initModalUsuario() {
    $("#modal-usuario-cerrar").addEventListener("click", cerrarModalUsuario);
    $("#modal-usuario").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) cerrarModalUsuario();
    });

    // La zona solo aplica a gestores; supervisor no necesita
    $("#u-rol").addEventListener("change", (e) => {
      $("#u-zona-wrap").hidden = e.target.value === "supervisor";
    });

    $("#form-usuario").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = $("#u-nombre").value.trim();
      const rol = $("#u-rol").value;
      const zona = $("#u-zona").value.trim();

      if (!nombre) {
        $("#u-error").textContent = "Falta el nombre del usuario.";
        $("#u-error").hidden = false;
        return;
      }
      if (rol === "gestor" && !zona) {
        $("#u-error").textContent = "Falta la zona del gestor.";
        $("#u-error").hidden = false;
        return;
      }

      const nuevo = {
        id: "u-" + Date.now(),
        nombre,
        rol,
        zona: rol === "gestor" ? zona : "Supervisión general",
        gestiones_con_acuerdo: 0,
      };

      await DB.guardarGestores([nuevo]);
      usuarios = await DB.obtenerGestores();
      cerrarModalUsuario();
      toast(`${nombre} quedó dado de alta.`);
    });
  }

  // ============================================================
  // VISTA GESTOR
  // ============================================================

  async function renderVistaGestor() {
    $("#gestor-nombre").textContent = gestorActual.nombre;
    $("#gestor-zona").textContent = "Zona: " + (gestorActual.zona || "—");

    const todas = filtrarVisibles(await DB.obtenerPromesas());
    const mias = todas.filter((p) => p.gestor_id === gestorActual.id);

    const porCobrar = mias
      .filter((p) => p.estado === "capturada" && p.fecha_pago <= hoyISO())
      .sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago));

    const capturadasHoy = mias
      .filter((p) => esHoy(p.fecha_captura))
      .sort((a, b) => b.fecha_captura.localeCompare(a.fecha_captura));

    // Banner proactivo: vencidas (atrasadas) y las que vencen hoy
    const atrasadas = mias.filter((p) => p.estado === "capturada" && p.fecha_pago < hoyISO()).length;
    const vencenHoy = mias.filter((p) => p.estado === "capturada" && p.fecha_pago === hoyISO()).length;
    const banner = $("#alerta-vencimientos");
    if (atrasadas > 0 || vencenHoy > 0) {
      const partes = [];
      if (atrasadas > 0) partes.push(`${atrasadas} vencida${atrasadas > 1 ? "s" : ""}`);
      if (vencenHoy > 0) partes.push(`${vencenHoy} que vence${vencenHoy > 1 ? "n" : ""} hoy`);
      $("#alerta-vencimientos-texto").textContent = `⚠️ Tienes ${partes.join(" y ")}. Toca aquí para verlas.`;
      banner.classList.toggle("alerta-roja", atrasadas > 0);
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    // Chips de resumen del día
    $("#chip-cobrar-num").textContent = porCobrar.length;
    $("#chip-cobrar-monto").textContent = dinero(porCobrar.reduce((s, p) => s + p.monto_prometido, 0));
    $("#chip-capturadas-num").textContent = capturadasHoy.length;

    // Contadores de pestañas
    $("#count-cobrar").textContent = porCobrar.length;
    $("#count-hoy").textContent = capturadasHoy.length;

    // Badge de pendientes de envío (de este gestor)
    const pendientes = mias.filter((p) => p.sync_pending).length;
    const badge = $("#badge-pendientes-gestor");
    badge.hidden = pendientes === 0;
    badge.textContent = `${pendientes} por enviar`;

    // Lista según pestaña activa
    const lista = tabActiva === "cobrar" ? porCobrar : capturadasHoy;
    const vacia = $("#lista-vacia");
    vacia.hidden = lista.length > 0;
    vacia.textContent = tabActiva === "cobrar"
      ? "Nada por cobrar hoy. Buen día para adelantar gestiones."
      : "Aún no capturas promesas hoy. ¡Vamos por la primera!";

    const cont = $("#lista-promesas");
    cont.innerHTML = "";
    lista.forEach((p) => cont.appendChild(tarjetaPromesa(p, tabActiva === "cobrar")));
  }

  function initTabs() {
    $("#tab-cobrar").addEventListener("click", () => cambiarTab("cobrar"));
    $("#tab-hoy").addEventListener("click", () => cambiarTab("hoy"));

    // El banner de vencimientos lleva directo a la pestaña de cobro
    const irAPorCobrar = () => cambiarTab("cobrar");
    $("#alerta-vencimientos").addEventListener("click", irAPorCobrar);
    $("#alerta-vencimientos").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); irAPorCobrar(); }
    });
  }

  function cambiarTab(nueva) {
    tabActiva = nueva;
    $("#tab-cobrar").classList.toggle("activo", nueva === "cobrar");
    $("#tab-cobrar").setAttribute("aria-selected", nueva === "cobrar");
    $("#tab-hoy").classList.toggle("activo", nueva === "hoy");
    $("#tab-hoy").setAttribute("aria-selected", nueva === "hoy");
    renderVistaGestor();
  }

  function tarjetaPromesa(p, conSemaforo = false) {
    const card = document.createElement("article");
    card.className = `promesa-card estado-borde-${p.estado}`;

    const atraso = diasDeAtraso(p);
    let semaforo = "";
    if (conSemaforo && p.estado === "capturada") {
      semaforo = atraso > 0
        ? `<span class="badge badge-estado badge-atrasada">Atrasada ${atraso} día${atraso > 1 ? "s" : ""}</span>`
        : `<span class="badge badge-estado badge-vence-hoy">Vence hoy</span>`;
    }

    card.innerHTML = `
      <div class="promesa-fila-top">
        <span class="promesa-nombre">${escapar(p.nombre_deudor)}</span>
        <span class="promesa-monto">${dinero(p.monto_prometido)}</span>
      </div>
      <div class="promesa-detalles">
        <span>Paga: ${fechaBonita(p.fecha_pago)}</span>
        <span>${escapar(p.canal_contacto)}</span>
      </div>
      <div class="promesa-badges">
        <span class="badge badge-estado estado-${p.estado}">${estadoTexto[p.estado]}</span>
        ${semaforo}
        ${p.sync_pending
          ? '<span class="badge badge-sync sync-pendiente">pendiente de enviar</span>'
          : '<span class="badge badge-sync sync-enviada">enviada</span>'}
      </div>
      <div class="promesa-contacto"></div>
      <div class="promesa-acciones"></div>
    `;

    // --- Contacto rápido: WhatsApp y llamada (si hay teléfono) ---
    const contacto = card.querySelector(".promesa-contacto");
    if (p.telefono) {
      const tel = p.telefono.replace(/\D/g, "");

      const btnWsp = document.createElement("a");
      btnWsp.className = "btn btn-wsp btn-sm";
      btnWsp.href = `https://wa.me/52${tel}?text=${encodeURIComponent(
        `Hola ${p.nombre_deudor}, le escribo de su crédito. Le recordamos su compromiso de pago de ${dinero(p.monto_prometido)} para el ${fechaBonita(p.fecha_pago)}. ¿Le parece si lo dejamos listo hoy?`
      )}`;
      btnWsp.target = "_blank";
      btnWsp.rel = "noopener";
      btnWsp.textContent = "WhatsApp";
      contacto.appendChild(btnWsp);

      const btnTel = document.createElement("a");
      btnTel.className = "btn btn-tel btn-sm";
      btnTel.href = `tel:+52${tel}`;
      btnTel.textContent = "Llamar";
      contacto.appendChild(btnTel);
    } else {
      contacto.remove();
    }

    // --- Acciones de estado y detalle ---
    const acciones = card.querySelector(".promesa-acciones");

    if (p.estado !== "cumplida") {
      const btnOk = document.createElement("button");
      btnOk.type = "button";
      btnOk.className = "btn btn-success btn-sm";
      btnOk.textContent = "Marcar cumplida";
      btnOk.addEventListener("click", () => cambiarEstado(p, "cumplida"));
      acciones.appendChild(btnOk);
    }

    if (p.estado !== "incumplida") {
      const btnNo = document.createElement("button");
      btnNo.type = "button";
      btnNo.className = "btn btn-danger-outline btn-sm";
      btnNo.textContent = "Marcar incumplida";
      btnNo.addEventListener("click", () => cambiarEstado(p, "incumplida"));
      acciones.appendChild(btnNo);
    }

    if (p.estado === "capturada") {
      const btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn btn-ghost btn-sm";
      btnEditar.textContent = "Editar";
      btnEditar.style.border = "1.5px solid var(--gris-300)";
      btnEditar.style.color = "var(--azul-900)";
      btnEditar.addEventListener("click", () => entrarModoEdicion(p));
      acciones.appendChild(btnEditar);
    }

    const btnDetalle = document.createElement("button");
    btnDetalle.type = "button";
    btnDetalle.className = "btn btn-ghost btn-sm";
    btnDetalle.textContent = "Ver detalle";
    btnDetalle.style.border = "1.5px solid var(--gris-300)";
    btnDetalle.style.color = "var(--azul-900)";
    btnDetalle.addEventListener("click", () => abrirModal(p));
    acciones.appendChild(btnDetalle);

    return card;
  }

  async function cambiarEstado(promesa, nuevoEstado) {
    promesa.estado = nuevoEstado;
    if (nuevoEstado === "cumplida") promesa.monto_cobrado = promesa.monto_prometido;
    else if (nuevoEstado === "incumplida") promesa.monto_cobrado = 0;
    await DB.actualizarPromesa(promesa);

    if (nuevoEstado === "cumplida") toast("¡Bien! Promesa marcada como cumplida.");
    else toast("Promesa marcada como incumplida.", "aviso");

    cerrarModal();
    refrescarVistaActual();
  }

  // ---------- Edición de promesa (flujo de corrección) ----------

  function entrarModoEdicion(p) {
    editandoId = p.id;
    cerrarModal();

    // Cargar los datos actuales en el formulario
    $("#f-nombre").value = p.nombre_deudor;
    $("#f-monto").value = p.monto_prometido;
    $("#f-fecha").value = p.fecha_pago;
    $("#f-canal").value = p.canal_contacto;
    $("#f-notas").value = p.notas || "";
    $("#f-telefono").value = p.telefono || "";

    // Foto existente (si tiene)
    fotoTemporal = p.foto || null;
    actualizarPreviewFoto();

    // Abrir la sección opcional si trae datos extra
    if (p.notas || p.telefono || p.foto) $("#detalles-opcionales").open = true;

    $("#btn-guardar").textContent = "Guardar Cambios";
    $("#aviso-edicion").hidden = false;
    // Barra fija con Guardar/Cancelar siempre al alcance del pulgar
    $("#barra-edicion-fija").hidden = false;
    document.body.classList.add("con-barra-edicion");
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("#f-nombre").focus();
  }

  function salirModoEdicion() {
    if (!editandoId) return;
    editandoId = null;
    $("#form-promesa").reset();
    fotoTemporal = null;
    actualizarPreviewFoto();
    $("#btn-guardar").textContent = "Guardar Promesa";
    $("#aviso-edicion").hidden = true;
    $("#barra-edicion-fija").hidden = true;
    document.body.classList.remove("con-barra-edicion");
    $("#form-error").hidden = true;
  }

  // ---------- Formulario de captura ----------

  function initFormulario() {
    $("#f-fecha").min = hoyISO();
    $("#btn-cancelar-edicion").addEventListener("click", salirModoEdicion);
    $("#btn-barra-cancelar").addEventListener("click", salirModoEdicion);

    // Foto: compresión en el cliente vía Canvas antes de guardar
    $("#f-foto").addEventListener("change", async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      try {
        fotoTemporal = await comprimirImagen(archivo);
        actualizarPreviewFoto();
        toast("Foto lista, se guardará con la promesa.", "info");
      } catch {
        toast("No se pudo leer la foto, intenta con otra.", "aviso");
      }
    });

    $("#btn-quitar-foto").addEventListener("click", () => {
      fotoTemporal = null;
      $("#f-foto").value = "";
      actualizarPreviewFoto();
    });

    // Teléfono: solo dígitos
    $("#f-telefono").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
    });

    $("#form-promesa").addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const error = $("#form-error");
      error.hidden = true;

      const nombre = $("#f-nombre").value.trim();
      const monto = parseFloat($("#f-monto").value);
      const fecha = $("#f-fecha").value;
      const canal = $("#f-canal").value;
      const notas = $("#f-notas").value.trim();
      const telefono = $("#f-telefono").value.trim();

      // Validaciones con mensajes en lenguaje claro
      if (!nombre) return mostrarErrorForm("Falta el nombre del cliente.");
      if (!monto || monto <= 0) return mostrarErrorForm("El monto debe ser mayor a cero.");
      if (!fecha) return mostrarErrorForm("Falta la fecha en que va a pagar.");
      if (!canal) return mostrarErrorForm("Elige cómo quedaron (WhatsApp, llamada, etc.).");
      if (telefono && telefono.length !== 10) {
        return mostrarErrorForm("El teléfono debe tener 10 dígitos (o déjalo vacío).");
      }

      if (editandoId) {
        // --- Guardar cambios de una promesa capturada ---
        const promesas = await DB.obtenerPromesas();
        const original = promesas.find((p) => p.id === editandoId);
        if (original) {
          original.nombre_deudor = nombre;
          original.monto_prometido = Math.round(monto * 100) / 100;
          original.fecha_pago = fecha;
          original.canal_contacto = canal;
          original.notas = notas;
          original.telefono = telefono;
          original.foto = fotoTemporal;
          await DB.actualizarPromesa(original);
        }
        salirModoEdicion();
        toast("Cambios guardados.");
      } else {
        // --- Captura nueva ---
        const promesa = {
          id: "p-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          gestor_id: gestorActual.id,
          nombre_deudor: nombre,
          telefono,
          monto_prometido: Math.round(monto * 100) / 100,
          fecha_pago: fecha,
          canal_contacto: canal,
          notas,
          foto: fotoTemporal,
          estado: "capturada",
          monto_cobrado: 0,
          fecha_captura: new Date().toISOString(),
          sync_pending: true,
          es_seed: false,
        };
        await DB.agregarPromesa(promesa);
        toast("Promesa guardada. Se enviará al recuperar señal.");
      }

      evento.target.reset();
      fotoTemporal = null;
      actualizarPreviewFoto();
      $("#f-fecha").min = hoyISO();
      $("#detalles-opcionales").open = false;
      $("#f-nombre").focus();

      renderVistaGestor();
      intentarEnvio();
    });
  }

  function actualizarPreviewFoto() {
    const wrap = $("#foto-preview-wrap");
    if (fotoTemporal) {
      $("#foto-preview").src = fotoTemporal;
      wrap.hidden = false;
    } else {
      $("#foto-preview").removeAttribute("src");
      wrap.hidden = true;
    }
  }

  /**
   * Comprime una foto en el navegador vía Canvas:
   * máximo 900px de ancho, JPEG al 60% — una imagen de ~3MB
   * baja a ~80-150KB, ideal para guardado local.
   */
  async function comprimirImagen(archivo) {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, 900 / bitmap.width);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const ctx = lienzo.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close();
    return lienzo.toDataURL("image/jpeg", 0.6);
  }

  function mostrarErrorForm(mensaje) {
    const error = $("#form-error");
    error.textContent = mensaje;
    error.hidden = false;
  }

  // ============================================================
  // MODAL DE DETALLE
  // ============================================================

  function abrirModal(p) {
    promesaModalActual = p;
    const gestor = usuarios.find((u) => u.id === p.gestor_id) || { nombre: "—", zona: "—" };

    $("#modal-contenido").innerHTML = `
      ${p.foto ? `<img class="detalle-foto" src="${p.foto}" alt="Foto del comprobante">` : ""}
      <div class="detalle-grid">
        <div class="detalle-item">
          <span class="detalle-label">Cliente</span>
          <span class="detalle-valor">${escapar(p.nombre_deudor)}</span>
        </div>
        ${p.telefono ? `
        <div class="detalle-item">
          <span class="detalle-label">Teléfono</span>
          <span class="detalle-valor">${escapar(p.telefono)}</span>
        </div>` : ""}
        <div class="detalle-item">
          <span class="detalle-label">Monto prometido</span>
          <span class="detalle-valor">${dinero(p.monto_prometido)}</span>
        </div>
        <div class="detalle-item">
          <span class="detalle-label">Fecha compromiso</span>
          <span class="detalle-valor">${fechaBonita(p.fecha_pago)}</span>
        </div>
        <div class="detalle-item">
          <span class="detalle-label">Canal</span>
          <span class="detalle-valor">${escapar(p.canal_contacto)}</span>
        </div>
        <div class="detalle-item">
          <span class="detalle-label">Estado</span>
          <span class="badge badge-estado estado-${p.estado}" style="align-self:flex-start">${estadoTexto[p.estado]}</span>
        </div>
        <div class="detalle-item">
          <span class="detalle-label">Capturada por</span>
          <span class="detalle-valor">${escapar(gestor.nombre)} · ${escapar(gestor.zona || "—")}</span>
        </div>
        <div class="detalle-item">
          <span class="detalle-label">Envío</span>
          <span class="detalle-valor">${p.sync_pending ? "Pendiente de enviar" : "Enviada"}</span>
        </div>
      </div>
      ${p.notas ? `<div class="detalle-notas"><strong>Observaciones:</strong> ${escapar(p.notas)}</div>` : ""}
      <div class="modal-acciones"></div>
    `;

    const acciones = $("#modal-contenido .modal-acciones");

    // Copiar resumen: datos listos para pegar donde el gestor los necesite
    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.className = "btn btn-tel";
    btnCopiar.textContent = "Copiar resumen";
    btnCopiar.addEventListener("click", async () => {
      const texto = `Cliente: ${p.nombre_deudor} - Monto: ${dinero(p.monto_prometido)} - Vence: ${fechaBonita(p.fecha_pago)} - Tel: ${p.telefono || "sin teléfono"}`;
      try {
        await navigator.clipboard.writeText(texto);
        toast("Datos copiados al portapapeles.");
      } catch {
        // Respaldo para navegadores sin portapapeles directo
        const area = document.createElement("textarea");
        area.value = texto;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
        toast("Datos copiados al portapapeles.");
      }
    });
    acciones.appendChild(btnCopiar);

    if (p.estado === "capturada") {
      const btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn btn-primary";
      btnEditar.textContent = "Editar datos";
      btnEditar.addEventListener("click", () => entrarModoEdicion(p));
      acciones.appendChild(btnEditar);
    }

    if (p.estado !== "cumplida") {
      const btnOk = document.createElement("button");
      btnOk.type = "button";
      btnOk.className = "btn btn-success";
      btnOk.textContent = "Marcar cumplida";
      btnOk.addEventListener("click", () => cambiarEstado(p, "cumplida"));
      acciones.appendChild(btnOk);
    }

    if (p.estado !== "incumplida") {
      const btnNo = document.createElement("button");
      btnNo.type = "button";
      btnNo.className = "btn btn-danger-outline";
      btnNo.textContent = "Marcar incumplida";
      btnNo.addEventListener("click", () => cambiarEstado(p, "incumplida"));
      acciones.appendChild(btnNo);
    }

    $("#modal-detalle").hidden = false;
    $("#modal-cerrar").focus();
  }

  function cerrarModal() {
    $("#modal-detalle").hidden = true;
    promesaModalActual = null;
  }

  function initModal() {
    $("#modal-cerrar").addEventListener("click", cerrarModal);
    $("#modal-detalle").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) cerrarModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("#modal-detalle").hidden) cerrarModal();
        if (!$("#modal-usuario").hidden) cerrarModalUsuario();
      }
    });
  }

  // ============================================================
  // VISTA SUPERVISOR
  // ============================================================

  let filtroBusqueda = "";

  async function renderVistaSupervisor() {
    const promesas = filtrarVisibles(await DB.obtenerPromesas());

    const titulo = fechaCompletaHoy();
    $("#fecha-hoy-sup").textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

    // Rellenar el filtro de gestores conservando la selección actual
    const selectGestor = $("#filtro-gestor");
    const seleccionPrevia = filtroGestorId;
    selectGestor.innerHTML = '<option value="">Todos los gestores</option>';
    gestoresActivos().forEach((g) => {
      const op = document.createElement("option");
      op.value = g.id;
      op.textContent = g.nombre;
      selectGestor.appendChild(op);
    });
    // Si el gestor seleccionado ya no existe, volver a "todos"
    filtroGestorId = gestoresActivos().some((g) => g.id === seleccionPrevia) ? seleccionPrevia : "";
    selectGestor.value = filtroGestorId;

    renderKPIs(promesas);
    renderChart(promesas);
    renderTabla(promesas);

    const pendientes = promesas.filter((p) => p.sync_pending).length;
    const badge = $("#badge-pendientes-sup");
    badge.hidden = pendientes === 0;
    badge.textContent = `${pendientes} por enviar desde campo`;
  }

  function renderKPIs(promesas) {
    const deHoy = promesas.filter((p) => esHoy(p.fecha_captura));
    const montoTotal = promesas.reduce((s, p) => s + p.monto_prometido, 0);
    const montoCobrado = promesas.reduce((s, p) => s + (p.monto_cobrado || 0), 0);

    // TCE: una promesa capturada implica que hubo acuerdo en campo,
    // así que el denominador nunca baja del número de promesas del gestor.
    const promesasHoyPorGestor = {};
    deHoy.forEach((p) => {
      promesasHoyPorGestor[p.gestor_id] = (promesasHoyPorGestor[p.gestor_id] || 0) + 1;
    });
    const gestionesConAcuerdo = usuarios
      .filter((u) => (u.rol || "gestor") === "gestor")
      .reduce((s, g) => s + Math.max(g.gestiones_con_acuerdo || 0, promesasHoyPorGestor[g.id] || 0), 0);

    const tce = gestionesConAcuerdo > 0 ? (deHoy.length / gestionesConAcuerdo) * 100 : 0;
    const icc = montoTotal > 0 ? (montoCobrado / montoTotal) * 100 : 0;

    $("#kpi-capturadas").textContent = deHoy.length;
    $("#kpi-monto").textContent = dinero(montoTotal);
    $("#kpi-tce").textContent = Math.round(tce) + "%";
    $("#kpi-icc").textContent = Math.round(icc) + "%";

    $("#kpi-tce").classList.toggle("kpi-verde", tce >= 85);
    $("#kpi-tce-meta").textContent = tce >= 85
      ? "Meta cumplida (mayor a 85%)"
      : "Meta: mayor a 85%";
  }

  function renderChart(promesas) {
    const conteo = { capturada: 0, cumplida: 0, incumplida: 0 };
    promesas.forEach((p) => { conteo[p.estado] = (conteo[p.estado] || 0) + 1; });
    const maximo = Math.max(1, conteo.capturada, conteo.cumplida, conteo.incumplida);

    const filas = [
      ["Capturadas", "capturada", conteo.capturada],
      ["Cumplidas", "cumplida", conteo.cumplida],
      ["Incumplidas", "incumplida", conteo.incumplida],
    ];

    $("#chart-estados").innerHTML = filas.map(([etiqueta, clave, valor]) => `
      <div class="chart-fila">
        <span class="chart-etiqueta">${etiqueta}</span>
        <div class="chart-pista">
          <div class="chart-barra barra-${clave}" style="width: ${(valor / maximo) * 100}%"></div>
        </div>
        <span class="chart-valor">${valor}</span>
      </div>
    `).join("");
  }

  function renderTabla(promesas) {
    const usuarioPorId = Object.fromEntries(usuarios.map((u) => [u.id, u]));

    let filtradas = [...promesas].sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago));

    // Filtro por gestor seleccionado
    if (filtroGestorId) {
      filtradas = filtradas.filter((p) => p.gestor_id === filtroGestorId);
    }

    if (filtroBusqueda) {
      const q = filtroBusqueda.toLowerCase();
      filtradas = filtradas.filter((p) =>
        p.nombre_deudor.toLowerCase().includes(q) ||
        (usuarioPorId[p.gestor_id]?.nombre || "").toLowerCase().includes(q)
      );
    }

    $("#tabla-vacia").hidden = filtradas.length > 0;

    $("#tabla-body").innerHTML = filtradas.map((p) => {
      const gestor = usuarioPorId[p.gestor_id] || { nombre: "—" };
      const atraso = diasDeAtraso(p);
      return `
        <tr>
          <td>${escapar(gestor.nombre)}</td>
          <td>${escapar(p.nombre_deudor)}</td>
          <td class="num monto-cell">${dinero(p.monto_prometido)}</td>
          <td>${fechaBonita(p.fecha_pago)}</td>
          <td>${escapar(p.canal_contacto)}</td>
          <td><span class="badge badge-estado estado-${p.estado}">${estadoTexto[p.estado]}</span></td>
          <td class="num ${atraso > 0 ? "atraso-cell" : "atraso-cero"}">${atraso > 0 ? atraso : "—"}</td>
        </tr>
      `;
    }).join("");
  }

  // ---------- Resumen WhatsApp para el supervisor ----------

  /**
   * Arma el resumen del día en texto limpio listo para reenviar
   * por WhatsApp (los mandos medios leen WhatsApp, no PDFs).
   */
  async function enviarResumenWhatsApp() {
    const promesas = filtrarVisibles(await DB.obtenerPromesas());
    const deHoy = promesas.filter((p) => esHoy(p.fecha_captura));
    const porCobrar = promesas.filter((p) => p.estado === "capturada" && p.fecha_pago <= hoyISO());

    const montoTotal = promesas.reduce((s, p) => s + p.monto_prometido, 0);
    const montoCobrado = promesas.reduce((s, p) => s + (p.monto_cobrado || 0), 0);
    const icc = montoTotal > 0 ? Math.round((montoCobrado / montoTotal) * 100) : 0;

    const cumplidas = promesas.filter((p) => p.estado === "cumplida");
    const incumplidas = promesas.filter((p) => p.estado === "incumplida");

    const lineas = [
      `*Resumen de Promesas — ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long" })}*`,
      ``,
      `Capturadas hoy: ${deHoy.length}`,
      `Monto prometido total: ${dinero(montoTotal)}`,
      `Cumplidas: ${cumplidas.length} (${dinero(montoCobrado)} cobrados)`,
      `Incumplidas: ${incumplidas.length}`,
      `Por cobrar hoy: ${porCobrar.length} (${dinero(porCobrar.reduce((s, p) => s + p.monto_prometido, 0))})`,
      `ICC: ${icc}%`,
      ``,
      `*Por gestor:*`,
    ];

    usuarios.filter((u) => (u.rol || "gestor") === "gestor").forEach((g) => {
      const delGestor = promesas.filter((p) => p.gestor_id === g.id);
      if (delGestor.length === 0) return;
      const montoG = delGestor.reduce((s, p) => s + p.monto_prometido, 0);
      const cumplidasG = delGestor.filter((p) => p.estado === "cumplida").length;
      lineas.push(`• ${g.nombre}: ${delGestor.length} promesas, ${dinero(montoG)} (${cumplidasG} cumplidas)`);
    });

    lineas.push(``, `Enviado desde Promesa de Pago`);

    window.open("https://wa.me/?text=" + encodeURIComponent(lineas.join("\n")), "_blank", "noopener");
    toast("Resumen listo en WhatsApp, solo elige a quién enviarlo.", "info");
  }

  function initSupervisor() {
    $("#buscar-promesa").addEventListener("input", (e) => {
      filtroBusqueda = e.target.value.trim();
      renderVistaSupervisor();
    });

    $("#filtro-gestor").addEventListener("change", (e) => {
      filtroGestorId = e.target.value;
      renderVistaSupervisor();
    });

    $("#btn-exportar").addEventListener("click", async () => {
      const promesas = filtrarVisibles(await DB.obtenerPromesas());
      if (promesas.length === 0) {
        toast("No hay promesas para exportar.", "aviso");
        return;
      }
      const total = exportarReporteCierre(promesas, usuarios.filter((u) => (u.rol || "gestor") === "gestor"));
      toast(`Reporte de cierre descargado (${total} promesas).`);
    });

    $("#btn-resumen-wsp").addEventListener("click", enviarResumenWhatsApp);
  }

  // ============================================================
  // ARRANQUE
  // ============================================================

  async function arrancar() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // En file:// o entornos sin soporte: la app sigue funcionando igual
      });
    }

    await DB.abrir();
    await sembrarSiVacia();
    usuarios = await DB.obtenerGestores();

    initLogin();
    initTabs();
    initFormulario();
    initModal();
    initModalUsuario();
    initSupervisor();

    actualizarBadgeConexion();
    mostrarVista("login");
    await restaurarSesion();
    intentarEnvio();
  }

  document.addEventListener("DOMContentLoaded", arrancar);
})();
