import { createClient } from "./client";
import type { PendingImageUpload } from "../orders";

export type PdfImportInput = {
  hash: string; file: File; clientName: string; folderId: string | null; folderName: string;
  notes: string; phone: string; locality: string; total: number; canvasesOrdered: boolean; uploads: PendingImageUpload[];
};
type PreparedImage = { id: string; storage_key: string; original_filename: string; description: string };
type ImportReservation = {
  order: { id: string; code: string; client_id: string; organization_folder_id: string; client_name: string };
  manifest: PreparedImage[]; completed: boolean; reused: boolean;
};

export class PdfImportError extends Error {
  constructor(message: string, public orderId?: string) { super(message); this.name = "PdfImportError"; }
}

export async function importPdfOrder(input: PdfImportInput, onProgress: (message: string) => void, onReserved: (orderId: string) => void) {
  const client = createClient();
  onProgress("Creando el pedido en la carpeta elegida…");
  const { data, error } = await client.rpc("begin_pdf_order_import_with_locality", {
    requested_hash: input.hash,
    requested_filename: input.file.name,
    requested_size_bytes: input.file.size,
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
    if (error.code === "PGRST202" || error.code === "42883") throw new PdfImportError("Falta aplicar la migración de importación de PDF en Supabase. No se creó ningún pedido.");
    if (error.message.includes("PDF_ORDER_DELETED")) throw new PdfImportError("Este PDF ya pertenece a un pedido eliminado. No se creó un duplicado.");
    if (error.message.includes("PDF_IMPORT_DIFFERENT_DRAFT")) throw new PdfImportError("Este PDF ya tiene una importación incompleta con otros datos. Reintentá con las cantidades y descripciones originales.");
    throw new PdfImportError("No se pudo iniciar la importación. Podés reintentar: el mismo PDF no creará dos pedidos.");
  }
  const reservation = data as ImportReservation;
  if (!reservation?.order?.id || !Array.isArray(reservation.manifest)) throw new PdfImportError("Supabase no devolvió una importación válida.");
  const orderId = reservation.order.id;
  onReserved(orderId);
  if (reservation.completed) return { orderId, reused: true };
  if (reservation.manifest.length !== input.uploads.length) throw new PdfImportError("La cantidad de imágenes no coincide con la importación iniciada.", orderId);

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
    onProgress("Guardando el PDF original…");
    await uploadOnce("order-documents", `${orderId}/${input.hash}.pdf`, input.file);
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
    throw new PdfImportError("El pedido quedó reservado, pero faltó completar la subida. Reintentá: se conservarán los archivos que ya se guardaron y no se duplicará el pedido.", orderId);
  }
  void fetch(`/api/push/orders/${encodeURIComponent(orderId)}`, { method: "POST", cache: "no-store" }).catch(() => {});
  return { orderId, reused: false };
}

export async function getOrderPdf(orderId: string) {
  const client = createClient();
  const { data, error } = await client.from("order_pdf_imports").select("filename,file_hash,completed_at").eq("order_id", orderId).single();
  if (error) throw error;
  const signed = await client.storage.from("order-documents").createSignedUrl(`${orderId}/${data.file_hash}.pdf`, 3600);
  if (signed.error) throw signed.error;
  return { filename: data.filename as string, url: signed.data.signedUrl };
}
