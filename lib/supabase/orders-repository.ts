import {
  type ClientFolder,
  type Order,
  type OrderImage,
  type OrderItem,
  type OrderStatus,
} from "../orders";
import { createClient } from "./client";

const IMAGE_BUCKET = "order-images";

type DatabaseStatus = "pending" | "in_production" | "finished" | "delivered";

type ImageRow = {
  id: string;
  order_id: string;
  storage_key: string;
  original_filename: string;
  created_at: string;
  upload_status: "pending" | "ready" | "failed";
};

type OrderRow = {
  id: string;
  code: string;
  client_id: string;
  client_name: string;
  status: DatabaseStatus;
  notes: string;
  created_at: string;
  source_system?: string | null;
  source_order_id?: string | null;
  source_status?: string | null;
  contact_name?: string | null;
  whatsapp?: string | null;
  items?: OrderItem[] | null;
  total?: number | null;
  order_images?: ImageRow[] | null;
};

type PreparedImageRow = {
  id: string;
  order_id: string;
  storage_key: string;
  original_filename: string;
  created_at: string;
};

export type UploadFailure = {
  fileName: string;
  reason: string;
};

export type OrderDetailsInput = {
  clientName: string;
  notes: string;
  contactName: string;
  whatsapp: string;
};

const fromDatabaseStatus: Record<DatabaseStatus, OrderStatus> = {
  pending: "Pendiente",
  in_production: "En producción",
  finished: "Terminado",
  delivered: "Entregado",
};

const toDatabaseStatus: Record<OrderStatus, DatabaseStatus> = {
  Pendiente: "pending",
  "En producción": "in_production",
  Terminado: "finished",
  Entregado: "delivered",
};

const covers = [
  "linear-gradient(145deg, #d9c1a5, #725649)",
  "linear-gradient(145deg, #96b3b2, #314d52)",
  "linear-gradient(145deg, #d9c7bb, #806d67)",
  "linear-gradient(145deg, #95a67c, #374634)",
];

function normalizeRpcRow<T>(value: T | T[] | null): T {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) throw new Error("Supabase no devolvió el registro esperado.");
  return row;
}

async function createSignedImage(image: ImageRow | PreparedImageRow): Promise<OrderImage> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(image.storage_key, 60 * 60);

  return {
    id: image.id,
    pedidoId: image.order_id,
    name: image.original_filename,
    addedAt: image.created_at,
    previewUrl: error ? undefined : data.signedUrl,
  };
}

export async function loadWorkspace(): Promise<{ folders: ClientFolder[]; orders: Order[] }> {
  const supabase = createClient();
  const [foldersResult, ordersResult] = await Promise.all([
    supabase.from("client_folders").select("id, name").order("name"),
    supabase
      .from("orders")
      .select(`
        id,
        code,
        client_id,
        client_name,
        status,
        notes,
        created_at,
        source_system,
        source_order_id,
        source_status,
        contact_name,
        whatsapp,
        items,
        total,
        order_images (
          id,
          order_id,
          storage_key,
          original_filename,
          created_at,
          upload_status
        )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (foldersResult.error) throw foldersResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const rows = ordersResult.data as OrderRow[];
  const visibleFolderIds = new Set(rows.map((row) => row.client_id));
  const folders = (foldersResult.data as ClientFolder[])
    .filter((folder) => visibleFolderIds.has(folder.id));
  const orders = await Promise.all(rows.map(async (row, index): Promise<Order> => {
    const readyImages = (row.order_images ?? []).filter((image) => image.upload_status === "ready");
    return {
      id: row.id,
      code: row.code,
      clientId: row.client_id,
      clientName: row.client_name,
      status: fromDatabaseStatus[row.status],
      notes: row.notes,
      createdAt: row.created_at,
      images: await Promise.all(readyImages.map(createSignedImage)),
      cover: covers[index % covers.length],
      sourceSystem: row.source_system ?? undefined,
      sourceOrderId: row.source_order_id ?? undefined,
      sourceStatus: row.source_status ?? undefined,
      contactName: row.contact_name ?? undefined,
      whatsapp: row.whatsapp ?? undefined,
      items: row.items ?? [],
      total: row.total ?? undefined,
    };
  }));

  return { folders, orders };
}

export async function createRemoteOrder(clientName: string, notes: string): Promise<Order> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_order", {
    requested_prefix: "CLASH",
    requested_client_name: clientName,
    requested_notes: notes,
  });

  if (error) throw error;
  const row = normalizeRpcRow(data as OrderRow | OrderRow[] | null);
  const order: Order = {
    id: row.id,
    code: row.code,
    clientId: row.client_id,
    clientName: row.client_name,
    status: fromDatabaseStatus[row.status],
    notes: row.notes,
    createdAt: row.created_at,
    images: [],
    cover: covers[0],
  };
  try {
    await fetch(`/api/push/orders/${encodeURIComponent(order.id)}`, {
      cache: "no-store",
      method: "POST",
    });
  } catch {
    // El pedido ya está guardado; una falla del aviso no debe revertir su creación.
  }
  return order;
}

export async function updateRemoteOrderStatus(orderId: string, status: OrderStatus) {
  const supabase = createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: toDatabaseStatus[status] })
    .eq("id", orderId)
    .is("deleted_at", null);

  if (error) throw error;
}

export async function updateRemoteOrderDetails(orderId: string, input: OrderDetailsInput) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_order_details", {
    requested_order_id: orderId,
    requested_client_name: input.clientName,
    requested_notes: input.notes,
    requested_contact_name: input.contactName || null,
    requested_whatsapp: input.whatsapp || null,
  });
  if (error) throw error;

  const row = normalizeRpcRow(data as OrderRow | OrderRow[] | null);
  return {
    clientId: row.client_id,
    clientName: row.client_name,
    notes: row.notes,
    contactName: row.contact_name ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
  };
}

export async function deleteRemoteOrder(orderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("soft_delete_order", {
    requested_order_id: orderId,
  });
  if (error) throw error;
  if (data !== true) throw new Error("ORDER_NOT_FOUND");
}

export async function uploadRemoteImages({
  clientId,
  orderId,
  files,
}: {
  clientId: string;
  orderId?: string;
  files: File[];
}): Promise<{ orderId: string; images: OrderImage[]; failedFiles: UploadFailure[] }> {
  const supabase = createClient();
  const images: OrderImage[] = [];
  const failedFiles: UploadFailure[] = [];
  let resolvedOrderId = orderId;

  for (const file of files) {
    let prepared: PreparedImageRow | undefined;
    try {
      if (file.size > 6 * 1024 * 1024) {
        throw new Error("Supera el límite de 6 MB.");
      }

      const imageId = crypto.randomUUID();
      const { data, error } = await supabase.rpc("prepare_order_image", {
        requested_client_id: clientId,
        requested_order_id: resolvedOrderId ?? null,
        requested_image_id: imageId,
        requested_filename: file.name,
        requested_mime_type: file.type,
        requested_size_bytes: file.size,
      });

      if (error) throw error;
      prepared = normalizeRpcRow(data as PreparedImageRow | PreparedImageRow[] | null);
      resolvedOrderId = prepared.order_id;

      const upload = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(prepared.storage_key, file, {
          contentType: file.type,
          upsert: false,
        });

      if (upload.error) throw upload.error;

      const completed = await supabase.rpc("complete_order_image", {
        requested_image_id: prepared.id,
      });
      if (completed.error) throw completed.error;

      images.push(await createSignedImage(prepared));
    } catch (error) {
      if (prepared) {
        await supabase.rpc("fail_order_image", { requested_image_id: prepared.id });
      }
      failedFiles.push({
        fileName: file.name,
        reason: error instanceof Error ? error.message : "Error desconocido.",
      });
    }
  }

  if (!resolvedOrderId) throw new Error("No se encontró un pedido activo.");
  return { orderId: resolvedOrderId, images, failedFiles };
}
