"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { getOrderDocuments, type OrderDocument } from "../../../lib/supabase/pdf-orders-repository";
import { FileIcon, SpinnerIcon, TrashIcon, UploadIcon } from "../icons";
import { ui } from "./shared";

export function OrderPdfAttachment({ orderId, complete, format = "PDF", canAdd = false, onAdd, onDelete }: { orderId: string; complete: boolean; format?: "PDF" | "EXCEL"; canAdd?: boolean; onAdd?: () => void; onDelete?: (hash: string) => Promise<boolean> }) {
  const label = format === "EXCEL" ? "Excel" : "PDF";
  const [documents, setDocuments] = useState<OrderDocument[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<OrderDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removed = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    void getOrderDocuments(orderId, format).then((documents) => { if (active) setDocuments(documents.filter((document) => !removed.current.has(document.hash))); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [orderId, attempt, format, complete]);

  async function confirmDelete() {
    if (!selected || !onDelete || inFlight.current) return;
    inFlight.current = true; setDeleting(true); setDeleteError("");
    try {
      if (!await onDelete(selected.hash)) throw new Error("No se pudo eliminar el PDF. Intentá nuevamente.");
      removed.current.add(selected.hash);
      setDocuments((current) => current?.filter((document) => document.hash !== selected.hash) ?? null);
      setSelected(null);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "No se pudo eliminar el PDF."); }
    finally { inFlight.current = false; setDeleting(false); }
  }
  return (
    <div className="order-8 rounded-xl border border-[#dde7df] bg-[#f1f6f2] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#235c4c]"><FileIcon />{label}{documents && documents.length > 1 ? `s originales (${documents.length})` : " original"}</h3>
      {!complete && <p className="mb-3 text-xs leading-relaxed text-[#986035]">La importación está incompleta. Volvé a elegir todos los archivos de este pedido para continuar la subida sin duplicarlo. <Link href="/pedidos/importar" className="underline">Continuar importación</Link></p>}
      {documents && <ul className="space-y-3">{documents.map((document) => <li key={document.hash} className="flex items-center gap-3"><div className="min-w-0 flex-1">{document.url ? <a href={document.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[#235c4c] underline">Abrir {document.filename}</a> : <span className="break-all text-xs text-[#986035]">{document.filename} · No disponible todavía</span>}{document.mapped && <p className="mt-1 text-[10px] text-[#68726d]">{document.imageCount} imágenes</p>}{!document.complete && <p className="mt-1 text-xs text-[#986035]">Subida pendiente{!document.initial && canAdd && <button type="button" className="ml-2 underline" onClick={onAdd}>Continuar subida</button>}</p>}</div>{format === "PDF" && complete && onDelete && <button type="button" title="Eliminar PDF y sus imágenes" aria-label={`Eliminar ${document.filename} y sus imágenes`} disabled={deleting} onClick={() => { setSelected(document); setDeleteError(""); }} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#e5bcb5] bg-[#fff3f0] text-[#a34e42] hover:bg-[#ffe6e0] focus-visible:outline-2 focus-visible:outline-[#a34e42] [&_svg]:size-5"><TrashIcon /></button>}</li>)}</ul>}
      {documents?.length === 0 && <p className="text-xs text-[#68726d]">Este pedido no tiene PDFs adjuntos.</p>}
      {format === "PDF" && complete && canAdd && onAdd && <button type="button" className={`${ui.secondaryButton} mt-4`} disabled={deleting} onClick={onAdd}><UploadIcon />Agregar PDFs</button>}
      {error || documents?.some((document) => !document.url) ? <button type="button" className="mt-2 text-xs text-[#986035] underline" onClick={() => { setError(false); setDocuments(null); setAttempt((value) => value + 1); }}>Volver a cargar documentos</button> : !documents && <span role="status" className="flex items-center gap-2 text-xs text-[#68726d]"><SpinnerIcon className="size-3 animate-spin" />Preparando documentos…</span>}
      <Dialog.Root open={Boolean(selected)} onOpenChange={(open, details) => { if (inFlight.current) details.cancel(); else if (!open) setSelected(null); }}>
        <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-[#14251e]/45 backdrop-blur-[3px]" />
          <Dialog.Popup initialFocus={cancelRef} className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-none">
            <Dialog.Title className="text-lg font-semibold">¿Eliminar PDF y sus imágenes?</Dialog.Title>
            <p className="mt-3 break-all text-sm font-medium">{selected?.filename}</p>
            <Dialog.Description className="mt-3 text-sm leading-relaxed text-[#68726d]">Se quitarán este PDF y las imágenes importadas desde él. El pedido, los demás PDFs y las imágenes agregadas por separado se conservarán.</Dialog.Description>
            {deleting && <p role="status" className="mt-3 text-xs text-[#68726d]">Identificando y quitando las imágenes del documento…</p>}
            {deleteError && <p role="alert" className="mt-3 text-sm text-[#a34e42]">{deleteError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2"><Dialog.Close ref={cancelRef} disabled={deleting} className={ui.secondaryButton}>Cancelar</Dialog.Close>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a34e42] px-4 text-xs font-semibold text-white disabled:opacity-50">{deleting ? <SpinnerIcon className="animate-spin" /> : <TrashIcon />}{deleting ? "Eliminando…" : "Eliminar PDF e imágenes"}</button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
