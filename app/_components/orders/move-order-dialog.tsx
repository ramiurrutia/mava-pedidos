"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { getOrderFolderId, isMavaStockOrder, MAVA_STOCK_FOLDER_ID, MAVA_STOCK_SOURCE, type Order } from "../../../lib/orders";
import { CheckIcon, CloseIcon, FolderIcon, SearchIcon, SpinnerIcon } from "../icons";
import { useOrdersWorkspace } from "./use-orders-workspace";
import { ui } from "./shared";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").trim();

export function MoveOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { folders, orders, moveOrder } = useOrdersWorkspace();
  // Keep the dialog mounted until the closing transition finishes.
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [currentId] = useState(() => getOrderFolderId(order));
  const [currentName] = useState(() => currentId === MAVA_STOCK_FOLDER_ID ? MAVA_STOCK_SOURCE : folders.find((folder) => folder.id === currentId)?.name ?? order.folderName ?? order.clientName);
  const destinations = [
    ...folders,
    ...(isMavaStockOrder(order) ? [{ id: MAVA_STOCK_FOLDER_ID, name: MAVA_STOCK_SOURCE }] : []),
  ].filter((folder) => folder.id !== currentId).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const visibleFolders = destinations.filter((folder) => normalize(folder.name).includes(normalize(query)));
  const selectedFolder = destinations.find((folder) => folder.id === selected);
  const counts = new Map<string, number>();
  for (const item of orders) {
    const id = getOrderFolderId(item);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={(next, details) => {
      if (saving) details.cancel();
      else setOpen(next);
    }} onOpenChangeComplete={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#14251e]/45 backdrop-blur-[3px] transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup initialFocus={titleRef} className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh_-_32px)] w-[calc(100%_-_32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#e2e7e3] bg-white shadow-2xl outline-none transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none">
          <div className="flex shrink-0 items-start gap-3 border-b border-[#e7ebe7] px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf3ef] text-[#235c4c]"><FolderIcon /></span>
            <div className="min-w-0 flex-1">
              <Dialog.Title ref={titleRef} tabIndex={-1} className="text-base font-semibold outline-none">Mover pedido</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-[#68726d]">Elegí dónde guardar el pedido de <span className="font-medium text-[#35433b]">{order.clientName}</span>.</Dialog.Description>
            </div>
            <Dialog.Close disabled={saving} aria-label="Cerrar" className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-xl text-[#68726d] hover:bg-[#f1f4f1] focus-visible:outline-2 focus-visible:outline-[#235c4c] disabled:opacity-40"><CloseIcon /></Dialog.Close>
          </div>
          <form className="flex min-h-0 flex-1 flex-col" aria-busy={saving} onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedFolder || saving) return;
            setSaving(true);
            setError("");
            const success = await moveOrder(order.id, selectedFolder.id);
            setSaving(false);
            if (success) setOpen(false);
            else setError("No se pudo mover. El pedido sigue en su carpeta original. Intentá nuevamente.");
          }}>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
              <p className="break-all text-[11px] text-[#7b8580]">{order.code}</p>
              <p className="mb-4 mt-1 text-xs text-[#68726d]">Carpeta actual: <strong className="font-medium text-[#35433b]">{currentName.toLocaleUpperCase("es")}</strong></p>
              <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe5df] px-3 text-[#68726d] focus-within:border-[#82a092] focus-within:ring-2 focus-within:ring-[#e4eee8]">
                <SearchIcon />
                <span className="sr-only">Buscar carpeta de destino</span>
                <input type="text" value={query} disabled={saving} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar carpeta…" className="min-w-0 flex-1 bg-transparent py-2 text-base text-[#202825] outline-none sm:text-sm" />
                {query && <button type="button" disabled={saving} aria-label="Limpiar búsqueda de carpetas" onClick={() => setQuery("")} className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-[#edf3ef] focus-visible:outline-2"><CloseIcon /></button>}
              </label>
              <fieldset disabled={saving} className="min-w-0">
                <legend className="mb-2 text-xs font-medium text-[#68726d]">Carpeta de destino</legend>
                <div className="space-y-1 p-1">
                  {visibleFolders.map((folder) => {
                    const count = counts.get(folder.id) ?? 0;
                    return (
                      <label key={folder.id} className={`relative flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-[#235c4c] ${selected === folder.id ? "border-[#8dad9b] bg-[#edf5ef]" : "border-transparent bg-[#f7f9f7] hover:bg-[#eef2ee]"} ${saving ? "pointer-events-none opacity-60" : ""}`}>
                        <input type="radio" name="destination" value={folder.id} checked={selected === folder.id} onChange={() => { setSelected(folder.id); setError(""); }} className="sr-only" />
                        <FolderIcon className="size-5 shrink-0 text-[#46705b]" />
                        <span className="min-w-0 flex-1"><strong className="block break-words text-sm font-medium">{folder.name.toLocaleUpperCase("es")}</strong><small className="mt-0.5 block text-xs text-[#68726d]">{count ? `${count} pedido${count === 1 ? "" : "s"}` : "Carpeta vacía"}</small></span>
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected === folder.id ? "border-[#235c4c] bg-[#235c4c] text-white" : "border-[#c8d2ca]"}`} aria-hidden="true">{selected === folder.id && <CheckIcon className="size-3" />}</span>
                      </label>
                    );
                  })}
                  {!visibleFolders.length && <p className="rounded-xl bg-[#f7f9f7] px-4 py-6 text-center text-sm leading-relaxed text-[#68726d]">{destinations.length ? "No encontramos esa carpeta. Probá con otro nombre." : "Todavía no hay otra carpeta. Las carpetas se crean al guardar un pedido para otro cliente."}</p>}
                </div>
              </fieldset>
            </div>
            <div className="shrink-0 border-t border-[#e7ebe7] bg-[#fafbf9] px-5 py-4">
              <p aria-live="polite" className="mb-1 text-xs leading-relaxed text-[#35433b]">{selectedFolder ? <>Destino: <strong>{selectedFolder.name.toLocaleUpperCase("es")}</strong></> : "Seleccioná una carpeta para continuar."}</p>
              <p className="mb-4 text-[11px] leading-relaxed text-[#68726d]">El cliente, las imágenes y el origen del pedido no cambian.</p>
              {error && <p role="alert" className="mb-3 text-xs text-[#a44236]">{error}</p>}
              <div className="flex gap-2 sm:justify-end">
                <Dialog.Close className={`${ui.secondaryButton} flex-1 sm:flex-none`} disabled={saving}>Cancelar</Dialog.Close>
                <button className={`${ui.primaryButton} flex-1 whitespace-nowrap !px-3 sm:flex-none`} type="submit" disabled={!selectedFolder || saving}>{saving ? <SpinnerIcon className="animate-spin" /> : <FolderIcon />}{saving ? "Moviendo…" : "Mover"}</button>
              </div>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
