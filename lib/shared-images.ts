import type { PendingImageUpload } from "./orders";

const SHARE_CACHE = "mava-shared-images-v1";
const SHARE_TTL = 24 * 60 * 60 * 1000;

export type SharedImages = {
  uploads: PendingImageUpload[];
  orderId?: string;
  createdAt: number;
};

function cacheKey(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("El enlace de las imágenes no es válido.");
  return new URL(`/compartir/archivo/${id}`, window.location.origin).href;
}

export async function loadSharedImages(id: string): Promise<SharedImages> {
  const cache = await caches.open(SHARE_CACHE);
  const key = cacheKey(id);
  const response = await cache.match(key);
  if (!response) throw new Error("Estas imágenes ya se guardaron o no están disponibles. Volvé a compartirlas desde WhatsApp.");
  const createdAt = Number(response.headers.get("x-share-created"));
  if (!createdAt || createdAt < Date.now() - SHARE_TTL) {
    await cache.delete(key);
    throw new Error("Las imágenes compartidas vencieron. Volvé a compartirlas desde WhatsApp.");
  }
  const form = await response.formData();
  const descriptions = form.getAll("descriptions");
  const uploads = form.getAll("images").flatMap((file, index) =>
    typeof file !== "string" && file.type.startsWith("image/")
      ? [{ file, description: String(descriptions[index] ?? "") }]
      : []);
  return { uploads, createdAt, orderId: response.headers.get("x-share-order") || undefined };
}

export async function saveSharedImages(id: string, draft: SharedImages) {
  const cache = await caches.open(SHARE_CACHE);
  const payload = new FormData();
  for (const { file, description } of draft.uploads) {
    payload.append("images", file, file.name);
    payload.append("descriptions", description);
  }
  await cache.put(cacheKey(id), new Response(payload, {
    headers: {
      "x-share-created": String(draft.createdAt),
      ...(draft.orderId ? { "x-share-order": draft.orderId } : {}),
    },
  }));
}

export async function removeSharedImages(id: string) {
  const cache = await caches.open(SHARE_CACHE);
  await cache.delete(cacheKey(id));
}
