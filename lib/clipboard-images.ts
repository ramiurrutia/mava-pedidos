const extensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/svg+xml": "svg",
};

export function pastedImageFile(blob: Blob, index = 0): File {
  if (blob instanceof File && blob.name && blob.name !== "image.png") return blob;
  return new File([blob], `imagen-pegada-${Date.now()}-${index + 1}.${extensions[blob.type] ?? "png"}`, { type: blob.type });
}

export function imagesFromPaste(data: DataTransfer): File[] {
  return Array.from(data.files).filter((file) => file.type.startsWith("image/")).map(pastedImageFile);
}

export async function readClipboardImages(clipboard: Pick<Clipboard, "read">): Promise<File[]> {
  const items = await clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    // One image may have multiple representations. Add it only once.
    const type = item.types.includes("image/png") ? "image/png" : item.types.find((type) => type.startsWith("image/"));
    if (type) files.push(pastedImageFile(await item.getType(type), files.length));
  }
  return files;
}
