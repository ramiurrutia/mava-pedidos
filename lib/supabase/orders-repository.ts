import {
  type ClientFolder,
  type ArtworkPreparationStatus,
  type Order,
  type OrderImage,
  type OrderItem,
  type OrderStatus,
  type PendingImageUpload,
} from "../orders";
import { createClient } from "./client";

const IMAGE_BUCKET = "order-images";

type DatabaseStatus = "pending" | "in_production" | "finished" | "delivered";

type ImageRow = {
  id: string;
  order_id: string;
  storage_key: string;
  original_filename: string;
  description: string;
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
  canvases_ordered: boolean;
  created_at: string;
  source_system?: string | null;
  source_order_id?: string | null;
  source_status?: string | null;
  contact_name?: string | null;
  whatsapp?: string | null;
  items?: OrderItem[] | null;
  total?: number | null;
  order_images?: ImageRow[] | null;
  order_artwork_preparations?: PreparationRow[] | null;
};

type PreparationRow = {
  artwork_key: string;
  status: DatabasePreparationStatus;
};

type PreparedImageRow = {
  id: string;
  order_id: string;
  storage_key: string;
  original_filename: string;
  description: string;
  created_at: string;
};

type DatabasePreparationStatus = "pending" | "in_preparation" | "ready";

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

const fromDatabasePreparationStatus: Record<DatabasePreparationStatus, ArtworkPreparationStatus> = {
  pending: "Pendiente",
  in_preparation: "Pendiente",
  ready: "Listo",
};

const toDatabasePreparationStatus: Record<ArtworkPreparationStatus, DatabasePreparationStatus> = {
  Pendiente: "pending",
  Listo: "ready",
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

function createSignedImage(image: ImageRow | PreparedImageRow, previewUrl?: string): OrderImage {
  return {
    id: image.id,
    pedidoId: image.order_id,
    name: image.original_filename,
    description: image.description,
    preparationKey: `image:${image.id}`,
    preparationStatus: "Pendiente",
    addedAt: image.created_at,
    previewUrl,
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
        canvases_ordered,
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
          description,
          created_at,
          upload_status
        ),
        order_artwork_preparations (
          artwork_key,
          status
        )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (foldersResult.error) throw foldersResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const rows = ordersResult.data as OrderRow[];
  const readyImageRows = rows.flatMap((row) => (row.order_images ?? [])
    .filter((image) => image.upload_status === "ready"));
  const { data: signedImages } = readyImageRows.length
    ? await supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrls(readyImageRows.map((image) => image.storage_key), 60 * 60)
    : { data: [] };
  const signedUrlByPath = new Map(
    (signedImages ?? [])
      .filter((image) => image.path && image.signedUrl)
      .map((image) => [image.path, image.signedUrl!]),
  );
  const visibleFolderIds = new Set(rows.map((row) => row.client_id));
  const folders = (foldersResult.data as ClientFolder[])
    .filter((folder) => visibleFolderIds.has(folder.id));
  const orders = rows.map((row, index): Order => {
    const preparationByKey = new Map(
      (row.order_artwork_preparations ?? []).map((preparation) => [
        preparation.artwork_key,
        fromDatabasePreparationStatus[preparation.status],
      ]),
    );
    const readyImages = (row.order_images ?? [])
      .filter((image) => image.upload_status === "ready")
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
    return {
      id: row.id,
      code: row.code,
      clientId: row.client_id,
      clientName: row.client_name,
      status: fromDatabaseStatus[row.status],
      notes: row.notes,
      canvasesOrdered: row.canvases_ordered,
      createdAt: row.created_at,
      images: readyImages.map((imageRow) => ({
        ...createSignedImage(imageRow, signedUrlByPath.get(imageRow.storage_key)),
        preparationStatus: preparationByKey.get(`image:${imageRow.id}`) ?? "Pendiente",
      })),
      cover: covers[index % covers.length],
      sourceSystem: row.source_system ?? undefined,
      sourceOrderId: row.source_order_id ?? undefined,
      sourceStatus: row.source_status ?? undefined,
      contactName: row.contact_name ?? undefined,
      whatsapp: row.whatsapp ?? undefined,
      items: (row.items ?? []).map((item, itemIndex) => {
        const preparationKey = `stock:${item.id}:${itemIndex}`;
        return {
          ...item,
          preparationKey,
          preparationStatus: preparationByKey.get(preparationKey) ?? "Pendiente",
        };
      }),
      total: row.total ?? undefined,
    };
  });

  return { folders, orders };
}

export async function createRemoteOrder(clientName: string, notes: string, canvasesOrdered = false): Promise<Order> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_order", {
    // La clave conserva la secuencia histórica; Supabase publica el código como PEDIDO-DDMMAAAA-HHMM.
    requested_prefix: "CLASH",
    requested_client_name: clientName,
    requested_notes: notes,
    requested_canvases_ordered: canvasesOrdered,
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
    canvasesOrdered: row.canvases_ordered,
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

export async function updateRemoteCanvasesOrdered(orderId: string, canvasesOrdered: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("orders")
    .update({ canvases_ordered: canvasesOrdered })
    .eq("id", orderId)
    .is("deleted_at", null);

  if (error) throw error;
}

export async function updateRemoteArtworkPreparation(
  orderId: string,
  artworkKey: string,
  status: ArtworkPreparationStatus,
) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_artwork_preparation_status", {
    requested_order_id: orderId,
    requested_artwork_key: artworkKey,
    requested_status: toDatabasePreparationStatus[status],
  });
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

export async function updateRemoteImageDescription(imageId: string, description: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_order_image_description", {
    requested_image_id: imageId,
    requested_description: description.trim(),
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("IMAGE_NOT_FOUND");
  return data;
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
  uploads,
}: {
  clientId: string;
  orderId?: string;
  uploads: PendingImageUpload[];
}): Promise<{ orderId: string; images: OrderImage[]; failedFiles: UploadFailure[] }> {
  const supabase = createClient();
  const images: OrderImage[] = [];
  const failedFiles: UploadFailure[] = [];
  let resolvedOrderId = orderId;

  for (const item of uploads) {
    const { file } = item;
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
        requested_description: item.description.trim(),
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
  images.sort((left, right) => Date.parse(right.addedAt) - Date.parse(left.addedAt));
  return { orderId: resolvedOrderId, images, failedFiles };
}
