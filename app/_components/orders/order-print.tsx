"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getOrderArtworkProgress, type Order } from "../../../lib/orders";
import { PrinterIcon, SpinnerIcon } from "../icons";
import { formatCurrency, ui } from "./shared";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function OrderPrintButton({ order }: { order: Order }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const documentRef = useRef<HTMLElement>(null);
  const originalTitle = useRef<string | null>(null);
  const pendingPrint = useRef<AbortController | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function restoreTitle() {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
    }
    window.addEventListener("afterprint", restoreTitle);
    return () => {
      pendingPrint.current?.abort();
      window.removeEventListener("afterprint", restoreTitle);
      restoreTitle();
    };
  }, []);

  async function printOrder() {
    if (!documentRef.current || preparing) return;
    const controller = new AbortController();
    pendingPrint.current = controller;
    setPreparing(true);
    setError("");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Eager images must finish loading before the browser takes its print snapshot.
      await Promise.race([
        Promise.all(Array.from(documentRef.current.querySelectorAll("img"), (image) => image.decode().catch(() => {}))),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("image-timeout")), 15000);
        }),
      ]);
      // Let React commit any unavailable-image placeholders before the snapshot.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (controller.signal.aborted) return;
      if (originalTitle.current === null) originalTitle.current = document.title;
      document.title = `Pedido ${order.code} - ${order.clientName}`;
      window.print();
    } catch {
      if (controller.signal.aborted) return;
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
      setError("No se pudo preparar la impresión. Revisá la conexión e intentá nuevamente.");
    } finally {
      clearTimeout(timeout);
      if (!controller.signal.aborted) setPreparing(false);
    }
  }

  return (
    <div className="grid justify-items-end gap-1.5">
      <button className={ui.secondaryButton} disabled={!mounted || preparing} onClick={() => void printOrder()} type="button">
        {preparing ? <SpinnerIcon className="animate-spin" /> : <PrinterIcon />}
        {preparing ? "Preparando..." : "Imprimir / PDF"}
      </button>
      <p className="text-[11px] text-[#68736d]">Elegí “Guardar como PDF” en la impresión.</p>
      {error && <p className="max-w-72 text-xs text-[#a34e42]" role="alert">{error}</p>}
      {mounted && createPortal(
        <article className="order-print" ref={documentRef} aria-label={`Pedido ${order.code} para imprimir`}>
          <OrderPrintContent order={order} />
        </article>,
        document.body,
      )}
    </div>
  );
}

function OrderPrintContent({ order }: { order: Order }) {
  const progress = getOrderArtworkProgress(order);
  return (
    <>
      <header className="order-print-header">
        <div><strong>MAVA · PEDIDOS</strong><h1>Pedido {order.code}</h1><p>{order.clientName}</p></div>
        <div><p>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.createdAt))}</p><strong>{order.status}</strong></div>
      </header>
      <dl className="order-print-details">
        {order.contactName && <div><dt>Contacto</dt><dd>{order.contactName}</dd></div>}
        {order.whatsapp && <div><dt>WhatsApp</dt><dd>{order.whatsapp}</dd></div>}
        {order.locality && <div><dt>Localidad</dt><dd>{order.locality}</dd></div>}
        {order.folderName && <div><dt>Carpeta</dt><dd>{order.folderName}</dd></div>}
        <div><dt>Telas pedidas</dt><dd>{order.canvasesOrdered ? "Sí" : "No"}</dd></div>
        <div><dt>Preparación de cuadros</dt><dd>{progress.ready} de {progress.total} listos</dd></div>
      </dl>
      {!!order.items?.length && (
        <section>
          <h2>Cuadros de MAVA STOCK · {order.items.length} unidades</h2>
          <table>
            <thead><tr><th>Imagen</th><th>Cuadro / detalle</th><th>Estado</th><th>Precio</th></tr></thead>
            <tbody>{order.items.map((item, index) => (
              <tr key={`${item.id}-${index}`}>
                <td><PrintImage src={item.imageUrl} alt={item.code} /></td>
                <td><strong>{item.code}</strong><p>{item.name}</p><p>{[item.size, item.backgroundLabel].filter(Boolean).join(" · ")}</p></td>
                <td>{item.preparationStatus ?? "Pendiente"}</td><td className="order-print-price">{formatCurrency(item.price)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
      {order.total !== undefined && <p className="order-print-total"><strong>Total: {formatCurrency(order.total)}</strong></p>}
      {!!order.images.length && (
        <section>
          <h2>Imágenes agregadas · {order.images.length} archivos</h2>
          {order.images.map((image) => (
            <figure className="order-print-artwork" key={image.id}>
              <PrintImage src={image.previewUrl} alt={image.name} />
              <figcaption><strong>{image.name}</strong><p className="order-print-notes">{image.description}</p><p>Preparación: {image.preparationStatus}</p></figcaption>
            </figure>
          ))}
        </section>
      )}
      <section><h2>Notas</h2><p className="order-print-notes">{order.notes || "Sin notas adicionales para este pedido."}</p></section>
    </>
  );
}

function PrintImage({ src, alt }: { src?: string; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || failedSrc === src) return <span className="order-print-missing">Imagen no disponible</span>;
  // Native images preserve signed URLs and can be awaited before printing.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="eager" onError={() => setFailedSrc(src)} />;
}
