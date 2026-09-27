import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MAVA Pedidos",
    short_name: "MAVA PEDIDOS",
    description: "Organización segura de pedidos e imágenes personalizadas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#235c4c",
    orientation: "portrait-primary",
    lang: "es-AR",
    categories: ["business", "productivity"],
    share_target: {
      action: "/compartir/recibir",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{
          name: "images",
          // Android can filter attachments before sw.js receives the POST.
          // Generic files are checked by their content in the service worker.
          accept: [
            "image/*", "image/jpeg", "image/png", "image/webp", "image/gif",
            "application/octet-stream", ".jpg", ".jpeg", ".png", ".webp", ".gif",
          ],
        }],
      },
    },
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
