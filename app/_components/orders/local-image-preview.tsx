"use client";

import { useCallback } from "react";
import type { PendingImageUpload } from "../../../lib/orders";

export function LocalImagePreview({ file, alt }: { file: File; alt: string }) {
  const attachPreview = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    const objectUrl = URL.createObjectURL(file);
    element.style.backgroundImage = `url("${objectUrl}")`;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <span
      aria-label={alt || undefined}
      className="absolute inset-0 bg-contain bg-center bg-no-repeat"
      ref={attachPreview}
      role={alt ? "img" : undefined}
    />
  );
}

export function SelectedImageThumbnails({ uploads }: { uploads: PendingImageUpload[] }) {
  return (
    <div aria-label="Imágenes seleccionadas" className="mt-3 flex gap-2 overflow-x-auto px-0.5 pb-1 pt-0.5">
      {uploads.map(({ file }, index) => (
        <div
          className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-[#dfe5e1] bg-[#edf1ee]"
          key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
          title={file.name}
        >
          <LocalImagePreview alt={file.name} file={file} />
          <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-[#1d2b26]/80 text-[8px] font-semibold text-white">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}
