"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sileo } from "sileo";
import type { PdfProductPreview } from "../../../lib/pdf-order-reader";
import { importDocumentOrder, DocumentImportError, type DocumentImportInput } from "../../../lib/supabase/pdf-orders-repository";
import { BackIcon, CheckIcon, FileIcon, FolderIcon, SpinnerIcon, UploadIcon } from "../icons";
import { PdfPagePreview, PdfProductEditor } from "./pdf-preview";
import { useOrdersWorkspace } from "./use-orders-workspace";
import { formatCurrency, ui } from "./shared";

import { readDocumentOrder, type DocumentOrderPreview } from "../../../lib/document-order-reader";
import { combineDocumentPreviews, MAX_ORDER_PDFS, validateDocumentSelection, type DocumentBatchPreview } from "../../../lib/document-order-batch";
import { isOrderActive, type Order } from "../../../lib/orders";

const normalize = (value: string) => value.trim().toLocaleLowerCase("es");

export function ImportPdfPage({ targetOrder, onClose }: { targetOrder?: Order; onClose?: () => void } = {}) {
  const router = useRouter();
  const { folders, orders, refreshOrders } = useOrdersWorkspace();
  const [preview, setPreview] = useState<DocumentBatchPreview | null>(null);
  const previewRef = useRef<DocumentBatchPreview | null>(null);
  const reading = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const frozenInput = useRef<DocumentImportInput | null>(null);
  const [draftFrozen, setDraftFrozen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [reservedId, setReservedId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [locality, setLocality] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [notes, setNotes] = useState("");
  const [canvasesOrdered, setCanvasesOrdered] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  useEffect(() => () => { reading.current?.abort(); previewRef.current?.dispose(); }, []);
  useEffect(() => {
    if (!saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  async function chooseFiles(files: File[]) {
    if (!files.length || loading || saving || reservedId || frozenInput.current) return;
    const current = previewRef.current;
    if (targetOrder && files.some((file) => !/\.pdf$/i.test(file.name))) { setError("Para este pedido, seleccioná archivos PDF."); return; }
    try { validateDocumentSelection([...(current?.documents.map((document) => document.file) ?? []), ...files]); }
    catch (cause) { setError((cause as Error).message); return; }
    reading.current?.abort();
    const controller = new AbortController(); reading.current = controller;
    const added: DocumentOrderPreview[] = [];
    setLoading(true); setError(""); setReviewed(false); setShowPdf(false); setProgress("Leyendo el documento en este dispositivo…");
    try {
      for (const file of files) {
        controller.signal.throwIfAborted();
        added.push(await readDocumentOrder(file, controller.signal, (message) => setProgress(`${file.name}: ${message}`)));
      }
      const result = await combineDocumentPreviews([...(current?.documents ?? []), ...added]);
      controller.signal.throwIfAborted();
      previewRef.current = result; setPreview(result);
      if (!current) {
        setClientName(result.clientName); setPhone(result.phone); setLocality(result.locality);
        const existing = orders.find((order) => order.sourceSystem === result.format && order.sourceOrderId === result.hash);
        const matched = folders.find((folder) => normalize(folder.name) === normalize(result.clientName));
        setFolderId(existing?.folderId ?? matched?.id ?? ""); setFolderName(result.clientName);
        setNotes(""); setCanvasesOrdered(false);
      }
    } catch (cause) {
      added.forEach((document) => document.dispose());
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "No se pudo leer el documento. Probá con otro archivo.";
        setError(message); sileo.error({ title: "No se pudo reconocer el documento", description: message });
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function removeDocument(hash: string) {
    if (loading || saving || reservedId || frozenInput.current || !previewRef.current) return;
    const current = previewRef.current;
    const remaining = current.documents.filter((document) => document.hash !== hash);
    setLoading(true); setError(""); setReviewed(false); setShowPdf(false);
    try {
      const next = remaining.length ? await combineDocumentPreviews(remaining) : null;
      current.documents.find((document) => document.hash === hash)?.dispose();
      previewRef.current = next; setPreview(next);
    } finally { setLoading(false); }
  }

  function changeProduct(key: string, patch: Partial<PdfProductPreview>) {
    const current = previewRef.current;
    if (!current) return;
    const next = {
      ...current,
      products: current.products.map((product) => product.key === key ? { ...product, ...patch } : product),
      documents: current.documents.map((document) => ({ ...document, products: document.products.map((product) =>
        `${document.hash}:${product.key}` === key ? { ...product, ...patch } : product) })),
    };
    previewRef.current = next; setPreview(next);
    setReviewed(false);
  }
  const units = preview?.products.reduce((sum, product) => sum + product.quantity, 0) ?? 0;
  const showPrices = preview?.format === "EXCEL";
  const total = showPrices ? preview.products.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0) : 0;
  const existing = !targetOrder && preview && orders.find((order) => order.sourceSystem === preview.format && order.sourceOrderId === preview.hash && ["pdf_complete", "excel_complete"].includes(order.sourceStatus ?? ""));
  const targetName = targetOrder ? targetOrder.folderName || targetOrder.clientName : folderId ? folders.find((folder) => folder.id === folderId)?.name ?? "" : folderName.trim();
  const invalidProducts = preview?.products.some((product) => !Number.isInteger(product.quantity) || product.quantity < 1 || (showPrices && (!Number.isFinite(product.unitPrice) || product.unitPrice < 0)));
  const locked = loading || saving || Boolean(reservedId) || draftFrozen;
  const valid = preview && (targetOrder ? isOrderActive(targetOrder.status) : clientName.trim() && clientName.trim().length <= 80 && targetName && targetName.length <= 80) && !invalidProducts && units > 0 && units <= 200 && reviewed && !existing;
  const mismatch = showPrices && preview.declaredTotal !== null && Math.abs(preview.declaredTotal - total) > 0.01;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || !valid || loading || uploadLock.current) return;
    uploadLock.current = true; setSaving(true); setError("");
    if (!frozenInput.current) {
      frozenInput.current = {
        orderId: targetOrder?.id,
        format: preview.format, hash: preview.hash, file: preview.file, clientName: clientName.trim(), folderId: folderId || null, folderName: targetName,
        documents: preview.documents.map(({ file, hash }) => ({ file, hash })),
        phone: phone.trim(), locality: locality.trim(), total, canvasesOrdered,
        notes: [notes.trim(), preview.email ? `Correo: ${preview.email}` : "", preview.address ? `Dirección: ${preview.address}` : ""].filter(Boolean).join("\n\n"),
        uploads: preview.products.flatMap((product, index) => Array.from({ length: product.quantity }, (_, unit) => ({
          file: new File([product.file], `${preview.format === "EXCEL" ? "excel" : "pdf"}-${String(index + 1).padStart(3, "0")}-${product.code.replace(/[^a-zA-Z0-9-]/g, "-")}-${unit + 1}.jpg`, { type: "image/jpeg" }),
          description: `${product.code} · ${product.description}\nUnidad ${unit + 1} de ${product.quantity}${showPrices ? ` · Precio unitario: ${formatCurrency(product.unitPrice)}` : ""}`,
          sourceDocumentHash: product.sourceDocumentHash,
        }))),
      };
      setDraftFrozen(true);
    }
    try {
      const result = await importDocumentOrder(frozenInput.current, setProgress, setReservedId);
      await refreshOrders();
      sileo.success({ title: result.reused ? "Estos documentos ya estaban importados" : "Pedido importado", description: result.reused ? "Abrimos el pedido existente, sin crear un duplicado." : `${units} cuadros guardados en ${targetName}.` });
      if (targetOrder && onClose) onClose();
      else router.replace(`/pedidos/${encodeURIComponent(result.orderId)}`);
    } catch (cause) {
      if (cause instanceof DocumentImportError && cause.orderId) setReservedId(cause.orderId);
      if (cause instanceof DocumentImportError && cause.canEditDraft && !reservedId) {
        frozenInput.current = null; setDraftFrozen(false);
      }
      const message = cause instanceof Error ? cause.message : "No se pudo completar la importación.";
      setError(message); sileo.error({ title: "No se completó la importación", description: message });
      // Keep the confirmed input on any ambiguous network failure so a retry is identical.
    } finally { uploadLock.current = false; setSaving(false); }
  }

  return (
    <section className="mx-auto w-full max-w-[1000px]" aria-labelledby="pdf-import-title">
      {targetOrder ? <button type="button" className={ui.backButton} disabled={saving} onClick={onClose}><BackIcon />Volver al pedido</button> : <Link href="/pedidos/nuevo" className={`${ui.backButton} no-underline`} onClick={(event) => { if (saving) event.preventDefault(); }}><BackIcon />Volver a crear pedido</Link>}
      <div className={`${ui.pageCard} mb-4`}>
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f0ea] text-[#235c4c]"><FileIcon /></span><div><p className={ui.eyebrow}>Un pedido con todos sus documentos</p><h1 id="pdf-import-title" className="text-xl font-semibold">{targetOrder ? "Agregar PDFs al pedido" : "Importar PDFs o Excel"}</h1><p className="mt-2 text-xs leading-relaxed text-[#68726d]">{targetOrder ? "Elegí los PDFs que querés agregar y revisá sus imágenes. Para continuar una subida pendiente, elegí nuevamente los mismos archivos." : "Podés reunir varios PDFs de la misma persona en un solo pedido, o importar un Excel. Revisá los datos antes de confirmar."}</p></div></div>
        <input ref={inputRef} type="file" multiple accept={targetOrder || preview?.format === "PDF" ? "application/pdf,.pdf" : "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"} className="sr-only" aria-label="Seleccionar PDFs o Excel de pedido" disabled={locked} onChange={(event) => { void chooseFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        {!loading && (!preview || (preview.format === "PDF" && preview.documents.length < MAX_ORDER_PDFS)) && <button type="button" disabled={locked} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFiles(Array.from(event.dataTransfer.files)); }} className={`${ui.uploadZone} mt-5 w-full cursor-pointer transition-colors hover:bg-[#eef4ee] focus-visible:outline-2 focus-visible:outline-[#235c4c]`}><UploadIcon /><strong>{preview ? "Agregar otro PDF al mismo pedido" : targetOrder ? "Elegir PDFs o arrastrarlos acá" : "Elegir PDFs o Excel, o arrastrarlos acá"}</strong><span>{targetOrder ? "PDFs de MAVA · Hasta 20 MB y 20 páginas por archivo" : "PDFs de MAVA o un Excel .xlsx · Hasta 20 MB y 20 páginas u hojas por archivo"}</span></button>}
        {loading && <div role="status" className="mt-5 flex flex-col items-center gap-3 rounded-xl bg-[#f3f6f2] p-8 text-center text-sm text-[#235c4c]"><SpinnerIcon className="size-6 animate-spin" /><p>{progress}</p><button type="button" className={ui.textButton} onClick={() => { reading.current?.abort(); setLoading(false); }}>Cancelar lectura</button></div>}
        {preview && <div className="mt-4 space-y-2"><p className="text-xs font-semibold">{preview.documents.length} {preview.format === "PDF" ? (preview.documents.length === 1 ? "PDF" : "PDFs") : "Excel"} · Un solo pedido</p>{preview.documents.map((document) => <div key={document.hash} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f3f6f2] px-3 py-2"><span className="min-w-0 break-all text-xs text-[#68726d]">{document.file.name} · {document.format === "EXCEL" ? `${document.sheets?.length ?? 0} hojas` : `${document.pages.length} páginas`} · {document.products.length} modelos</span><button type="button" className={ui.textButton} disabled={locked} aria-label={`Quitar ${document.file.name}`} onClick={() => void removeDocument(document.hash)}>Quitar</button></div>)}</div>}
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-[#ecc9be] bg-[#fff4ef] p-4 text-sm leading-relaxed text-[#9b4636]">{error}{reservedId && <Link className="mt-2 block underline" href={`/pedidos/${reservedId}`}>Ver el pedido reservado</Link>}</div>}
      {existing && <div className="mb-4 rounded-xl border border-[#bcd4c5] bg-[#edf5ef] p-4 text-sm"><strong>Este archivo ya tiene un pedido: {existing.code}</strong><p className="mt-1 text-xs text-[#68726d]">No vamos a crear un duplicado.</p><Link className={`${ui.primaryButton} mt-3 no-underline`} href={`/pedidos/${existing.id}`}>Abrir pedido existente</Link></div>}
      {preview && <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-w-0 space-y-4">
          {targetOrder ? <div className={ui.pageCard}><h2 className="text-base font-semibold">{targetOrder.code}</h2><p className="mt-2 text-sm">{targetOrder.clientName}</p><p className="mt-2 text-xs text-[#68726d]">Los PDFs y sus imágenes se agregarán a este pedido.</p></div> : <fieldset disabled={locked || Boolean(existing)} className={`${ui.pageCard} min-w-0`}>
            <legend className="sr-only">Datos y carpeta</legend><h2 className="mb-4 text-base font-semibold">Datos reconocidos</h2>
            <label className={ui.field}><span>Cliente del pedido</span><input required maxLength={80} value={clientName} onChange={(event) => setClientName(event.target.value)} /></label>
            <label className={ui.field}><span>Teléfono / WhatsApp</span><input type="tel" maxLength={80} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label className={ui.field}><span>Localidad (opcional)</span><input autoComplete="address-level2" maxLength={120} value={locality} onChange={(event) => setLocality(event.target.value)} /></label>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FolderIcon />¿En qué carpeta lo guardamos?</h3>
            <label className={`${ui.field} !mb-2`}><span className="sr-only">Buscar carpeta</span><input placeholder="Buscar carpeta existente…" value={folderQuery} onChange={(event) => setFolderQuery(event.target.value)} /></label>
            <div className="mb-3 max-h-40 space-y-1 overflow-y-auto p-1">
              {folders.filter((folder) => normalize(folder.name).includes(normalize(folderQuery)) || folder.id === folderId).map((folder) => <label key={folder.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs focus-within:ring-2 focus-within:ring-[#235c4c] ${folder.id === folderId ? "border-[#91b4a1] bg-[#edf5ef]" : "border-[#e2e7e2] bg-white"}`}><input type="radio" name="folder" value={folder.id} checked={folderId === folder.id} onChange={() => setFolderId(folder.id)} className="accent-[#235c4c]" /><span className="break-words">{folder.name.toLocaleUpperCase("es")}</span></label>)}
              <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs focus-within:ring-2 focus-within:ring-[#235c4c] ${!folderId ? "border-[#91b4a1] bg-[#edf5ef]" : "border-[#e2e7e2] bg-white"}`}><input type="radio" name="folder" checked={!folderId} onChange={() => setFolderId("")} className="accent-[#235c4c]" />Crear carpeta al guardar</label>
            </div>
            {!folderId && <label className={ui.field}><span>Nombre de la carpeta nueva</span><input required maxLength={80} value={folderName} onChange={(event) => setFolderName(event.target.value)} /></label>}
            <p className="mb-4 text-[11px] leading-relaxed text-[#68726d]">Todos los archivos seleccionados y sus imágenes se guardarán juntos en un único pedido nuevo.</p>
            <label className={ui.field}><span>Notas adicionales</span><textarea rows={3} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-[#f3f6f2] p-3 text-xs"><input type="checkbox" className="size-4 accent-[#235c4c]" checked={canvasesOrdered} onChange={(event) => setCanvasesOrdered(event.target.checked)} />¿Ya se pidieron las telas?</label>
          </fieldset>}
          <section aria-labelledby="pdf-artworks-title"><h2 id="pdf-artworks-title" className="mb-2 text-base font-semibold">Cuadros reconocidos</h2><p className="mb-3 text-xs text-[#68726d]">{preview.products.length} modelos · {units} cuadros. Podés corregir cantidades y descripciones.</p><div className="space-y-3">{preview.products.map((product) => <PdfProductEditor key={product.key} showPrices={showPrices} product={product} disabled={locked || Boolean(existing)} onChange={(patch) => changeProduct(product.key, patch)} />)}</div></section>
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[84px] lg:self-start">
          <div className={ui.pageCard}>
            <h2 className="text-base font-semibold">Revisar y confirmar</h2><p className="mt-2 text-sm">{units} cuadros{showPrices && <> · <strong>{formatCurrency(total)}</strong></>}</p><p className="mt-2 break-words text-xs text-[#68726d]">Carpeta: <strong>{targetName.toLocaleUpperCase("es") || "Sin elegir"}</strong></p>
            {(preview.warnings.length > 0 || mismatch) && <div className="mt-3 rounded-lg bg-[#fff5e9] p-3 text-xs leading-relaxed text-[#965d30]"><strong>Hay datos para revisar</strong><ul className="mt-2 list-disc space-y-1 pl-4">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}{mismatch && <li>Total impreso: {formatCurrency(preview.declaredTotal!)}. Se guardará el total que revisaste.</li>}</ul></div>}
            {units > 200 && <p role="alert" className="mt-3 text-xs text-[#a44236]">El máximo por pedido es de 200 cuadros.</p>}
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs leading-relaxed"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#235c4c]" checked={reviewed} disabled={locked || Boolean(existing)} onChange={(event) => setReviewed(event.target.checked)} />Revisé los cuadros, sus cantidades y la carpeta de destino.</label>
            <button type="submit" disabled={!valid || loading || saving} className={`${ui.primaryButton} mt-4 w-full`}>{saving ? <SpinnerIcon className="animate-spin" /> : <CheckIcon />}{saving ? "Importando…" : reservedId || draftFrozen ? "Reintentar subida" : targetOrder ? "Agregar PDFs e imágenes" : `Crear pedido desde ${preview.format === "EXCEL" ? "Excel" : `${preview.documents.length} PDF${preview.documents.length === 1 ? "" : "s"}`}`}</button>
            <p role="status" aria-live="polite" className="mt-3 text-center text-[11px] leading-relaxed text-[#68726d]">{saving ? progress : reservedId || draftFrozen ? "Se continuará el mismo pedido, sin duplicarlo." : "Los archivos originales y las fotos se guardan al confirmar."}</p>
          </div>
          {preview.format === "PDF" && <button type="button" className={`${ui.secondaryButton} w-full`} aria-expanded={showPdf} onClick={() => setShowPdf((value) => !value)}><FileIcon />{showPdf ? "Ocultar documento" : "Ver vista previa del PDF"}</button>}
          {preview.format === "PDF" && showPdf && preview.documents.map((document) => <section key={document.hash}><h3 className="mb-2 break-all text-xs font-semibold">{document.file.name}</h3><PdfPagePreview pages={document.pages} /></section>)}
        </aside>
      </form>}
    </section>
  );
}
