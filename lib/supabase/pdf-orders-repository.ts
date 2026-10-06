import { createClient } from "./client";
import type { PendingImageUpload } from "../orders";

export type DocumentImportInput = {
  orderId?: string;
  format: "PDF" | "EXCEL";
  hash: string; file: File; clientName: string; folderId: string | null; folderName: string;
  documents?: Array<{ hash: string; file: File }>;
  notes: string; phone: string; locality: string; total: number; canvasesOrdered: boolean; uploads: Array<PendingImageUpload & { sourceDocumentHash?: string }>;
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
  onProgress(input.orderId ? "Preparando los PDFs para este pedido…" : "Creando el pedido en la carpeta elegida…");
  const { data, error } = await client.rpc(excel ? "begin_excel_order_import_with_locality" : "begin_pdf_documents_import", {
    ...(excel ? {
      requested_hash: input.hash, requested_filename: input.file.name, requested_size_bytes: input.file.size,
    } : {
      requested_order_id: input.orderId ?? null,
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
    requested_images: input.uploads.map(({ file, description, sourceDocumentHash }) => ({ filename: file.name, mimeType: file.type, size: file.size, description, documentHash: sourceDocumentHash })),
  });
  if (error) {
    if (error.message.includes("PDF_IMPORT_NOT_FOUND") && input.orderId) throw new DocumentImportError("Falta aplicar la migración 20261006_pdf_attachments_for_all_orders.sql en Supabase para agregar PDFs a este pedido. No se modificó el pedido.", undefined, true);
    if (error.code === "PGRST202" || error.code === "42883") throw new DocumentImportError(`Falta aplicar la migración ${excel ? "de importación de Excel" : "20260930_order_pdf_management.sql"} en Supabase. No se creó ningún pedido.`, undefined, true);
    if (error.message.includes("PDF_DOCUMENT_LIMIT")) throw new DocumentImportError("No se pueden agregar más archivos a este pedido. Quitá alguno antes de continuar.", undefined, true);
    if (error.message.includes("PDF_DOCUMENT_DELETED")) throw new DocumentImportError("Ese PDF ya fue eliminado del pedido. No se restauraron sus imágenes.", undefined, true);
    if (error.message.includes("PDF_ORDER_NOT_ACTIVE")) throw new DocumentImportError("El pedido está cerrado. Volvé a un estado activo para agregar PDFs.", undefined, true);
    if (error.message.includes("PDF_INITIAL_IMPORT_INCOMPLETE")) throw new DocumentImportError("Primero completá la importación original de este pedido.", undefined, true);
    if (error.message.includes("INVALID_PDF_IMAGES")) throw new DocumentImportError("No se pueden agregar tantas imágenes al pedido. Revisá las cantidades e intentá nuevamente.", undefined, true);
    if (error.message.includes("PDF_ALREADY_IN_ANOTHER_IMPORT")) throw new DocumentImportError("Uno de los PDFs ya está importado o pertenece a otra importación. Quitalo de esta selección; no se creó ningún pedido nuevo.", undefined, true);
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
    const finalized = await client.rpc(excel ? "complete_pdf_order_import" : "complete_pdf_documents_import", {
      requested_order_id: orderId,
      ...(!excel && { requested_hashes: documents.map((document) => document.hash) }),
    });
    if (finalized.error || finalized.data !== true) throw finalized.error ?? new Error("FINALIZE_FAILED");
  } catch {
    throw new DocumentImportError("El pedido quedó reservado, pero faltó completar la subida. Reintentá: se conservarán los archivos que ya se guardaron y no se duplicará el pedido.", orderId);
  }
  if (!input.orderId) void fetch(`/api/push/orders/${encodeURIComponent(orderId)}`, { method: "POST", cache: "no-store" }).catch(() => {});
  return { orderId, reused: false };
}

export type OrderDocument = { filename: string; url: string | null; hash: string; complete: boolean; initial: boolean; mapped: boolean; imageCount: number };

export async function getOrderDocuments(orderId: string, format: "PDF" | "EXCEL" = "PDF"): Promise<OrderDocument[]> {
  const client = createClient();
  let documents: Array<{ filename: string; file_hash: string; completed_at?: string | null; is_initial?: boolean; mapping_complete?: boolean; image_count?: number }> = [];
  if (format === "PDF") {
    const result = await client.rpc("list_order_pdf_documents", { requested_order_id: orderId });
    if (result.error) throw result.error;
    documents = result.data ?? [];
  }
  if (format === "EXCEL") {
    const { data, error } = await client.from("order_pdf_imports").select("filename,file_hash,completed_at").eq("order_id", orderId).single();
    if (error) throw error;
    documents = [data];
  }
  return Promise.all(documents.map(async (document) => {
    const signed = await client.storage.from("order-documents").createSignedUrl(`${orderId}/${document.file_hash}.${format === "EXCEL" ? "xlsx" : "pdf"}`, 3600);
    return { filename: document.filename, hash: document.file_hash, url: signed.error ? null : signed.data.signedUrl,
      complete: Boolean(document.completed_at), initial: document.is_initial ?? true, mapped: document.mapping_complete ?? false, imageCount: document.image_count ?? 0 };
  }));
}

export async function deleteOrderPdfDocument(orderId: string, hash: string): Promise<string[]> {
  const client = createClient();
  const documents = await getOrderDocuments(orderId);
  const target = documents.find((document) => document.hash === hash);
  if (target && !target.mapped) {
    const { readPdfOrder } = await import("../pdf-order-reader");
    const sources: Array<{ hash: string; codes: string[] }> = [];
    // Old multi-PDF imports used global product indexes, but did not store a source link.
    // Re-read the immutable originals; the RPC verifies every index/code against the saved manifest.
    for (const document of documents.filter((document) => document.initial)) {
      if (!document.url) throw new Error("No se pudo leer un PDF original para identificar sus imágenes. No se eliminó nada.");
      const response = await fetch(document.url);
      if (!response.ok) throw new Error("No se pudo descargar el PDF original. No se eliminó nada.");
      const preview = await readPdfOrder(new File([await response.blob()], document.filename, { type: "application/pdf" }), new AbortController().signal, () => {});
      try {
        if (preview.hash !== document.hash) throw new Error("El PDF no coincide con el original. No se eliminó nada.");
        sources.push({ hash: document.hash, codes: preview.products.map((product) => product.code) });
      } finally { preview.dispose(); }
    }
    const linked = await client.rpc("link_legacy_pdf_images", { requested_order_id: orderId, requested_sources: sources });
    if (linked.error) throw new Error("No se pudieron identificar con certeza las imágenes del PDF. No se eliminó nada.");
  }
  const result = await client.rpc("soft_delete_order_pdf_document", { requested_order_id: orderId, requested_hash: hash });
  if (result.error) throw new Error("No se pudo quitar el PDF y sus imágenes. Revisá que la importación original esté completa e intentá nuevamente.");
  if (!Array.isArray(result.data)) throw new Error("No se pudo confirmar la eliminación del PDF.");
  return result.data as string[];
}
