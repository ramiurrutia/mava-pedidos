import type { PdfOrderPreview } from "./pdf-order-reader";

export type DocumentOrderPreview = PdfOrderPreview & { format: "PDF" | "EXCEL"; sheets?: string[] };

export async function readDocumentOrder(file: File, signal: AbortSignal, onProgress: (message: string) => void): Promise<DocumentOrderPreview> {
  if (/\.pdf$/i.test(file.name)) {
    const { readPdfOrder } = await import("./pdf-order-reader");
    return { ...await readPdfOrder(file, signal, onProgress), format: "PDF" };
  }
  if (/\.xlsx$/i.test(file.name)) {
    const { readExcelOrder } = await import("./excel-order-reader");
    return readExcelOrder(file, signal, onProgress);
  }
  throw new Error("Elegí un PDF o un Excel .xlsx. Si tenés un .xls, guardalo como .xlsx desde Excel.");
}
