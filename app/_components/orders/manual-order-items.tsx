"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import type { ArtworkPreparationStatus, ManualItemDetails, ManualOrderItem } from "../../../lib/orders";
import { BoxIcon, CheckIcon, EditIcon, PlusIcon, SpinnerIcon, TrashIcon } from "../icons";
import { ui } from "./shared";
import { OrderItemPresence, type OrderItemRow } from "./order-item-presence";

export function ManualOrderItems({ items, imageItems = [], canAdd, onSave, onDelete, onStatusChange }: {
  items: ManualOrderItem[]; canAdd: boolean;
  imageItems?: OrderItemRow[];
  onSave: (details: ManualItemDetails, itemId?: string) => Promise<boolean>;
  onDelete: (itemId: string) => Promise<boolean>;
  onStatusChange: (key: string, status: ArtworkPreparationStatus) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<ManualOrderItem | "new" | null>(null);
  const [details, setDetails] = useState<ManualItemDetails>({ title: "", description: "", quantity: 1 });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editorId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const focusTitle = useCallback((input: HTMLInputElement | null) => input?.focus({ preventScroll: true }), []);
  const focusAddButton = useCallback(() => addButton.current?.focus({ preventScroll: true }), []);

  function closeEditor() {
    setEditing(null);
    addButton.current?.focus({ preventScroll: true });
  }

  function startEditing(item?: ManualOrderItem) {
    setEditing(item ?? "new");
    setDetails(item ? { title: item.title, description: item.description, quantity: item.quantity } : { title: "", description: "", quantity: 1 });
    setError(""); setDeletingId(null);
  }

  async function run(action: () => Promise<boolean>, done: () => void) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (await action()) done();
      else setError("No se pudo guardar el cambio. Revisá el aviso e intentá nuevamente.");
    } catch { setError("No se pudo guardar el cambio. Intentá nuevamente."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function renderManualItem(item: ManualOrderItem) {
    return (<li key={item.id} className="manual-item-enter grid gap-3 p-4">
          <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-20 shrink-0 place-items-center rounded-lg border border-dashed border-[#dfe5df] bg-[#f5f7f5] text-[#87908c] sm:size-24 [&_svg]:size-6"><BoxIcon /></span>
          <div className="min-w-0 flex-1"><strong className="block text-sm [overflow-wrap:anywhere]">{item.title}</strong><span className="mt-1 block text-xs text-[#68736d]">Cantidad: {item.quantity}</span>
            {item.description && <p className="mt-2! whitespace-pre-wrap [overflow-wrap:anywhere]">{item.description}</p>}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-label={`Editar ${item.title}`} title="Editar ítem" className="grid size-11 place-items-center rounded-xl text-[#68736d] transition-colors hover:bg-[#f0f4f0] focus-visible:outline-2 focus-visible:outline-[#235c4c] disabled:opacity-50 [&_svg]:size-4" disabled={busy || !canAdd || editing !== null} onClick={() => startEditing(item)}><EditIcon /></button>
            <button type="button" aria-label={`Marcar ${item.title} como ${item.preparationStatus === "Listo" ? "pendiente" : "listo"}`} aria-pressed={item.preparationStatus === "Listo"}
              title={item.preparationStatus === "Listo" ? "Listo · Volver a pendiente" : "Marcar listo"}
              className={`grid size-11 shrink-0 place-items-center rounded-xl border [&_svg]:size-5 ${item.preparationStatus === "Listo" ? "border-[#a8cbb6] bg-[#edf7f0] text-[#276146]" : "border-[#dfc9a2] bg-[#fff9ed] text-[#875d21]"} disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c]`}
              disabled={busy} onClick={() => void run(() => onStatusChange(`manual:${item.id}`, item.preparationStatus === "Listo" ? "Pendiente" : "Listo"), () => {})}>
              {item.preparationStatus === "Listo" ? <CheckIcon /> : <span aria-hidden="true" className="size-5 rounded-full border-2 border-current" />}
            </button>
            <button type="button" title="Eliminar ítem" aria-label={`Eliminar ${item.title}`} className="ml-auto grid size-11 place-items-center rounded-xl text-[#9a7168] transition-colors hover:bg-[#fff3f0] hover:text-[#a34e42] focus-visible:outline-2 focus-visible:outline-[#a34e42] disabled:opacity-50 [&_svg]:size-4" disabled={busy || editing !== null} onClick={() => { setDeletingId(item.id); setError(""); }}><TrashIcon /></button>
          </div>
          {deletingId === item.id && <div role="group" aria-label={`Confirmar eliminación de ${item.title}`} className="rounded-lg bg-[#fff3f0] p-3">
            <p>¿Eliminar este ítem del pedido?</p><div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={ui.secondaryButton} disabled={busy} onClick={() => setDeletingId(null)}>Cancelar</button>
              <button type="button" className={ui.secondaryButton} disabled={busy} onClick={() => void run(() => onDelete(item.id), () => setDeletingId(null))}>{busy ? <SpinnerIcon className="animate-spin" /> : <TrashIcon />}Eliminar ítem</button>
            </div>
          </div>}
        </li>);
  }

  const rows = [...imageItems, ...items.map((item) => ({ id: `manual:${item.id}`, addedAt: item.addedAt, content: renderManualItem(item) }))]
    .sort((left, right) => Date.parse(right.addedAt) - Date.parse(left.addedAt));

  return (
    <section className={ui.detailBlock} aria-label="Ítems del pedido">
      <div className={`${ui.detailTitle} flex-wrap items-center gap-2`}>
        <h3 className="text-sm font-semibold text-[#29352f]">Ítems del pedido <span className="ml-1 text-xs font-normal text-[#79837c]">{rows.length}</span></h3>
        <button ref={addButton} type="button" className={ui.secondaryButton} aria-expanded={editing !== null} aria-controls={editorId} disabled={!canAdd || busy || editing !== null} onClick={() => startEditing()}>
          <PlusIcon />Agregar ítem sin imagen
        </button>
      </div>
      <Collapsible.Root open={editing !== null}>
      <Collapsible.Panel id={editorId} className="manual-item-panel">
      <form className="grid gap-3 rounded-xl border border-[#dfe5e1] bg-[#fafbf9] p-4" onSubmit={(event) => {
        event.preventDefault();
        if (!canAdd || editing === null) return;
        void run(() => onSave(details, editing === "new" ? undefined : editing.id), closeEditor);
      }}>
        <h3 className="text-sm font-semibold">{editing === "new" ? "Nuevo ítem sin imagen" : "Editar ítem"}</h3>
        <label className={ui.field}><span>Título</span><input ref={focusTitle} required maxLength={120} placeholder="Ej.: Espejo" value={details.title} disabled={busy || !canAdd} onChange={(event) => setDetails({ ...details, title: event.target.value })} /></label>
        <label className={ui.field}><span>Cantidad</span><input required type="number" min={1} max={200} step={1} value={Number.isNaN(details.quantity) ? "" : details.quantity} disabled={busy || !canAdd} onChange={(event) => setDetails({ ...details, quantity: event.target.valueAsNumber })} /></label>
        <label className={ui.field}><span>Descripción</span><textarea rows={3} maxLength={1000} placeholder="Medidas, marco y otros detalles" value={details.description} disabled={busy || !canAdd} onChange={(event) => setDetails({ ...details, description: event.target.value })} /></label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={ui.secondaryButton} disabled={busy} onClick={() => { closeEditor(); setError(""); }}>Cancelar</button>
          <button type="submit" className={ui.primaryButton} disabled={busy || !canAdd || !details.title.trim() || !Number.isInteger(details.quantity) || details.quantity < 1 || details.quantity > 200}>
            {busy ? <SpinnerIcon className="animate-spin" /> : <CheckIcon />}Guardar ítem
          </button>
        </div>
      </form>
      </Collapsible.Panel>
      </Collapsible.Root>
      <ul aria-label="Ítems del pedido" className="divide-y divide-[#e7e9e6] overflow-hidden rounded-lg border border-[#e4e7e3] bg-white">
        <OrderItemPresence rows={rows} onFocusFallback={focusAddButton} />
      </ul>
      {error && <p role="alert" className="text-xs text-[#a34e42]!">{error}</p>}
    </section>
  );
}
