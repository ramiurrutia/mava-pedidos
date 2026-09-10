export type OrderStatus = "Pendiente" | "En producción" | "Terminado" | "Entregado";
export type ArtworkPreparationStatus = "Pendiente" | "Listo";

export type ClientFolder = {
  id: string;
  name: string;
};

export type OrderImage = {
  id: string;
  pedidoId: string;
  name: string;
  description: string;
  preparationKey: string;
  preparationStatus: ArtworkPreparationStatus;
  addedAt: string;
  previewUrl?: string;
};

export type PendingImageUpload = {
  file: File;
  description: string;
};

export function createPendingImageUploads(files: File[]): PendingImageUpload[] {
  return files.map((file) => ({ file, description: "" }));
}

export type OrderItem = {
  id: string;
  code: string;
  name: string;
  size: string;
  price: number;
  background?: string;
  backgroundLabel?: string;
  imageUrl?: string;
  preparationKey?: string;
  preparationStatus?: ArtworkPreparationStatus;
};

export type Order = {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  folderId?: string;
  folderName?: string;
  status: OrderStatus;
  notes: string;
  canvasesOrdered: boolean;
  createdAt: string;
  images: OrderImage[];
  cover: string;
  sourceSystem?: string;
  sourceOrderId?: string;
  sourceStatus?: string;
  contactName?: string;
  whatsapp?: string;
  locality?: string;
  items?: OrderItem[];
  total?: number;
};

export const MAVA_STOCK_SOURCE = "MAVA STOCK";
export const MAVA_STOCK_FOLDER_ID = "mava-stock";

export function isMavaStockOrder(order: Order) {
  return order.sourceSystem === MAVA_STOCK_SOURCE;
}

export function getOrderFolderId(order: Order) {
  return order.folderId ?? (isMavaStockOrder(order) ? MAVA_STOCK_FOLDER_ID : order.clientId);
}

export function findLatestPendingOrder(orders: Order[], clientId: string) {
  return orders
    .filter((order) => getOrderFolderId(order) === clientId && isOrderActive(order.status))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

export function isOrderActive(status: OrderStatus) {
  return status === "Pendiente" || status === "En producción";
}

export function getOrderArtworkProgress(order: Order) {
  const artworks = [
    ...order.images.map((image) => image.preparationStatus),
    ...(order.items ?? []).map((item) => item.preparationStatus ?? "Pendiente"),
  ];
  const total = artworks.length;
  const ready = artworks.filter((status) => status === "Listo").length;
  return {
    ready,
    total,
    percentage: total ? Math.round((ready / total) * 100) : 0,
  };
}
