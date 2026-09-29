import { createClient } from "./client";
import type { PendingImageUpload } from "../orders";

export type DocumentImportInput = {
  format: "PDF" | "EXCEL";
  hash: string; file: File; clientName: string; folderId: string | null; folderName: string;
  documents?: Array<{ hash: string; file: File }>;
  notes: string; phone: string; locality: string; total: number; canvasesOrdered: boolean; uploads: PendingImageUpload[];
};
type PreparedImage = { id: string; storage_key: string; original_filename: string; description: string };
type ImportReservation = {
  order: { id: string; code: string; client_id: string; organization_folder_id: string; client_name: string };
  manifest: PreparedImage[]; completed: boolean; reused: boolean;
};

export class DocumentImportError extends Error {
  constructor(message: string, public orderId?: string, public canEditDraft = false) { super(message); this.name = "DocumentImportError"; }
}

export async function importDocumentOrder(input: DocumentImportInput, onProgress: (message: string) => void, onReserved: (orderId: string) => void) {
  const client = createClient();
  const excel = input.format === "EXCEL";
  const documents = input.documents ?? [{ hash: input.hash, file: input.file }];
  onProgress("Creando el pedido en la carpeta elegida…");
  const { data, error } = await client.rpc(excel ? "begin_excel_order_import_with_locality" : "begin_pdf_order_batch_import", {
    ...(excel ? {
      requested_hash: input.hash, requested_filename: input.file.name, requested_size_bytes: input.file.size,
    } : {
      requested_documents: documents.map(({ hash, file }) => ({ hash, filename: file.name, size: file.size })),
    }),
    requested_client_name: input.clientName.trim(),
    requested_folder_id: input.folderId,
    requested_folder_name: input.folderName.trim(),
    requested_notes: input.notes,
    requested_phone: input.phone,
    requested_locality: input.locality.trim(),
    requested_total: input.total,
    requested_canvases_ordered: input.canvasesOrdered,
    requested_images: input.uploads.map(({ file, description }) => ({ filename: file.name, mimeType: file.type, size: file.size, description })),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new DocumentImportError(`Falta aplicar la migración ${excel ? "de importación de Excel" : "20260929_multiple_pdf_order_import.sql"} en Supabase. No se creó ningún pedido.`, undefined, true);
    if (error.message.includes("PDF_ALREADY_IN_ANOTHER_IMPORT")) throw new DocumentImportError("Uno de los PDFs ya pertenece a otro pedido o a una importación iniciada. Quitalo de esta selección; no se creó ningún pedido nuevo.", undefined, true);
    if (error.message.includes("PDF_ORDER_DELETED")) throw new DocumentImportError("Uno de los archivos ya pertenece a un pedido eliminado. No se creó un duplicado.", undefined, true);
    if (error.message.includes("PDF_IMPORT_DIFFERENT_DRAFT")) throw new DocumentImportError("Estos archivos ya tienen una importación incompleta con otros datos. Reintentá con las cantidades y descripciones originales.", undefined, true);
    throw new DocumentImportError("No se pudo iniciar la importación. Podés reintentar: el mismo archivo no creará dos pedidos.");
  }
  const reservation = data as ImportReservation;
  if (!reservation?.order?.id || !Array.isArray(reservation.manifest)) throw new DocumentImportError("Supabase no devolvió una importación válida.");
  const orderId = reservation.order.id;
  onReserved(orderId);
  if (reservation.completed) return { orderId, reused: true };
  if (reservation.manifest.length !== input.uploads.length) throw new DocumentImportError("La cantidad de imágenes no coincide con la importación iniciada.", orderId);

  async function uploadOnce(bucket: string, path: string, file: File) {
    const storage = client.storage.from(bucket);
    // Do not overwrite anything. A previous attempt may already have uploaded it.
    if (reservation.reused) {
      const existing = await storage.info(path);
      if (!existing.error) return;
    }
    const uploaded = await storage.upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
    if (uploaded.error) {
      const existing = await storage.info(path);
      if (existing.error) throw uploaded.error;
    }
  }
  try {
    for (const [index, document] of documents.entries()) {
      onProgress(`Guardando ${excel ? "Excel" : "PDF"} ${index + 1} de ${documents.length}…`);
      const original = new File([document.file], document.file.name, { type: excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf" });
      await uploadOnce("order-documents", `${orderId}/${document.hash}.${excel ? "xlsx" : "pdf"}`, original);
    }
    let next = 0, completed = 0;
    const workers = Array.from({ length: Math.min(3, input.uploads.length) }, async () => {
      while (next < input.uploads.length) {
        const index = next++;
        await uploadOnce("order-images", reservation.manifest[index].storage_key, input.uploads[index].file);
        completed++;
        onProgress(`Guardando cuadros: ${completed} de ${input.uploads.length}…`);
      }
    });
    const results = await Promise.allSettled(workers);
    if (results.some((result) => result.status === "rejected")) throw new Error("UPLOAD_FAILED");
    onProgress("Confirmando el pedido y sus imágenes…");
    const finalized = await client.rpc("complete_pdf_order_import", { requested_order_id: orderId });
    if (finalized.error || finalized.data !== true) throw finalized.error ?? new Error("FINALIZE_FAILED");
  } catch {
    throw new DocumentImportError("El pedido quedó reservado, pero faltó completar la subida. Reintentá: se conservarán los archivos que ya se guardaron y no se duplicará el pedido.", orderId);
  }
  void fetch(`/api/push/orders/${encodeURIComponent(orderId)}`, { method: "POST", cache: "no-store" }).catch(() => {});
  return { orderId, reused: false };
}

export type OrderDocument = { filename: string; url: string | null; hash: string };

export async function getOrderDocuments(orderId: string, format: "PDF" | "EXCEL" = "PDF"): Promise<OrderDocument[]> {
  const client = createClient();
  let documents: Array<{ filename: string; file_hash: string }> = [];
  if (format === "PDF") {
    const result = await client.from("order_import_documents").select("filename,file_hash").eq("order_id", orderId).order("file_hash");
    if (result.error && !["42P01", "PGRST205"].includes(result.error.code)) throw result.error;
    documents = result.data ?? [];
  }
  if (!documents.length) {
    const { data, error } = await client.from("order_pdf_imports").select("filename,file_hash").eq("order_id", orderId).single();
    if (error) throw error;
    documents = [data];
  }
  return Promise.all(documents.map(async (document) => {
    const signed = await client.storage.from("order-documents").createSignedUrl(`${orderId}/${document.file_hash}.${format === "EXCEL" ? "xlsx" : "pdf"}`, 3600);
    return { filename: document.filename, hash: document.file_hash, url: signed.error ? null : signed.data.signedUrl };
  }));
}
