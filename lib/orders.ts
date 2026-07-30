export type OrderStatus = "Pendiente" | "En producción" | "Terminado" | "Entregado";

export type ClientFolder = {
  id: string;
  name: string;
};

export type OrderImage = {
  id: string;
  pedidoId: string;
  name: string;
  addedAt: string;
  previewUrl?: string;
};

export type Order = {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  images: OrderImage[];
  cover: string;
};

export function findLatestPendingOrder(orders: Order[], clientId: string) {
  return orders
    .filter((order) => order.clientId === clientId && order.status === "Pendiente")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

export function fileToOrderImage(file: File, pedidoId: string): Promise<OrderImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("El archivo seleccionado no es una imagen."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => resolve({
      id: crypto.randomUUID(),
      pedidoId,
      name: file.name,
      addedAt: new Date().toISOString(),
      previewUrl: typeof reader.result === "string" ? reader.result : undefined,
    });
    reader.readAsDataURL(file);
  });
}

export function folderIdFromName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `folder-${normalized || "sin-nombre"}`;
}
