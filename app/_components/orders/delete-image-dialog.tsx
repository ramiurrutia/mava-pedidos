"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { OrderImage } from "../../../lib/orders";
import { CheckIcon, ImageIcon, SpinnerIcon, TrashIcon } from "../icons";
import { ui } from "./shared";

export function DeleteImageDialog({ image, orderCode, onDelete, onClose }: {
  image: OrderImage; orderCode: string; onDelete: (imageId: string) => Promise<boolean>; onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<"idle" | "deleting" | "deleted">("idle");
  const saving = phase !== "idle";
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase !== "deleted") return;
    // Keep the successful result visible briefly before closing the dialog.
    const timer = window.setTimeout(() => setOpen(false), 1200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  async function confirm() {
    if (inFlight.current || phase !== "idle") return;
    inFlight.current = true; setPhase("deleting"); setError("");
    let deleted = false;
    try {
      deleted = await onDelete(image.id);
      if (deleted) setPhase("deleted");
      else setError("No se pudo eliminar la imagen. Revisá el aviso e intentá nuevamente.");
    } catch { setError("No se pudo eliminar la imagen. Intentá nuevamente."); }
    finally { inFlight.current = false; if (!deleted) setPhase("idle"); }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next, details) => { if (inFlight.current) details.cancel(); else setOpen(next); }} onOpenChangeComplete={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#14251e]/45 backdrop-blur-[3px] transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup initialFocus={cancelRef} className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh_-_32px)] w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e2e7e3] bg-white p-5 shadow-2xl outline-none transition-[opacity,scale] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none">
          <Dialog.Title className="text-lg font-semibold">{phase === "deleted" ? "Imagen eliminada" : "¿Eliminar esta imagen?"}</Dialog.Title>
          <div className="relative mt-4 h-44 overflow-hidden rounded-xl bg-[#f3f5f2]">
            <div
              aria-hidden={saving || undefined}
              aria-label={image.title || image.name}
              role="img"
              className={`${phase === "deleted" ? "translate-y-5 scale-75 opacity-0" : phase === "deleting" ? "scale-95 opacity-25" : "scale-100 opacity-100"} absolute inset-0 grid place-items-center bg-contain bg-center bg-no-repeat text-[#87908c] transition-[opacity,transform] duration-500 ease-in-out motion-reduce:transform-none motion-reduce:transition-none [&_svg]:size-10`}
              style={image.previewUrl ? { backgroundImage: `url("${image.previewUrl}")` } : undefined}
            >{!image.previewUrl && <ImageIcon />}</div>
            <div role="status" aria-live="polite" aria-atomic="true" className="absolute inset-0 grid place-items-center">
              {phase === "deleting" && <div className="flex flex-col items-center gap-3 text-[#a34e42]">
                <span className="grid size-12 place-items-center rounded-full bg-white shadow-sm"><SpinnerIcon aria-hidden="true" className="size-6 motion-safe:animate-spin" /></span>
                <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold">Eliminando imagen…</span>
              </div>}
              {phase === "deleted" && <div className="flex flex-col items-center gap-3 text-[#276146] motion-safe:animate-[image-delete-confirm_350ms_ease-out_both]">
                <span className="grid size-14 place-items-center rounded-full bg-[#dceee3] ring-8 ring-[#eaf4ed]"><CheckIcon aria-hidden="true" className="size-7" /></span>
                <span className="text-sm font-semibold">La imagen se quitó del pedido</span>
              </div>}
            </div>
          </div>
          <p className="mt-3 break-all text-sm font-medium">{image.title || image.name}</p>
          <p className="mt-1 text-xs text-[#68726d]">{orderCode}</p>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-[#68726d]">{phase === "deleted" ? "El pedido y las demás imágenes se conservaron." : "Se quitará esta imagen del pedido. El pedido y las demás imágenes se conservarán."}</Dialog.Description>
          {error && <p role="alert" className="mt-3 text-sm text-[#a34e42]">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close ref={cancelRef} disabled={saving} className={ui.secondaryButton}>Cancelar</Dialog.Close>
            <button type="button" disabled={saving} onClick={() => void confirm()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a34e42] px-4 text-xs font-semibold text-white hover:bg-[#873f36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a34e42] disabled:opacity-50">
              {phase === "deleted" ? <CheckIcon /> : saving ? <SpinnerIcon className="motion-safe:animate-spin" /> : <TrashIcon />}{phase === "deleted" ? "Eliminada" : saving ? "Eliminando…" : "Eliminar imagen"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
