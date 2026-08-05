export type OrderStatus = "Pendiente" | "En producción" | "Terminado" | "Entregado";

export type ClientFolder = {
  id: string;
  name: string;
};

export type OrderImage = {
  id: string;
  pedidoId: string;
  name: string;
  description: string;
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
  sourceSystem?: string;
  sourceOrderId?: string;
  sourceStatus?: string;
  contactName?: string;
  whatsapp?: string;
  items?: OrderItem[];
  total?: number;
};

export const MAVA_STOCK_SOURCE = "MAVA STOCK";
export const MAVA_STOCK_FOLDER_ID = "mava-stock";

export function isMavaStockOrder(order: Order) {
  return order.sourceSystem === MAVA_STOCK_SOURCE;
}

export function findLatestPendingOrder(orders: Order[], clientId: string) {
  return orders
    .filter((order) => order.clientId === clientId && isOrderActive(order.status))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

export function isOrderActive(status: OrderStatus) {
  return status === "Pendiente" || status === "En producción";
}
