"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { Order } from "../../../lib/orders";
import { SpinnerIcon, TrashIcon } from "../icons";
import { ui } from "./shared";
import { useOrdersWorkspace } from "./use-orders-workspace";

export function DeleteOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { deleteOrder } = useOrdersWorkspace();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      if (await deleteOrder(order.id)) setOpen(false);
      else setError("No se pudo eliminar el pedido. No cambió nada; intentá nuevamente.");
    } catch {
      setError("No se pudo eliminar el pedido. Intentá nuevamente.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next, details) => { if (inFlight.current) details.cancel(); else setOpen(next); }} onOpenChangeComplete={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#14251e]/45 backdrop-blur-[3px] transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup initialFocus={cancelRef} className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh_-_32px)] w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e2e7e3] bg-white p-5 shadow-2xl outline-none transition-[opacity,scale] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none">
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-[#fff0ec] text-[#a34e42]"><TrashIcon /></span>
          <Dialog.Title className="text-lg font-semibold">¿Eliminar este pedido?</Dialog.Title>
          <p className="mt-2 break-words text-sm font-medium">{order.clientName}</p>
          <p className="mt-1 break-all text-xs text-[#68726d]">{order.code}</p>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-[#68726d]">Dejará de aparecer en la aplicación. Sus datos e imágenes se conservarán en Supabase y podrán recuperarse desde allí.</Dialog.Description>
          {error && <p role="alert" className="mt-3 text-sm text-[#a34e42]">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close ref={cancelRef} disabled={saving} className={ui.secondaryButton}>Cancelar</Dialog.Close>
            <button type="button" disabled={saving} onClick={() => void confirm()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a34e42] px-4 text-xs font-semibold text-white hover:bg-[#873f36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a34e42] disabled:opacity-50">{saving ? <SpinnerIcon className="animate-spin" /> : <TrashIcon />}{saving ? "Eliminando…" : "Eliminar pedido"}</button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
