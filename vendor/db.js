/* ============================================================
   db.js — Wrapper propio de IndexedDB (promisificado, sin librerías)
   Base: "promesa-pago-db"
   Stores: "gestores", "promesas"
   ============================================================ */

const DB = (() => {
  const NOMBRE_DB = "promesa-pago-db";
  const VERSION_DB = 1;
  let conexion = null;

  /** Abre (o crea) la base de datos. Devuelve una promesa con la conexión. */
  function abrir() {
    if (conexion) return Promise.resolve(conexion);

    return new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);

      peticion.onupgradeneeded = (evento) => {
        const db = evento.target.result;

        // Catálogo de gestores (fijo en el piloto)
        if (!db.objectStoreNames.contains("gestores")) {
          db.createObjectStore("gestores", { keyPath: "id" });
        }

        // Promesas de pago capturadas en campo
        if (!db.objectStoreNames.contains("promesas")) {
          const store = db.createObjectStore("promesas", { keyPath: "id" });
          store.createIndex("por_gestor", "gestor_id", { unique: false });
          store.createIndex("por_estado", "estado", { unique: false });
        }
      };

      peticion.onsuccess = () => {
        conexion = peticion.result;
        // Si otra pestaña pide una versión nueva, liberar esta conexión
        conexion.onversionchange = () => { conexion.close(); conexion = null; };
        resolver(conexion);
      };

      peticion.onerror = () => rechazar(peticion.error);
    });
  }

  /** Helper genérico: ejecuta una operación sobre un store. */
  async function operar(nombreStore, modo, operacion) {
    const db = await abrir();
    return new Promise((resolver, rechazar) => {
      const tx = db.transaction(nombreStore, modo);
      const store = tx.objectStore(nombreStore);
      const resultado = operacion(store);

      tx.oncomplete = () => resolver(resultado && resultado._valor !== undefined ? resultado._valor : resultado);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  }

  /** Envuelve un IDBRequest en promesa. */
  function promesaDe(request) {
    return new Promise((resolver, rechazar) => {
      request.onsuccess = () => resolver(request.result);
      request.onerror = () => rechazar(request.error);
    });
  }

  return {
    abrir,

    // ---------- Gestores ----------
    async guardarGestores(gestores) {
      const db = await abrir();
      const tx = db.transaction("gestores", "readwrite");
      const store = tx.objectStore("gestores");
      gestores.forEach((g) => store.put(g));
      return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },

    async obtenerGestores() {
      const db = await abrir();
      return promesaDe(db.transaction("gestores", "readonly").objectStore("gestores").getAll());
    },

    /** Elimina un usuario del catálogo. Sus promesas se conservan. */
    async eliminarGestor(id) {
      const db = await abrir();
      return promesaDe(
        db.transaction("gestores", "readwrite").objectStore("gestores").delete(id)
      );
    },

    // ---------- Promesas ----------
    async agregarPromesa(promesa) {
      const db = await abrir();
      return promesaDe(
        db.transaction("promesas", "readwrite").objectStore("promesas").add(promesa)
      ).then(() => promesa);
    },

    async actualizarPromesa(promesa) {
      const db = await abrir();
      return promesaDe(
        db.transaction("promesas", "readwrite").objectStore("promesas").put(promesa)
      ).then(() => promesa);
    },

    async obtenerPromesas() {
      const db = await abrir();
      return promesaDe(db.transaction("promesas", "readonly").objectStore("promesas").getAll());
    },

    async contarPromesas() {
      const db = await abrir();
      return promesaDe(db.transaction("promesas", "readonly").objectStore("promesas").count());
    },

    /** Marca como enviadas todas las promesas pendientes. Devuelve cuántas se enviaron. */
    async marcarPendientesComoEnviadas() {
      const promesas = await this.obtenerPromesas();
      const pendientes = promesas.filter((p) => p.sync_pending);
      for (const p of pendientes) {
        p.sync_pending = false;
        await this.actualizarPromesa(p);
      }
      return pendientes.length;
    },

    /** Borra todo el contenido de ambos stores (para restablecer la demo). */
    async limpiarTodo() {
      const db = await abrir();
      const tx = db.transaction(["gestores", "promesas"], "readwrite");
      tx.objectStore("gestores").clear();
      tx.objectStore("promesas").clear();
      return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },
  };
})();
