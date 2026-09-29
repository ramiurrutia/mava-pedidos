"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrderDocuments, type OrderDocument } from "../../../lib/supabase/pdf-orders-repository";
import { FileIcon, SpinnerIcon } from "../icons";

export function OrderPdfAttachment({ orderId, complete, format = "PDF" }: { orderId: string; complete: boolean; format?: "PDF" | "EXCEL" }) {
  const label = format === "EXCEL" ? "Excel" : "PDF";
  const [documents, setDocuments] = useState<OrderDocument[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getOrderDocuments(orderId, format).then((documents) => { if (active) setDocuments(documents); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [orderId, attempt, format, complete]);
  return (
    <div className="order-8 rounded-xl border border-[#dde7df] bg-[#f1f6f2] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#235c4c]"><FileIcon />{label}{documents && documents.length > 1 ? `s originales (${documents.length})` : " original"}</h3>
      {!complete && <p className="mb-3 text-xs leading-relaxed text-[#986035]">La importación está incompleta. Volvé a elegir todos los archivos de este pedido para continuar la subida sin duplicarlo. <Link href="/pedidos/importar" className="underline">Continuar importación</Link></p>}
      {documents && <ul className="space-y-3">{documents.map((document) => <li key={document.hash}>{document.url ? <a href={document.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[#235c4c] underline">Abrir {document.filename}</a> : <span className="break-all text-xs text-[#986035]">{document.filename} · No disponible todavía</span>}</li>)}</ul>}
      {error || documents?.some((document) => !document.url) ? <button type="button" className="mt-2 text-xs text-[#986035] underline" onClick={() => { setError(false); setDocuments(null); setAttempt((value) => value + 1); }}>Volver a cargar documentos</button> : !documents && <span role="status" className="flex items-center gap-2 text-xs text-[#68726d]"><SpinnerIcon className="size-3 animate-spin" />Preparando documentos…</span>}
    </div>
  );
}
