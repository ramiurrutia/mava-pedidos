const VERSION = "mava-pwa-v4";
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
  let form;
  try {
    form = await request.formData();
  } catch {
    return redirect("error=payload");
  }
  // Read file parts regardless of their field name; accompanying text is not a file.
  const received = [...form.values()].filter((value) => typeof value !== "string");
  if (!received.length) return redirect("error=missing");
  if (received.some((file) => !file.size)) return redirect("error=empty");
  if (received.length > 30 || received.some((file) => file.size > 6 * 1024 * 1024)) {
    return redirect("error=size");
  }
  const files = [];
  try {
    for (const [index, file] of received.entries()) {
      const type = await sharedImageType(file);
      if (!type) return redirect("error=format");
      files.push(new File([file], file.name || `imagen-${index + 1}.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`, {
        type,
        lastModified: file.lastModified,
      }));
    }
  } catch {
    return redirect("error=unreadable");
  }
  try {
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

// Identify the formats accepted by Supabase using a small header, not the
// filename or MIME supplied by the sending app (which can be empty/generic).
async function sharedImageType(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = (signature, offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matches([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || matches([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif";
  if (matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
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
