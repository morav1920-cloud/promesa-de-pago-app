/* ============================================================
   sw.js — Service worker
   Estrategia:
   - Archivos propios (mismo origen): PRIMERO RED, y si no hay
     señal, se usa la copia guardada. Así cualquier cambio que
     subas se ve de inmediato y la app sigue funcionando offline.
   - Recursos externos (fuentes de Google): PRIMERO COPIA
     GUARDADA (no cambian, se cargan rapidísimo).
   ============================================================ */

const CACHE_APP = "promesa-pago-v1";
const CACHE_EXTERNA = "promesa-pago-externa-v1";

/* Archivos propios que se guardan desde la instalación */
const ARCHIVOS_BASE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "db.js",
  "seed.js",
  "export.js",
  "vendor/xlsx.full.min.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP)
      .then((cache) => cache.addAll(ARCHIVOS_BASE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((n) => n !== CACHE_APP && n !== CACHE_EXTERNA)
          .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;

  const esPropio = new URL(evento.request.url).origin === self.location.origin;

  if (esPropio) {
    // Primero red, copia guardada como respaldo (offline)
    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_APP).then((cache) => cache.put(evento.request, copia));
          }
          return respuesta;
        })
        .catch(() =>
          caches.match(evento.request).then((guardada) => {
            if (guardada) return guardada;
            if (evento.request.mode === "navigate") return caches.match("index.html");
          })
        )
    );
  } else {
    // Externos (fuentes): primero copia guardada, luego red
    evento.respondWith(
      caches.match(evento.request).then((guardada) => {
        if (guardada) return guardada;
        return fetch(evento.request).then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_EXTERNA).then((cache) => cache.put(evento.request, copia));
          }
          return respuesta;
        });
      })
    );
  }
});
