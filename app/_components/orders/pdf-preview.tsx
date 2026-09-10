"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import type { PdfOrderPreview, PdfProductPreview } from "../../../lib/pdf-order-reader";
import { ArrowIcon, BackIcon } from "../icons";
import { ui } from "./shared";

export function PdfPagePreview({ pages }: { pages: PdfOrderPreview["pages"] }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#e0e6e0] bg-[#f3f5f2] p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[#68726d]">
        <button type="button" className={ui.secondaryButton} disabled={page === 0} aria-label="Página anterior" onClick={() => setPage((value) => value - 1)}><BackIcon /></button>
        <span>Página {page + 1} de {pages.length}</span>
        <button type="button" className={ui.secondaryButton} disabled={page === pages.length - 1} aria-label="Página siguiente" onClick={() => setPage((value) => value + 1)}><ArrowIcon /></button>
      </div>
      <button type="button" aria-label={`Ampliar página ${page + 1} del PDF`} onClick={() => setOpen(true)} className="block aspect-[0.707] max-h-[65dvh] w-full cursor-zoom-in rounded-lg bg-white bg-contain bg-center bg-no-repeat shadow-sm focus-visible:outline-2 focus-visible:outline-[#235c4c]" style={{ backgroundImage: `url("${pages[page]?.previewUrl}")` }} />
      <p className="mt-2 text-center text-[11px] text-[#68726d]">Tocá la página para ampliarla</p>
      <Lightbox open={open} close={() => setOpen(false)} index={page} on={{ view: ({ index }) => setPage(index) }} slides={pages.map((item) => ({ src: item.previewUrl, alt: `Página ${item.number}` }))} plugins={[Zoom]} carousel={{ finite: true }} />
    </div>
  );
}

export function PdfProductEditor({ product, disabled, onChange }: { product: PdfProductPreview; disabled: boolean; onChange: (patch: Partial<PdfProductPreview>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#e0e6e0] bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-start gap-3">
        <button type="button" aria-label={`Ampliar ${product.code}`} onClick={() => setOpen(true)} className="size-20 shrink-0 cursor-zoom-in rounded-lg border border-[#e0e6e0] bg-[#f8f9f6] bg-contain bg-center bg-no-repeat focus-visible:outline-2 focus-visible:outline-[#235c4c]" style={{ backgroundImage: `url("${product.previewUrl}")` }} />
        <div className="min-w-0 flex-1"><strong className="block text-sm">{product.code}</strong><p className="mt-1 text-xs leading-relaxed text-[#68726d]">{product.description}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={ui.field}><span>Cantidad</span><input disabled={disabled} type="number" inputMode="numeric" min={1} max={200} step={1} required value={product.quantity || ""} onChange={(event) => onChange({ quantity: Number(event.target.value) })} /></label>
        <label className={ui.field}><span>Precio por unidad</span><input disabled={disabled} type="number" inputMode="decimal" min={0} max={999999999} step="0.01" required value={product.unitPrice} onChange={(event) => onChange({ unitPrice: Number(event.target.value) })} /></label>
      </div>
      <label className={`${ui.field} !mb-0`}><span>Nota de cada cuadro · medidas, fondo y marco</span><textarea disabled={disabled} maxLength={800} rows={2} value={product.description} onChange={(event) => onChange({ description: event.target.value })} /></label>
      <Lightbox open={open} close={() => setOpen(false)} slides={[{ src: product.previewUrl, alt: product.code }]} plugins={[Zoom]} carousel={{ finite: true }} render={{ buttonPrev: () => null, buttonNext: () => null }} />
    </div>
  );
}
