import { parseExcelOrder, type ExcelPicture } from "./excel-order-parser";
import type { DocumentOrderPreview } from "./document-order-reader";

export async function readExcelOrder(file: File, signal: AbortSignal, onProgress: (message: string) => void): Promise<DocumentOrderPreview> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Elegí un Excel .xlsx de hasta 20 MB.");
  signal.throwIfAborted();
  onProgress("Leyendo las hojas y las imágenes del Excel…");
  const buffer = await file.arrayBuffer();
  signal.throwIfAborted();
  const parsed = parseExcelOrder(new Uint8Array(buffer), file.name);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const urls: string[] = [];
  const dispose = () => { for (const url of urls) URL.revokeObjectURL(url); urls.length = 0; };
  const products: DocumentOrderPreview["products"] = [];
  try {
    for (const [index, picture] of parsed.pictures.entries()) {
      signal.throwIfAborted();
      onProgress(`Preparando imagen ${index + 1} de ${parsed.pictures.length}…`);
      const photo = await preparePhoto(picture, signal);
      const previewUrl = URL.createObjectURL(photo); urls.push(previewUrl);
      products.push({ key: picture.key, code: picture.code, description: picture.description, quantity: picture.quantity, unitPrice: picture.unitPrice, file: photo, previewUrl });
    }
    signal.throwIfAborted();
    return { format: "EXCEL", clientName: parsed.clientName, phone: parsed.phone, locality: parsed.locality, email: parsed.email, address: parsed.address,
      sheets: parsed.sheets, warnings: parsed.warnings, products, declaredTotal: null, pages: [], file, hash, dispose };
  } catch (error) { dispose(); throw error; }
}

async function preparePhoto(picture: ExcelPicture, signal: AbortSignal) {
  const blob = new Blob([new Uint8Array(picture.bytes)], { type: picture.mimeType });
  const source = URL.createObjectURL(blob);
  const image = new Image();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { image.src = ""; };
  signal.addEventListener("abort", abort, { once: true });
  const canvas = document.createElement("canvas");
  try {
    image.src = source;
    await Promise.race([image.decode(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("IMAGE_TIMEOUT")), 15000); })]);
    signal.throwIfAborted();
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("IMAGE_TOO_LARGE");
    const { left, top, right, bottom } = picture.crop;
    if ([left, top, right, bottom].some((value) => !Number.isFinite(value) || value < 0 || value >= 1) || left + right >= 1 || top + bottom >= 1) throw new Error("INVALID_CROP");
    const width = image.naturalWidth * (1 - left - right), height = image.naturalHeight * (1 - top - bottom);
    const scale = Math.min(1, 2000 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, image.naturalWidth * left, image.naturalHeight * top, width, height, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("JPEG_FAILED")), "image/jpeg", 0.92));
    return new File([jpeg], `${picture.key}.jpg`, { type: "image/jpeg" });
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(`No se pudo preparar ${picture.code} (${picture.sheet}). Convertí esa imagen a JPEG o PNG en Excel y volvé a intentarlo.`, { cause: error });
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); image.src = ""; URL.revokeObjectURL(source); canvas.width = canvas.height = 0; }
}
