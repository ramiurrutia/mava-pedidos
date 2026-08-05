"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPendingImageUploads,
  isOrderActive,
  type Order,
  type OrderImage,
  type OrderStatus,
  type PendingImageUpload,
} from "../../../lib/orders";
import type { OrderDetailsInput } from "../../../lib/supabase/orders-repository";
import { BackIcon, CloseIcon, EditIcon, ImageIcon, SaveIcon, TrashIcon, UploadIcon } from "../icons";
import { ImageDescriptionEditor } from "./image-description-editor";
import { formatCurrency, statuses, ui } from "./shared";

export function OrderPage({
  order,
  onClose,
  onStatusChange,
  onAddImages,
  onEdit,
  onEditImageDescription,
  onDelete,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onAddImages: (uploads: PendingImageUpload[]) => Promise<boolean>;
  onEdit: (input: OrderDetailsInput) => Promise<boolean>;
  onEditImageDescription: (imageId: string, description: string) => Promise<string | null>;
  onDelete: () => Promise<boolean>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingImageUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<OrderImage | null>(null);
  const [editingImageDescription, setEditingImageDescription] = useState(false);
  const [imageDescriptionDraft, setImageDescriptionDraft] = useState("");
  const [savingImageDescription, setSavingImageDescription] = useState(false);
  const [clientName, setClientName] = useState(order.clientName);
  const [contactName, setContactName] = useState(order.contactName ?? "");
  const [whatsapp, setWhatsapp] = useState(order.whatsapp ?? "");
  const [notes, setNotes] = useState(order.notes);
  const canAddImages = isOrderActive(order.status);

  const closeImageViewer = useCallback(() => {
    if (selectedImage && window.history.state?.mavaImageViewer === selectedImage.id) {
      window.history.back();
      return;
    }
    setSelectedImage(null);
  }, [selectedImage]);

  useEffect(() => {
    function closeViewerFromHistory() {
      setSelectedImage(null);
    }

    window.addEventListener("popstate", closeViewerFromHistory);
    return () => window.removeEventListener("popstate", closeViewerFromHistory);
  }, []);

  useEffect(() => {
    if (!selectedImage) return;

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeImageViewer();
    }

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [selectedImage, closeImageViewer]);

  function selectImages(files: File[]) {
    if (!files.length) return;
    setPendingUploads(createPendingImageUploads(files));
  }

  async function addImages() {
    if (!pendingUploads.length || uploading) return;
    setUploading(true);
    const uploaded = await onAddImages(pendingUploads);
    setUploading(false);
    if (!uploaded) return;

    setPendingUploads([]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function cancelImages() {
    setPendingUploads([]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function openImageViewer(image: OrderImage) {
    window.history.pushState({ ...window.history.state, mavaImageViewer: image.id }, "");
    setSelectedImage(image);
    setImageDescriptionDraft(image.description);
    setEditingImageDescription(false);
  }

  async function saveImageDescription(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedImage || savingImageDescription) return;
    setSavingImageDescription(true);
    const savedDescription = await onEditImageDescription(selectedImage.id, imageDescriptionDraft);
    setSavingImageDescription(false);
    if (savedDescription === null) return;

    setSelectedImage((currentImage) => (
      currentImage?.id === selectedImage.id
        ? { ...currentImage, description: savedDescription }
        : currentImage
    ));
    setImageDescriptionDraft(savedDescription);
    setEditingImageDescription(false);
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

          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => selectImages(Array.from(event.target.files ?? []))} />
          {!pendingUploads.length ? (
            <button className={`${ui.primaryButton} w-full`} disabled={uploading || !canAddImages} onClick={() => fileInput.current?.click()} type="button">
              <UploadIcon />
              {canAddImages ? "Agregar imágenes" : "Pedido cerrado"}
            </button>
          ) : (
            <div className="grid gap-4 rounded-xl border border-[#dfe5e1] bg-[#fafbf9] p-4">
              <ImageDescriptionEditor onChange={setPendingUploads} uploads={pendingUploads} />
              <div className="flex justify-end gap-2">
                <button className={ui.secondaryButton} disabled={uploading} onClick={cancelImages} type="button">Cancelar</button>
                <button className={ui.primaryButton} disabled={uploading} onClick={() => void addImages()} type="button">
                  <UploadIcon />{uploading ? "Subiendo..." : `Subir ${pendingUploads.length} imagen${pendingUploads.length === 1 ? "" : "es"}`}
                </button>
              </div>
            </div>
          )}
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
                <button
                  aria-label={`Abrir ${image.name}`}
                  className={`${ui.imageTile} ${image.previewUrl ? ui.imagePreview : ""} cursor-pointer border-0 text-left transition-transform hover:scale-[1.015] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c]`}
                  key={image.id}
                  onClick={() => openImageViewer(image)}
                  style={image.previewUrl ? { backgroundImage: `url("${image.previewUrl}")` } : index === 0 ? { background: order.cover } : undefined}
                  type="button"
                >
                  {!image.previewUrl && <ImageIcon />}
                  <small>{image.description || image.name}</small>
                  <time dateTime={image.addedAt}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(image.addedAt))}</time>
                </button>
              ))}
              {!order.images.length && <div className={ui.detailEmpty}>Todavía no hay imágenes.</div>}
            </div>
          </div>
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-80 flex flex-col bg-[#111715]/95 text-white" role="dialog" aria-label={`Imagen ${selectedImage.name}`} aria-modal="true">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <strong className="block truncate text-sm font-semibold">{selectedImage.name}</strong>
              <span className="mt-0.5 block text-[10px] text-white/55">{order.code}</span>
            </div>
            <button aria-label="Cerrar imagen" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 [&_svg]:size-5" onClick={closeImageViewer} type="button"><CloseIcon /></button>
          </div>
          <div className="min-h-0 flex-1 bg-contain bg-center bg-no-repeat" style={selectedImage.previewUrl ? { backgroundImage: `url("${selectedImage.previewUrl}")` } : undefined}>
            {!selectedImage.previewUrl && <div className="grid h-full place-items-center text-white/50"><ImageIcon /></div>}
          </div>
          <div className="border-t border-white/10 bg-[#171e1b] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            {editingImageDescription ? (
              <form className="grid gap-3" onSubmit={saveImageDescription}>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[9px] font-bold uppercase tracking-[.12em] text-white/45" htmlFor="image-description">Descripción</label>
                  <small className="text-[9px] text-white/45">{imageDescriptionDraft.length}/1000</small>
                </div>
                <textarea
                  autoFocus
                  className="min-h-24 w-full resize-y rounded-lg border border-white/15 bg-white/10 p-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/35 focus:border-white/40"
                  id="image-description"
                  maxLength={1000}
                  onChange={(event) => setImageDescriptionDraft(event.target.value)}
                  placeholder="Editar descripción"
                  value={imageDescriptionDraft}
                />
                <div className="flex justify-end gap-2">
                  <button
                    className="min-h-10 rounded-lg border border-white/15 px-4 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                    disabled={savingImageDescription}
                    onClick={() => {
                      setImageDescriptionDraft(selectedImage.description);
                      setEditingImageDescription(false);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-[#1e2a25] transition hover:bg-[#eef2ef] disabled:opacity-50" disabled={savingImageDescription} type="submit">
                    <SaveIcon />{savingImageDescription ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-bold uppercase tracking-[.12em] text-white/45">Descripción</span>
                  <button className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-[10px] font-semibold text-white transition hover:bg-white/20" onClick={() => setEditingImageDescription(true)} type="button">
                    <EditIcon /> Editar
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{selectedImage.description || "Sin descripción para esta imagen."}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
