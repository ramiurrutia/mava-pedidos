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

const normalize = (value: string) => value.trim().toLocaleLowerCase("es");

export function ImportPdfPage() {
  const router = useRouter();
  const { folders, orders, refreshOrders } = useOrdersWorkspace();
  const [preview, setPreview] = useState<DocumentOrderPreview | null>(null);
  const previewRef = useRef<DocumentOrderPreview | null>(null);
  const reading = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const frozenInput = useRef<DocumentImportInput | null>(null);
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

  async function chooseFile(file?: File) {
    if (!file || saving || reservedId) return;
    reading.current?.abort();
    const controller = new AbortController(); reading.current = controller;
    previewRef.current?.dispose(); previewRef.current = null; setPreview(null);
    setLoading(true); setError(""); setReviewed(false); setShowPdf(false); setProgress("Leyendo el documento en este dispositivo…");
    try {
      const result = await readDocumentOrder(file, controller.signal, setProgress);
      if (controller.signal.aborted) { result.dispose(); return; }
      previewRef.current = result; setPreview(result); setClientName(result.clientName); setPhone(result.phone); setLocality(result.locality);
      const existing = orders.find((order) => order.sourceSystem === result.format && order.sourceOrderId === result.hash);
      const matched = folders.find((folder) => normalize(folder.name) === normalize(result.clientName));
      setFolderId(existing?.folderId ?? matched?.id ?? ""); setFolderName(result.clientName);
      setNotes(""); setCanvasesOrdered(false); frozenInput.current = null;
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "No se pudo leer el documento. Probá con otro archivo.";
        setError(message); sileo.error({ title: "No se pudo reconocer el documento", description: message });
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  function changeProduct(key: string, patch: Partial<PdfProductPreview>) {
    setPreview((current) => current ? { ...current, products: current.products.map((product) => product.key === key ? { ...product, ...patch } : product) } : current);
    setReviewed(false);
  }
  const units = preview?.products.reduce((sum, product) => sum + product.quantity, 0) ?? 0;
  const total = preview?.products.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0) ?? 0;
  const existing = preview && orders.find((order) => order.sourceSystem === preview.format && order.sourceOrderId === preview.hash && ["pdf_complete", "excel_complete"].includes(order.sourceStatus ?? ""));
  const targetName = folderId ? folders.find((folder) => folder.id === folderId)?.name ?? "" : folderName.trim();
  const invalidProducts = preview?.products.some((product) => !Number.isInteger(product.quantity) || product.quantity < 1 || !Number.isFinite(product.unitPrice) || product.unitPrice < 0);
  const locked = saving || Boolean(reservedId);
  const valid = preview && clientName.trim() && clientName.trim().length <= 80 && targetName && targetName.length <= 80 && !invalidProducts && units > 0 && units <= 200 && reviewed && !existing;
  const mismatch = preview?.declaredTotal !== null && preview?.declaredTotal !== undefined && Math.abs(preview.declaredTotal - total) > 0.01;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || !valid || uploadLock.current) return;
    uploadLock.current = true; setSaving(true); setError("");
    if (!frozenInput.current) {
      frozenInput.current = {
        format: preview.format, hash: preview.hash, file: preview.file, clientName: clientName.trim(), folderId: folderId || null, folderName: targetName,
        phone: phone.trim(), locality: locality.trim(), total, canvasesOrdered,
        notes: [notes.trim(), preview.email ? `Correo: ${preview.email}` : "", preview.address ? `Dirección: ${preview.address}` : ""].filter(Boolean).join("\n\n"),
        uploads: preview.products.flatMap((product, index) => Array.from({ length: product.quantity }, (_, unit) => ({
          file: new File([product.file], `${preview.format === "EXCEL" ? "excel" : "pdf"}-${String(index + 1).padStart(3, "0")}-${product.code.replace(/[^a-zA-Z0-9-]/g, "-")}-${unit + 1}.jpg`, { type: "image/jpeg" }),
          description: `${product.code} · ${product.description}\nUnidad ${unit + 1} de ${product.quantity} · Precio unitario: ${formatCurrency(product.unitPrice)}`,
        }))),
      };
    }
    try {
      const result = await importDocumentOrder(frozenInput.current, setProgress, setReservedId);
      await refreshOrders();
      sileo.success({ title: result.reused ? "Este archivo ya estaba importado" : "Pedido importado", description: result.reused ? "Abrimos el pedido existente, sin crear un duplicado." : `${units} cuadros guardados en ${targetName}.` });
      router.replace(`/pedidos/${encodeURIComponent(result.orderId)}`);
    } catch (cause) {
      if (cause instanceof DocumentImportError && cause.orderId) setReservedId(cause.orderId);
      const message = cause instanceof Error ? cause.message : "No se pudo completar la importación.";
      setError(message); sileo.error({ title: "No se completó la importación", description: message });
      // Keep the confirmed input on any ambiguous network failure so a retry is identical.
    } finally { uploadLock.current = false; setSaving(false); }
  }

  return (
    <section className="mx-auto w-full max-w-[1000px]" aria-labelledby="pdf-import-title">
      <Link href="/pedidos/nuevo" className={`${ui.backButton} no-underline`} onClick={(event) => { if (saving) event.preventDefault(); }}><BackIcon />Volver a crear pedido</Link>
      <div className={`${ui.pageCard} mb-4`}>
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f0ea] text-[#235c4c]"><FileIcon /></span><div><p className={ui.eyebrow}>Nuevo pedido desde un documento</p><h1 id="pdf-import-title" className="text-xl font-semibold">Importar PDF o Excel</h1><p className="mt-2 text-xs leading-relaxed text-[#68726d]">Revisá los datos y elegí la carpeta. No se sube nada hasta que confirmes.</p></div></div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" className="sr-only" aria-label="Seleccionar PDF o Excel de pedido" disabled={saving || Boolean(reservedId)} onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        {!preview && !loading && <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length === 1) void chooseFile(event.dataTransfer.files[0]); else setError("Elegí un solo archivo por pedido."); }} className={`${ui.uploadZone} mt-5 w-full cursor-pointer transition-colors hover:bg-[#eef4ee] focus-visible:outline-2 focus-visible:outline-[#235c4c]`}><UploadIcon /><strong>Elegir PDF o Excel, o arrastrarlo acá</strong><span>PDF de MAVA o Excel .xlsx con imágenes incrustadas · Hasta 20 MB · 20 páginas u hojas</span></button>}
        {loading && <div role="status" className="mt-5 flex flex-col items-center gap-3 rounded-xl bg-[#f3f6f2] p-8 text-center text-sm text-[#235c4c]"><SpinnerIcon className="size-6 animate-spin" /><p>{progress}</p><button type="button" className={ui.textButton} onClick={() => { reading.current?.abort(); setLoading(false); }}>Cancelar lectura</button></div>}
        {preview && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f3f6f2] px-3 py-2"><span className="min-w-0 break-all text-xs text-[#68726d]">{preview.file.name} · {preview.format === "EXCEL" ? `${preview.sheets?.length ?? 0} hojas · ${preview.products.length} imágenes` : `${preview.pages.length} páginas`}</span><button type="button" className={ui.textButton} disabled={locked} onClick={() => inputRef.current?.click()}>Cambiar archivo</button></div>}
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-[#ecc9be] bg-[#fff4ef] p-4 text-sm leading-relaxed text-[#9b4636]">{error}{reservedId && <Link className="mt-2 block underline" href={`/pedidos/${reservedId}`}>Ver el pedido reservado</Link>}</div>}
      {existing && <div className="mb-4 rounded-xl border border-[#bcd4c5] bg-[#edf5ef] p-4 text-sm"><strong>Este archivo ya tiene un pedido: {existing.code}</strong><p className="mt-1 text-xs text-[#68726d]">No vamos a crear un duplicado.</p><Link className={`${ui.primaryButton} mt-3 no-underline`} href={`/pedidos/${existing.id}`}>Abrir pedido existente</Link></div>}
      {preview && <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-w-0 space-y-4">
          <fieldset disabled={locked || Boolean(existing)} className={`${ui.pageCard} min-w-0`}>
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
            <p className="mb-4 text-[11px] leading-relaxed text-[#68726d]">La carpeta no cambia el nombre del cliente. Se crea un pedido nuevo, sin agregar imágenes a otros pedidos.</p>
            <label className={ui.field}><span>Notas adicionales</span><textarea rows={3} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-[#f3f6f2] p-3 text-xs"><input type="checkbox" className="size-4 accent-[#235c4c]" checked={canvasesOrdered} onChange={(event) => setCanvasesOrdered(event.target.checked)} />¿Ya se pidieron las telas?</label>
          </fieldset>
          <section aria-labelledby="pdf-artworks-title"><h2 id="pdf-artworks-title" className="mb-2 text-base font-semibold">Cuadros reconocidos</h2><p className="mb-3 text-xs text-[#68726d]">{preview.products.length} modelos · {units} cuadros. Podés corregir cantidades, precios y notas.</p><div className="space-y-3">{preview.products.map((product) => <PdfProductEditor key={product.key} product={product} disabled={locked || Boolean(existing)} onChange={(patch) => changeProduct(product.key, patch)} />)}</div></section>
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[84px] lg:self-start">
          <div className={ui.pageCard}>
            <h2 className="text-base font-semibold">Revisar y confirmar</h2><p className="mt-2 text-sm">{units} cuadros · <strong>{formatCurrency(total)}</strong></p><p className="mt-2 break-words text-xs text-[#68726d]">Carpeta: <strong>{targetName.toLocaleUpperCase("es") || "Sin elegir"}</strong></p>
            {(preview.warnings.length > 0 || mismatch) && <div className="mt-3 rounded-lg bg-[#fff5e9] p-3 text-xs leading-relaxed text-[#965d30]"><strong>Hay datos para revisar</strong><ul className="mt-2 list-disc space-y-1 pl-4">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}{mismatch && <li>Total impreso: {formatCurrency(preview.declaredTotal!)}. Se guardará el total que revisaste.</li>}</ul></div>}
            {units > 200 && <p role="alert" className="mt-3 text-xs text-[#a44236]">El máximo por pedido es de 200 cuadros.</p>}
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs leading-relaxed"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#235c4c]" checked={reviewed} disabled={locked || Boolean(existing)} onChange={(event) => setReviewed(event.target.checked)} />Revisé los cuadros, sus cantidades y la carpeta de destino.</label>
            <button type="submit" disabled={!valid || saving} className={`${ui.primaryButton} mt-4 w-full`}>{saving ? <SpinnerIcon className="animate-spin" /> : <CheckIcon />}{saving ? "Importando…" : reservedId ? "Reintentar subida" : `Crear pedido desde ${preview.format === "EXCEL" ? "Excel" : "PDF"}`}</button>
            <p role="status" aria-live="polite" className="mt-3 text-center text-[11px] leading-relaxed text-[#68726d]">{saving ? progress : reservedId ? "Se continuará el mismo pedido, sin duplicarlo." : "El archivo original y las fotos se guardan al confirmar."}</p>
          </div>
          {preview.format === "PDF" && <button type="button" className={`${ui.secondaryButton} w-full`} aria-expanded={showPdf} onClick={() => setShowPdf((value) => !value)}><FileIcon />{showPdf ? "Ocultar documento" : "Ver vista previa del PDF"}</button>}
          {preview.format === "PDF" && showPdf && <PdfPagePreview pages={preview.pages} />}
        </aside>
      </form>}
    </section>
  );
}
