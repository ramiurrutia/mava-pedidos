const VERSION = "mava-pwa-v3";
// Separate from the versioned app caches: an update must not remove pending photos.
const SHARE_CACHE = "mava-shared-images-v1";
const SHARE_TTL = 24 * 60 * 60 * 1000;
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/mava-app-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("mava-pwa-") && ![STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/compartir/recibir") {
    event.respondWith(receiveSharedImages(request));
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (
          await caches.match(request)
          ?? await caches.match(OFFLINE_URL)
          ?? Response.error()
        )),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/")
    || ["font", "image", "script", "style"].includes(request.destination)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});

async function receiveSharedImages(request) {
  const redirect = (query) => Response.redirect(new URL(`/compartir?${query}`, self.location.origin).href, 303);
  try {
    const form = await request.formData();
    const files = form.getAll("images");
    if (!files.length || files.some((file) => typeof file === "string" || !file.type.startsWith("image/") || !file.size)) {
      return redirect("error=images");
    }
    if (files.length > 30 || files.some((file) => file.size > 6 * 1024 * 1024)) {
      return redirect("error=size");
    }
    const cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) {
      const entry = await cache.match(key);
      if (Number(entry?.headers.get("x-share-created")) < Date.now() - SHARE_TTL) await cache.delete(key);
    }
    const id = crypto.randomUUID();
    const payload = new FormData();
    for (const file of files) payload.append("images", file, file.name);
    await cache.put(new URL(`/compartir/archivo/${id}`, self.location.origin).href, new Response(payload, {
      headers: { "x-share-created": String(Date.now()) },
    }));
    return redirect(`share=${id}`);
  } catch {
    return redirect("error=storage");
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  event.waitUntil(self.registration.showNotification(
    payload.title ?? "Nuevo pedido",
    {
      body: payload.body ?? "Llegó un pedido nuevo.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/pedidos" },
      tag: payload.tag ?? "mava-new-order",
      vibrate: [120, 60, 120],
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url ?? "/pedidos", self.location.origin).href;

  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const current = clients.find((client) => client.url.startsWith(self.location.origin));
    if (current) {
      await current.navigate(destination);
      return current.focus();
    }
    return self.clients.openWindow(destination);
  }));
});
