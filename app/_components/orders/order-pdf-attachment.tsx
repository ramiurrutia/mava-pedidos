"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrderDocument } from "../../../lib/supabase/pdf-orders-repository";
import { FileIcon, SpinnerIcon } from "../icons";

export function OrderPdfAttachment({ orderId, complete, format = "PDF" }: { orderId: string; complete: boolean; format?: "PDF" | "EXCEL" }) {
  const label = format === "EXCEL" ? "Excel" : "PDF";
  const [document, setDocument] = useState<{ filename: string; url: string } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getOrderDocument(orderId, format).then((document) => { if (active) setDocument(document); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [orderId, attempt, format]);
  return (
    <div className="order-8 rounded-xl border border-[#dde7df] bg-[#f1f6f2] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#235c4c]"><FileIcon />{label} original</h3>
      {!complete && <p className="mb-3 text-xs leading-relaxed text-[#986035]">La importación está incompleta. Volvé a elegir el mismo archivo para continuar la subida sin crear otro pedido. <Link href="/pedidos/importar" className="underline">Continuar importación</Link></p>}
      {document ? <a href={document.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[#235c4c] underline">Abrir {document.filename}</a> : error ? <button type="button" className="text-xs text-[#986035] underline" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>No se pudo abrir el {label}. Reintentar</button> : <span role="status" className="flex items-center gap-2 text-xs text-[#68726d]"><SpinnerIcon className="size-3 animate-spin" />Preparando documento…</span>}
    </div>
  );
}
