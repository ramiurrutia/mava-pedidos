"use client";

import { useState } from "react";
import type { PendingImageUpload } from "../../../lib/orders";
import { ArrowIcon, BackIcon } from "../icons";
import { LocalImagePreview } from "./local-image-preview";
import { ui } from "./shared";

export function ImageDescriptionEditor({
  uploads,
  onChange,
}: {
  uploads: PendingImageUpload[];
  onChange: (uploads: PendingImageUpload[]) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentIndex = Math.min(selectedIndex, Math.max(uploads.length - 1, 0));
  const current = uploads[currentIndex];

  if (!current) return null;

  function updateDescription(description: string) {
    onChange(uploads.map((upload, index) => (
      index === currentIndex ? { ...upload, description } : upload
    )));
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <strong className="block text-xs font-semibold">Descripción de la imagen</strong>
          <span className="mt-1 block text-[10px] text-[#75807b]">Imagen {currentIndex + 1} de {uploads.length}</span>
        </div>
        <span className="rounded-full bg-[#edf3ef] px-2.5 py-1.5 text-[9px] font-semibold text-[#235c4c]">
          {uploads.filter((upload) => upload.description.trim()).length}/{uploads.length} con nota
        </span>
      </div>

      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-[#202825]">
        <LocalImagePreview alt={current.file.name} file={current.file} />
      </div>

      <label className={`${ui.field} mb-0`}>
        <span>Nota de esta imagen</span>
        <textarea
          autoFocus
          maxLength={1000}
          onChange={(event) => updateDescription(event.target.value)}
          placeholder="Escribir descripción"
          rows={4}
          value={current.description}
        />
        <small className="text-right text-[9px] text-[#8b9490]">{current.description.length}/1000</small>
      </label>

      {uploads.length > 1 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <button className={ui.secondaryButton} disabled={currentIndex === 0} onClick={() => setSelectedIndex(currentIndex - 1)} type="button">
              <BackIcon />Anterior
            </button>
            <button className={ui.secondaryButton} disabled={currentIndex === uploads.length - 1} onClick={() => setSelectedIndex(currentIndex + 1)} type="button">
              Siguiente<ArrowIcon />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {uploads.map((upload, index) => (
              <button
                aria-label={`Editar descripción de ${upload.file.name}`}
                className={`${index === currentIndex ? "ring-2 ring-[#235c4c] ring-offset-2" : "opacity-65 hover:opacity-100"} relative size-14 shrink-0 overflow-hidden rounded-lg bg-[#e8ece9] transition`}
                key={`${upload.file.name}-${upload.file.lastModified}-${index}`}
                onClick={() => setSelectedIndex(index)}
                type="button"
              >
                <LocalImagePreview alt="" file={upload.file} />
                {upload.description.trim() && <i className="absolute right-1 top-1 size-2 rounded-full border border-white bg-[#3f8a69]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
