// Service worker: deja la app abrir sin conexión (solo el "cascarón": HTML, CSS, JS e iconos).
// Los datos NO se guardan aquí: las llamadas a Supabase son de otro origen y pasan directo.
// Estrategia "red primero": si hay internet siempre carga la versión más nueva; si no, la copia guardada.
const CACHE = "panel-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "index.html"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

// Avisos que manda la función "avisos" de Supabase
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { titulo: "Panel", cuerpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Panel", {
    body: d.cuerpo || "",
    tag: d.etiqueta || "panel",
    icon: "assets/icon-192.png",
    badge: "assets/favicon-32.png",
    lang: "es-CO",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const abierta = ws.find((w) => w.url.startsWith(self.registration.scope));
    return abierta ? abierta.navigate(url).then((w) => (w || abierta).focus()) : clients.openWindow(url);
  }));
});
