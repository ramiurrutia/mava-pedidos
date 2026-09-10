import { parseMavaPdf, type ParsedPdfOrder, type PdfImageBox, type PdfPageData, type PdfProduct } from "./pdf-order-parser";
import type { PDFPageProxy } from "pdfjs-dist";

export type PdfProductPreview = PdfProduct & { file: File; previewUrl: string };
export type PdfOrderPreview = Omit<ParsedPdfOrder, "products"> & {
  hash: string; file: File; products: PdfProductPreview[];
  pages: Array<{ number: number; previewUrl: string }>; dispose: () => void;
};
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_UNITS = 200;

export async function readPdfOrder(file: File, signal: AbortSignal, onProgress: (message: string) => void): Promise<PdfOrderPreview> {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size < 5 || file.size > MAX_PDF_BYTES) throw new Error("Elegí un PDF de hasta 20 MB.");
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("El archivo no es un PDF válido.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  signal.throwIfAborted();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${pdfjs.version}.mjs`;
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), enableXfa: false, useWasm: false });
  const urls: string[] = [];
  const urlFor = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.push(url); return url; };
  const dispose = () => { for (const url of urls) URL.revokeObjectURL(url); urls.length = 0; };
  const abort = () => { void task.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("Este PDF tiene demasiadas páginas. El límite por pedido es de 20 páginas.");
    const structures: PdfPageData[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      onProgress(`Reconociendo página ${number} de ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const text = await page.getTextContent();
      structures.push({ number, texts: text.items.flatMap((item) => "str" in item && item.str.trim() ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }] : []), images: await imageBoxes(page, pdfjs.OPS) });
    }
    const parsed = parseMavaPdf(structures);
    if (parsed.products.length > 100 || parsed.products.reduce((sum, product) => sum + product.quantity, 0) > MAX_PDF_UNITS) throw new Error("El límite por importación es de 100 modelos o 200 cuadros.");
    const photos = new Map<string, File>();
    const pages: PdfOrderPreview["pages"] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      onProgress(`Preparando fotos y vista previa ${number} de ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, Math.sqrt(8_000_000 / (base.width * base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvas, viewport }).promise;
        for (const product of parsed.products.filter((item) => item.image?.page === number)) {
          const box = product.image!;
          const [a, b, c, d, e, f] = viewport.transform;
          const points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
          const rect = [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))];
          const x = Math.max(0, Math.floor(Math.min(rect[0], rect[2]))), y = Math.max(0, Math.floor(Math.min(rect[1], rect[3])));
          const width = Math.min(canvas.width - x, Math.ceil(Math.abs(rect[2] - rect[0]))), height = Math.min(canvas.height - y, Math.ceil(Math.abs(rect[3] - rect[1])));
          if (width < 1 || height < 1) continue;
          const crop = document.createElement("canvas"); crop.width = width; crop.height = height;
          const context = crop.getContext("2d"); if (!context) throw new Error("El navegador no pudo preparar las imágenes.");
          context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
          photos.set(product.key, new File([await jpegBlob(crop)], `${product.key}.jpg`, { type: "image/jpeg" }));
          crop.width = crop.height = 0;
        }
        const thumb = document.createElement("canvas"); thumb.width = Math.min(1000, canvas.width); thumb.height = Math.round(canvas.height * thumb.width / canvas.width);
        thumb.getContext("2d")!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
        pages.push({ number, previewUrl: urlFor(await jpegBlob(thumb)) });
        thumb.width = thumb.height = 0;
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    }
    const products: PdfProductPreview[] = [];
    for (const product of parsed.products) {
      let photo = photos.get(product.key);
      if (!photo) {
        if (product.image) parsed.warnings.push(`No se pudo preparar la foto de ${product.code}.`);
        const placeholder = document.createElement("canvas"); placeholder.width = 500; placeholder.height = 360;
        const context = placeholder.getContext("2d")!;
        context.fillStyle = "#eef3ef"; context.fillRect(0, 0, 500, 360); context.fillStyle = "#235c4c"; context.textAlign = "center";
        context.font = "bold 28px sans-serif"; context.fillText(product.code, 250, 170);
        context.font = "20px sans-serif"; context.fillText("Sin imagen extraíble del PDF", 250, 210);
        photo = new File([await jpegBlob(placeholder)], `${product.key}.jpg`, { type: "image/jpeg" });
        placeholder.width = placeholder.height = 0;
      }
      products.push({ ...product, file: photo, previewUrl: urlFor(photo) });
    }
    signal.throwIfAborted();
    return { ...parsed, products, pages, file, hash, dispose };
  } catch (error) {
    dispose();
    if (error instanceof Error && error.name === "PasswordException") throw new Error("El PDF tiene contraseña. Guardá una copia sin contraseña e intentá nuevamente.");
    throw error;
  } finally { signal.removeEventListener("abort", abort); await task.destroy(); }
}

function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo preparar la vista previa.")), "image/jpeg", 0.9));
}

async function imageBoxes(page: PDFPageProxy, ops: typeof import("pdfjs-dist").OPS): Promise<PdfImageBox[]> {
  const list = await page.getOperatorList();
  const boxes: PdfImageBox[] = [];
  let matrix = [1, 0, 0, 1, 0, 0]; const stack: number[][] = [];
  const multiply = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  for (let index = 0; index < list.fnArray.length; index++) {
    const fn = list.fnArray[index], args = list.argsArray[index];
    if (fn === ops.save) stack.push([...matrix]);
    else if (fn === ops.restore) matrix = stack.pop() ?? matrix;
    else if (fn === ops.transform) matrix = multiply(matrix, args);
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
      const xs = [matrix[4], matrix[0] + matrix[4], matrix[2] + matrix[4], matrix[0] + matrix[2] + matrix[4]];
      const ys = [matrix[5], matrix[1] + matrix[5], matrix[3] + matrix[5], matrix[1] + matrix[3] + matrix[5]];
      boxes.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
    }
  }
  return boxes;
}
