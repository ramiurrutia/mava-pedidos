import type { DocumentOrderPreview } from "./document-order-reader";

export type DocumentBatchPreview = DocumentOrderPreview & { documents: DocumentOrderPreview[] };
export const MAX_ORDER_PDFS = 10;

export function validateDocumentSelection(files: File[]) {
  if (!files.length) throw new Error("Elegí los PDFs del pedido o un archivo Excel.");
  if (files.length > MAX_ORDER_PDFS) throw new Error("No se pueden agregar tantos archivos al mismo pedido. Quitá algunos e intentá nuevamente.");
  if (files.length > 1 && files.some((file) => !/\.pdf$/i.test(file.name))) {
    throw new Error("Para combinar varios archivos, todos deben ser PDFs. El Excel se importa por separado.");
  }
}

export async function combineDocumentPreviews(documents: DocumentOrderPreview[]): Promise<DocumentBatchPreview> {
  validateDocumentSelection(documents.map((document) => document.file));
  const sorted = [...documents].sort((a, b) => a.hash.localeCompare(b.hash));
  if (new Set(sorted.map((document) => document.hash)).size !== sorted.length) {
    throw new Error("Ese PDF ya está seleccionado. No hace falta agregarlo dos veces.");
  }
  const first = sorted[0];
  const hash = sorted.length === 1 ? first.hash : [...new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`pdf-batch:${sorted.map((document) => document.hash).join("|")}`),
  ))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const warnings = sorted.flatMap((document) => document.warnings.map((warning) => `${document.file.name}: ${warning}`));
  if (new Set(sorted.map((document) => document.clientName.trim().toLocaleLowerCase("es"))).size > 1) {
    warnings.push("Los PDFs muestran nombres de cliente diferentes. Revisá que pertenezcan al mismo pedido.");
  }
  return {
    ...first, hash, documents: sorted,
    products: sorted.flatMap((document) => document.products.map((product) => ({
      ...product, key: `${document.hash}:${product.key}`, sourceFilename: document.file.name,
    }))),
    pages: sorted.flatMap((document) => document.pages), warnings,
    declaredTotal: sorted.every((document) => document.declaredTotal !== null)
      ? sorted.reduce((sum, document) => sum + document.declaredTotal!, 0) : null,
    dispose: () => sorted.forEach((document) => document.dispose()),
  };
}
