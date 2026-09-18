"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { OrderImage } from "../../../lib/orders";
import { SpinnerIcon, TrashIcon } from "../icons";
import { ui } from "./shared";

export function DeleteImageDialog({ image, orderCode, onDelete, onClose }: {
  image: OrderImage; orderCode: string; onDelete: (imageId: string) => Promise<boolean>; onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      if (await onDelete(image.id)) setOpen(false);
      else setError("No se pudo eliminar la imagen. Revisá el aviso e intentá nuevamente.");
    } catch { setError("No se pudo eliminar la imagen. Intentá nuevamente."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next, details) => { if (inFlight.current) details.cancel(); else setOpen(next); }} onOpenChangeComplete={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#14251e]/45 backdrop-blur-[3px]" />
        <Dialog.Popup initialFocus={cancelRef} className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh_-_32px)] w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e2e7e3] bg-white p-5 shadow-2xl outline-none">
          <Dialog.Title className="text-lg font-semibold">¿Eliminar esta imagen?</Dialog.Title>
          {image.previewUrl && <div role="img" aria-label={image.name} className="mt-4 h-44 rounded-xl bg-[#f3f5f2] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${image.previewUrl}")` }} />}
          <p className="mt-3 break-all text-sm font-medium">{image.name}</p>
          <p className="mt-1 text-xs text-[#68726d]">{orderCode}</p>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-[#68726d]">Se quitará esta imagen del pedido. El pedido y las demás imágenes se conservarán.</Dialog.Description>
          {error && <p role="alert" className="mt-3 text-sm text-[#a34e42]">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close ref={cancelRef} disabled={saving} className={ui.secondaryButton}>Cancelar</Dialog.Close>
            <button type="button" disabled={saving} onClick={() => void confirm()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a34e42] px-4 text-xs font-semibold text-white hover:bg-[#873f36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a34e42] disabled:opacity-50">
              {saving ? <SpinnerIcon className="animate-spin" /> : <TrashIcon />}{saving ? "Eliminando…" : "Eliminar imagen"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
