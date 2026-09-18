"use client";

import { OrderNotes } from "./order-notes";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  createPendingImageUploads,
  getOrderArtworkProgress,
  isOrderActive,
  type ArtworkPreparationStatus,
  type Order,
  type OrderImage,
  type OrderStatus,
  type PendingImageUpload,
} from "../../../lib/orders";
import type { OrderDetailsInput } from "../../../lib/supabase/orders-repository";
import { BackIcon, CheckIcon, EditIcon, ImageIcon, MoreIcon, SpinnerIcon, TrashIcon, UploadIcon } from "../icons";
import { ArtworkLightbox, type ArtworkViewerEntry } from "./artwork-lightbox";
import { ImageDescriptionEditor } from "./image-description-editor";
import { OrderEditModal } from "./order-edit-modal";
import { OrderPdfAttachment } from "./order-pdf-attachment";
import { OrderPrintButton } from "./order-print";
import { formatCurrency, statuses, statusStyles, ui } from "./shared";

export function OrderPage({
  order,
  onClose,
  onStatusChange,
  onAddImages,
  onEdit,
  onEditImageDescription,
  onCanvasesOrderedChange,
  onArtworkPreparationChange,
  onDelete,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onAddImages: (uploads: PendingImageUpload[]) => Promise<boolean>;
  onEdit: (input: OrderDetailsInput) => Promise<boolean>;
  onEditImageDescription: (imageId: string, description: string) => Promise<string | null>;
  onCanvasesOrderedChange: (value: boolean) => Promise<boolean>;
  onArtworkPreparationChange: (artworkKey: string, status: ArtworkPreparationStatus) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingImageUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const searchParams = useSearchParams();
  const [savingCanvasesOrdered, setSavingCanvasesOrdered] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [updatingArtworkKeys, setUpdatingArtworkKeys] = useState<Set<string>>(() => new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const canAddImages = isOrderActive(order.status);
  const artworkProgress = getOrderArtworkProgress(order);
  const viewerEntries: ArtworkViewerEntry[] = [
    ...order.images
      .filter((image) => Boolean(image.previewUrl))
      .map((image) => ({ editable: true, image })),
    ...(order.items ?? []).flatMap((item, index) => {
      const image = createStockViewerImage(order, item, index);
      return image ? [{ editable: false, image }] : [];
    }),
  ];

  const closeImageViewer = useCallback(() => {
    if (viewerIndex !== null && window.history.state?.mavaImageViewer) {
      window.history.back();
      return;
    }
    setViewerIndex(null);
  }, [viewerIndex]);

  useEffect(() => {
    if (searchParams.get("editar") !== "1") return;
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("editar") !== "1") return;
      // Consume the action so restoring the tab never reopens the editor.
      // The extra entry lets system Back close editing and stay on this order.
      url.searchParams.delete("editar");
      const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", cleanUrl);
      window.history.pushState({ ...window.history.state, mavaEditOrder: order.id }, "", cleanUrl);
      setConfirmingDelete(false);
      setEditing(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [order.id, searchParams]);

  useEffect(() => {
    function closeOverlayFromHistory() {
      setViewerIndex(null);
      setEditing(false);
    }

    window.addEventListener("popstate", closeOverlayFromHistory);
    return () => window.removeEventListener("popstate", closeOverlayFromHistory);
  }, []);

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

  function openImageViewer(imageId: string) {
    const index = viewerEntries.findIndex(({ image }) => image.id === imageId);
    if (index < 0) return;
    window.history.pushState({ ...window.history.state, mavaImageViewer: true }, "");
    setViewerIndex(index);
  }

  function openStockItemImage(item: NonNullable<Order["items"]>[number], index: number) {
    const image = createStockViewerImage(order, item, index);
    if (image) openImageViewer(image.id);
  }

  function startEditing() {
    setConfirmingDelete(false);
    window.history.pushState({ ...window.history.state, mavaEditOrder: order.id }, "");
    setEditing(true);
  }

  const closeEditing = useCallback(() => {
    if (editing && window.history.state?.mavaEditOrder === order.id) {
      window.history.back();
      return;
    }
    setEditing(false);
  }, [editing, order.id]);

  async function deleteOrder() {
    if (deleting) return;
    setDeleting(true);
    const deleted = await onDelete();
    if (!deleted) setDeleting(false);
  }

  async function toggleCanvasesOrdered() {
    if (savingCanvasesOrdered) return;
    setSavingCanvasesOrdered(true);
    await onCanvasesOrderedChange(!order.canvasesOrdered);
    setSavingCanvasesOrdered(false);
  }

  async function toggleArtworkPreparation(artworkKey: string, currentStatus: ArtworkPreparationStatus) {
    if (updatingArtworkKeys.has(artworkKey)) return;
    setUpdatingArtworkKeys((current) => new Set(current).add(artworkKey));
    await onArtworkPreparationChange(artworkKey, currentStatus === "Listo" ? "Pendiente" : "Listo");
    setUpdatingArtworkKeys((current) => {
      const next = new Set(current);
      next.delete(artworkKey);
      return next;
    });
  }

  return (
    <section className={ui.pagePanel} aria-labelledby="order-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <button className={ui.backButton} type="button" onClick={onClose}><BackIcon /> Volver</button>
        <OrderPrintButton key={order.id} order={order} />
      </div>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}>
          <div>
            <p className={ui.eyebrow}>{order.code}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="order-title">{order.clientName}</h2>
              {order.sourceSystem && <span className="rounded-full bg-[#e8f0eb] px-2.5 py-1 text-[9px] font-bold tracking-[.06em] text-[#235c4c]">{order.sourceSystem}</span>}
            </div>
          </div>
          <div className="relative">
            <button
              aria-expanded={actionsOpen}
              aria-label="Más acciones del pedido"
              className={`${ui.secondaryButton} px-3`}
              disabled={deleting}
              onClick={() => setActionsOpen((open) => !open)}
              type="button"
            >
              <MoreIcon />
            </button>
            {actionsOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-20 grid min-w-44 overflow-hidden rounded-xl border border-[#dfe3df] bg-white p-1 shadow-[0_14px_38px_rgb(36_48_42/16%)]">
                <button className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-xs font-semibold hover:bg-[#f3f5f2] [&_svg]:size-4" disabled={editing} onClick={() => { setActionsOpen(false); startEditing(); }} type="button"><EditIcon />Editar pedido</button>
                <button className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-xs font-semibold text-[#a34e42] hover:bg-[#fff5f3] [&_svg]:size-4" onClick={() => { setActionsOpen(false); setEditing(false); setConfirmingDelete(true); }} type="button"><TrashIcon />Eliminar pedido</button>
              </div>
            )}
          </div>
        </div>
        {confirmingDelete && (
          <div className="mb-5 rounded-lg border border-[#ead7d3] bg-[#fff7f5] p-4">
            <strong className="block text-xs font-semibold text-[#873f36]">¿Eliminar {order.code}?</strong>
            <p className="mt-1 text-[10px] leading-relaxed text-[#876760]">Dejará de aparecer en la aplicación, pero sus datos e imágenes podrán recuperarse desde Supabase.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className={ui.secondaryButton} disabled={deleting} onClick={() => setConfirmingDelete(false)} type="button">Cancelar</button>
              <button className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#a34e42] px-4 text-xs font-semibold text-white hover:bg-[#873f36] disabled:cursor-not-allowed disabled:opacity-50" disabled={deleting} onClick={() => void deleteOrder()} type="button">
                {deleting ? <SpinnerIcon className="animate-spin" /> : <TrashIcon />}{deleting ? "Eliminando..." : "Eliminar pedido"}
              </button>
            </div>
          </div>
        )}
        <div className={ui.orderContent}>
          <fieldset className="order-1 grid gap-2">
            <legend className="mb-1 text-[11px] font-semibold text-[#68726d]">Estado del pedido</legend>
            <div className="grid grid-cols-4 gap-2 max-[620px]:grid-cols-2">
              {statuses.map((status) => {
                const selected = order.status === status;
                return (
                  <button
                    aria-pressed={selected}
                    className={`${statusStyles[status]} ${selected ? "border-current ring-2 ring-current/15" : "border-transparent opacity-65 hover:opacity-100"} inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c]`}
                    key={status}
                    onClick={() => onStatusChange(status)}
                    type="button"
                  >
                    <i className="size-1.5 rounded-full bg-current" />
                    {status}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button
            aria-pressed={order.canvasesOrdered}
            className={`${order.canvasesOrdered ? "border-[#a9c8b6] bg-[#edf5f0]" : "border-[#e4d9cf] bg-[#fffaf5]"} order-2 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-[#8eaa9b] disabled:cursor-wait disabled:opacity-65`}
            disabled={savingCanvasesOrdered}
            onClick={() => void toggleCanvasesOrdered()}
            type="button"
          >
            <span className={`${order.canvasesOrdered ? "border-[#3f7c61] bg-[#3f7c61] text-white" : "border-[#b9b2aa] bg-white text-transparent"} grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors [&_svg]:size-4`}>{savingCanvasesOrdered ? <SpinnerIcon className="animate-spin text-[#3f7c61]" /> : <CheckIcon />}</span>
            <span className="min-w-0">
              <strong className="block text-xs font-semibold text-[#29352f]">Telas pedidas</strong>
              <small className="mt-1 block text-[11px] leading-relaxed text-[#68736d]">
                {order.canvasesOrdered ? "Las telas de este pedido ya fueron solicitadas." : "Todavía falta pedir las telas necesarias para preparar los cuadros."}
              </small>
            </span>
          </button>
          <div className="order-3 rounded-xl border border-[#dfe5e1] bg-[#f8faf8] p-4">
            <div className="flex items-end justify-between gap-4">
              <span>
                <small className="block text-[11px] font-semibold text-[#68736d]">Preparación de cuadros</small>
                <strong className="mt-1 block text-base font-semibold">{artworkProgress.total ? `${artworkProgress.ready} de ${artworkProgress.total} listos` : "Sin cuadros todavía"}</strong>
              </span>
              {artworkProgress.total > 0 && <strong className="text-sm font-semibold text-[#3f765f]">{artworkProgress.percentage}%</strong>}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dfe6e1]">
              <span className="block h-full rounded-full bg-[#3f765f] transition-[width] duration-300" style={{ width: `${artworkProgress.percentage}%` }} />
            </div>
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => selectImages(Array.from(event.target.files ?? []))} />
          {!pendingUploads.length ? (
            <button className={`${ui.primaryButton} order-6 w-full`} disabled={uploading || !canAddImages} onClick={() => fileInput.current?.click()} type="button">
              <UploadIcon />
              {canAddImages ? "Agregar imágenes" : "Pedido cerrado"}
            </button>
          ) : (
            <div className="order-6 grid gap-4 rounded-xl border border-[#dfe5e1] bg-[#fafbf9] p-4">
              <ImageDescriptionEditor onChange={setPendingUploads} uploads={pendingUploads} />
              <div className="flex justify-end gap-2">
                <button className={ui.secondaryButton} disabled={uploading} onClick={cancelImages} type="button">Cancelar</button>
                <button className={ui.primaryButton} disabled={uploading} onClick={() => void addImages()} type="button">
                  {uploading ? <SpinnerIcon className="animate-spin" /> : <UploadIcon />}{uploading ? "Subiendo..." : `Subir ${pendingUploads.length} imagen${pendingUploads.length === 1 ? "" : "es"}`}
                </button>
              </div>
            </div>
          )}
          <div className={`${ui.safetyNote} order-7 -mt-2`}><span>✓</span><p><strong>Vinculado</strong>Las imágenes se vinculan a {order.code} mediante su ID.</p></div>
          {(order.sourceSystem || order.contactName || order.whatsapp || order.locality) && (
            <div className="order-9 grid grid-cols-2 gap-3 rounded-lg border border-[#e4e7e3] bg-[#fafbf9] p-3 max-[480px]:grid-cols-1">
              <div className={ui.detailBlock}><span>Contacto</span><p>{order.contactName || "Sin nombre de contacto"}</p></div>
              <div className={ui.detailBlock}><span>WhatsApp</span><p>{order.whatsapp || "Sin número registrado"}</p></div>
              <div className={ui.detailBlock}><span>Localidad</span><p>{order.locality || "Sin localidad registrada"}</p></div>
            </div>
          )}
            <OrderNotes notes={order.notes} fromPdf={order.sourceSystem === "PDF"} />
            {(order.sourceSystem === "PDF" || order.sourceSystem === "EXCEL") && <OrderPdfAttachment key={order.id} orderId={order.id} format={order.sourceSystem} complete={order.sourceStatus === "pdf_complete" || order.sourceStatus === "excel_complete"} />}
          {(order.items?.length ?? 0) > 0 && (
            <div className={`${ui.detailBlock} order-4`}>
              <div className={ui.detailTitle}>
                <span>Cuadros de MAVA STOCK</span>
                <small>{order.items?.length} unidades</small>
              </div>
              <div className="divide-y divide-[#e7e9e6] overflow-hidden rounded-lg border border-[#e4e7e3] bg-white">
                {order.items?.map((item, index) => (
                  <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 p-3" key={`${item.id}-${index}`}>
                    {item.imageUrl ? (
                      <button
                        aria-label={`Abrir imagen de ${item.code}`}
                        className="relative size-12 overflow-hidden rounded-lg border border-[#e1e5e1] bg-white bg-contain bg-center bg-no-repeat transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c]"
                        onClick={() => openStockItemImage(item, index)}
                        style={{ backgroundImage: `url("${item.imageUrl}")` }}
                        type="button"
                      />
                    ) : (
                      <span className="grid size-12 place-items-center rounded-lg bg-[#eef1ee] text-[#87908c] [&_svg]:size-4"><ImageIcon /></span>
                    )}
                    <span className="min-w-0">
                      <strong className="block truncate text-xs font-semibold">{item.code}</strong>
                      <small className="mt-1 block text-[11px] leading-relaxed text-[#68736d]">{item.name} · {item.size}{item.backgroundLabel ? ` · ${item.backgroundLabel}` : ""}</small>
                      <button
                        aria-label={item.preparationStatus === "Listo" ? `Marcar ${item.code} como pendiente` : `Marcar ${item.code} como listo`}
                        className={`${preparationStyle(item.preparationStatus ?? "Pendiente")} mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold`}
                        disabled={updatingArtworkKeys.has(item.preparationKey ?? `stock:${item.id}:${index}`)}
                        onClick={() => void toggleArtworkPreparation(item.preparationKey ?? `stock:${item.id}:${index}`, item.preparationStatus ?? "Pendiente")}
                        type="button"
                      >
                        {updatingArtworkKeys.has(item.preparationKey ?? `stock:${item.id}:${index}`) ? <SpinnerIcon className="animate-spin" /> : <CheckIcon />}
                        {item.preparationStatus ?? "Pendiente"}
                      </button>
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
          <div className={`${ui.detailBlock} order-5`}>
            <div className={ui.detailTitle}><span>Imágenes agregadas</span><small>{order.images.length} archivos</small></div>
            <div className={ui.imageGrid}>
              {order.images.map((image, index) => (
                <div
                  className={`${ui.imageTile} ${image.previewUrl ? ui.imagePreview : ""} relative overflow-hidden border-0 text-left transition-transform hover:scale-[1.015]`}
                  key={image.id}
                  style={image.previewUrl ? { backgroundImage: `url("${image.previewUrl}")` } : index === 0 ? { background: order.cover } : undefined}
                >
                  <button
                    aria-label={`Abrir ${image.name}`}
                    className="absolute inset-0 z-[5] cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
                    disabled={!image.previewUrl}
                    onClick={() => openImageViewer(image.id)}
                    type="button"
                  />
                  <span className={`${preparationStyle(image.preparationStatus)} absolute left-2 top-2 z-10 rounded-full px-2.5 py-1.5 text-[10px] font-semibold shadow-sm`}>{image.preparationStatus}</span>
                  <button
                    aria-label={image.preparationStatus === "Listo" ? `Marcar ${image.name} como pendiente` : `Marcar ${image.name} como listo`}
                    className={`${image.preparationStatus === "Listo" ? "border-[#3f765f] bg-[#3f765f] text-white" : "border-white/80 bg-black/55 text-white"} absolute right-2 top-2 z-20 grid size-10 place-items-center rounded-full border shadow-md backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&_svg]:size-4`}
                    disabled={updatingArtworkKeys.has(image.preparationKey)}
                    onClick={() => void toggleArtworkPreparation(image.preparationKey, image.preparationStatus)}
                    title={image.preparationStatus === "Listo" ? "Marcar como pendiente" : "Marcar como listo"}
                    type="button"
                  >
                    {updatingArtworkKeys.has(image.preparationKey) ? <SpinnerIcon className="animate-spin" /> : <CheckIcon />}
                  </button>
                  {!image.previewUrl && <ImageIcon />}
                  <small>{image.description || image.name}</small>
                  <time dateTime={image.addedAt}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(image.addedAt))}</time>
                </div>
              ))}
              {!order.images.length && <div className={ui.detailEmpty}>Todavía no hay imágenes.</div>}
            </div>
          </div>
        </div>
      </div>

      {viewerIndex !== null && (
        <ArtworkLightbox
          entries={viewerEntries}
          initialIndex={viewerIndex}
          onClose={closeImageViewer}
          onEditDescription={onEditImageDescription}
          onPreparationChange={onArtworkPreparationChange}
          orderCode={order.code}
        />
      )}
      {editing && (
        <OrderEditModal
          onClose={closeEditing}
          onSave={onEdit}
          order={order}
        />
      )}
    </section>
  );
}

function preparationStyle(status: ArtworkPreparationStatus) {
  if (status === "Listo") return "bg-[#dceee3] text-[#276146]";
  return "bg-[#edf0ee] text-[#65706a]";
}

function createStockViewerImage(
  order: Order,
  item: NonNullable<Order["items"]>[number],
  index: number,
): OrderImage | null {
  if (!item.imageUrl) return null;
  const details = [
    item.name !== item.code ? item.name : undefined,
    item.size,
    item.backgroundLabel,
    formatCurrency(item.price),
  ].filter(Boolean).join(" · ");

  return {
    id: `stock-${order.id}-${item.id}-${index}`,
    pedidoId: order.id,
    name: item.code,
    description: details,
    preparationKey: item.preparationKey ?? `stock:${item.id}:${index}`,
    preparationStatus: item.preparationStatus ?? "Pendiente",
    addedAt: order.createdAt,
    previewUrl: item.imageUrl,
  };
}
