"use client";

import { useRef, useState } from "react";
import { isOrderActive, type Order, type OrderStatus } from "../../../lib/orders";
import type { OrderDetailsInput } from "../../../lib/supabase/orders-repository";
import { BackIcon, EditIcon, ImageIcon, SaveIcon, TrashIcon, UploadIcon } from "../icons";
import { formatCurrency, statuses, ui } from "./shared";

export function OrderPage({
  order,
  onClose,
  onStatusChange,
  onAddImages,
  onEdit,
  onDelete,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onAddImages: (files: File[]) => Promise<boolean>;
  onEdit: (input: OrderDetailsInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clientName, setClientName] = useState(order.clientName);
  const [contactName, setContactName] = useState(order.contactName ?? "");
  const [whatsapp, setWhatsapp] = useState(order.whatsapp ?? "");
  const [notes, setNotes] = useState(order.notes);
  const canAddImages = isOrderActive(order.status);

  async function addImages(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    await onAddImages(files);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function startEditing() {
    setClientName(order.clientName);
    setContactName(order.contactName ?? "");
    setWhatsapp(order.whatsapp ?? "");
    setNotes(order.notes);
    setConfirmingDelete(false);
    setEditing(true);
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!clientName.trim() || saving) return;
    setSaving(true);
    const saved = await onEdit({
      clientName: clientName.trim(),
      contactName: contactName.trim(),
      whatsapp: whatsapp.trim(),
      notes: notes.trim(),
    });
    setSaving(false);
    if (saved) setEditing(false);
  }

  async function deleteOrder() {
    if (deleting) return;
    setDeleting(true);
    const deleted = await onDelete();
    if (!deleted) setDeleting(false);
  }

  return (
    <section className={ui.pagePanel} aria-labelledby="order-title">
      <button className={ui.backButton} type="button" onClick={onClose}><BackIcon /> Volver</button>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}>
          <div>
            <p className={ui.eyebrow}>{order.code}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="order-title">{order.clientName}</h2>
              {order.sourceSystem && <span className="rounded-full bg-[#e8f0eb] px-2.5 py-1 text-[9px] font-bold tracking-[.06em] text-[#235c4c]">{order.sourceSystem}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className={ui.secondaryButton} disabled={editing || deleting} onClick={startEditing} type="button">
              <EditIcon /><span className="max-[480px]:sr-only">Editar</span>
            </button>
            <button
              className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#ead7d3] bg-white px-3.5 text-xs font-semibold text-[#a34e42] transition-colors hover:bg-[#fff5f3] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4"
              disabled={deleting}
              onClick={() => { setEditing(false); setConfirmingDelete(true); }}
              type="button"
            >
              <TrashIcon /><span className="max-[480px]:sr-only">Eliminar</span>
            </button>
          </div>
        </div>
        {confirmingDelete && (
          <div className="mb-5 rounded-lg border border-[#ead7d3] bg-[#fff7f5] p-4">
            <strong className="block text-xs font-semibold text-[#873f36]">¿Eliminar {order.code}?</strong>
            <p className="mt-1 text-[10px] leading-relaxed text-[#876760]">Dejará de aparecer en la aplicación, pero sus datos e imágenes podrán recuperarse desde Supabase.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className={ui.secondaryButton} disabled={deleting} onClick={() => setConfirmingDelete(false)} type="button">Cancelar</button>
              <button className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#a34e42] px-4 text-xs font-semibold text-white hover:bg-[#873f36] disabled:cursor-not-allowed disabled:opacity-50" disabled={deleting} onClick={() => void deleteOrder()} type="button">
                <TrashIcon />{deleting ? "Eliminando..." : "Eliminar pedido"}
              </button>
            </div>
          </div>
        )}
        <div className={ui.orderContent}>
          <label className={ui.field}>
            <span>Estado</span>
            <select value={order.status} onChange={(event) => onStatusChange(event.target.value as OrderStatus)}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          {editing && (
            <form className="rounded-lg border border-[#dfe3df] bg-[#fafbf9] p-4" onSubmit={saveDetails}>
              <div className="mb-4">
                <strong className="text-xs font-semibold">Editar pedido</strong>
                <p className="mt-1 text-[10px] text-[#75807b]">El código y las imágenes no se modificarán.</p>
              </div>
              <label className={ui.field}>
                <span>Cliente / carpeta</span>
                <input maxLength={80} onChange={(event) => setClientName(event.target.value)} required value={clientName} />
              </label>
              <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1 max-[520px]:gap-0">
                <label className={ui.field}>
                  <span>Contacto</span>
                  <input maxLength={120} onChange={(event) => setContactName(event.target.value)} placeholder="Nombre del contacto" value={contactName} />
                </label>
                <label className={ui.field}>
                  <span>WhatsApp</span>
                  <input inputMode="tel" maxLength={40} onChange={(event) => setWhatsapp(event.target.value)} placeholder="Número de WhatsApp" value={whatsapp} />
                </label>
              </div>
              <label className={ui.field}>
                <span>Notas</span>
                <textarea maxLength={5000} onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} />
              </label>
              <div className="flex justify-end gap-2">
                <button className={ui.secondaryButton} disabled={saving} onClick={() => setEditing(false)} type="button">Cancelar</button>
                <button className={ui.primaryButton} disabled={saving || !clientName.trim()} type="submit"><SaveIcon />{saving ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </form>
          )}
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void addImages(Array.from(event.target.files ?? []))} />
          <button className={`${ui.primaryButton} w-full`} disabled={uploading || !canAddImages} onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            {uploading ? "Subiendo..." : canAddImages ? "Agregar imágenes" : "Pedido cerrado"}
          </button>
          <div className={`${ui.safetyNote} -mt-2`}><span>✓</span><p><strong>Destino confirmado</strong>Las imágenes se vinculan a {order.code} mediante su ID.</p></div>
          {!editing && (order.sourceSystem || order.contactName || order.whatsapp) && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#e4e7e3] bg-[#fafbf9] p-3 max-[480px]:grid-cols-1">
              <div className={ui.detailBlock}><span>Contacto</span><p>{order.contactName || "Sin nombre de contacto"}</p></div>
              <div className={ui.detailBlock}><span>WhatsApp</span><p>{order.whatsapp || "Sin número registrado"}</p></div>
            </div>
          )}
          {!editing && <div className={ui.detailBlock}><span>Notas</span><p>{order.notes || "Sin notas para este pedido."}</p></div>}
          {(order.items?.length ?? 0) > 0 && (
            <div className={ui.detailBlock}>
              <div className={ui.detailTitle}>
                <span>Artículos de MAVA STOCK</span>
                <small>{order.items?.length} unidades</small>
              </div>
              <div className="divide-y divide-[#e7e9e6] overflow-hidden rounded-lg border border-[#e4e7e3] bg-white">
                {order.items?.map((item, index) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3" key={`${item.id}-${index}`}>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs font-semibold">{item.code}</strong>
                      <small className="mt-1 block text-[9px] leading-relaxed text-[#75807b]">{item.name} · {item.size}{item.backgroundLabel ? ` · ${item.backgroundLabel}` : ""}</small>
                    </span>
                    <strong className="text-xs font-semibold text-[#34413c]">{formatCurrency(item.price)}</strong>
                  </div>
                ))}
                {order.total !== undefined && (
                  <div className="flex items-center justify-between bg-[#f5f7f5] p-3 text-xs">
                    <strong>Total</strong>
                    <strong>{formatCurrency(order.total)}</strong>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={ui.detailBlock}>
            <div className={ui.detailTitle}><span>Imágenes</span><small>{order.images.length} archivos</small></div>
            <div className={ui.imageGrid}>
              {order.images.map((image, index) => (
                <div
                  className={`${ui.imageTile} ${image.previewUrl ? ui.imagePreview : ""}`}
                  key={image.id}
                  style={image.previewUrl ? { backgroundImage: `url("${image.previewUrl}")` } : index === 0 ? { background: order.cover } : undefined}
                >
                  {!image.previewUrl && <ImageIcon />}
                  <small>{image.name}</small>
                  <time dateTime={image.addedAt}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(image.addedAt))}</time>
                </div>
              ))}
              {!order.images.length && <div className={ui.detailEmpty}>Todavía no hay imágenes.</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
