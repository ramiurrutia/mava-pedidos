"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isOrderActive, type ClientFolder, type Order } from "../../../lib/orders";
import { BackIcon, ImageIcon, UploadIcon } from "../icons";
import { ui } from "./shared";

export function UploadToFolderPage({
  folders,
  orders,
  onClose,
  onUpload,
  onCreateNew,
}: {
  folders: ClientFolder[];
  orders: Order[];
  onClose: () => void;
  onUpload: (clientId: string, files: File[], orderId?: string) => Promise<boolean>;
  onCreateNew: (clientId: string, files: File[]) => Promise<boolean>;
}) {
  const [clientId, setClientId] = useState(folders[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [assignment, setAssignment] = useState<"new" | "existing">("existing");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pendingOrders = useMemo(
    () => orders
      .filter((order) => order.clientId === clientId && isOrderActive(order.status))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [clientId, orders],
  );
  const recommendedOrder = pendingOrders[0];
  const effectiveOrderId = selectedOrderId || recommendedOrder?.id || "";

  if (!folders.length) {
    return (
      <section className={ui.pagePanel} aria-labelledby="upload-folder-title">
        <button className={ui.backButton} type="button" onClick={onClose}><BackIcon /> Volver</button>
        <div className={ui.pageCard}>
          <div className={ui.emptyState}>
            <UploadIcon />
            <strong id="upload-folder-title">Todavía no hay carpetas</strong>
            <span>Creá el primer pedido y su carpeta aparecerá automáticamente.</span>
            <Link className={`${ui.primaryButton} mt-2 no-underline`} href="/pedidos/nuevo">Crear primer pedido</Link>
          </div>
        </div>
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!clientId || !files.length || uploading) return;
    if (step === 1) {
      setAssignment(recommendedOrder ? "existing" : "new");
      setSelectedOrderId(recommendedOrder?.id ?? "");
      setStep(2);
      return;
    }

    setUploading(true);
    const success = assignment === "new"
      ? await onCreateNew(clientId, files)
      : await onUpload(clientId, files, effectiveOrderId);
    setUploading(false);
    if (success) onClose();
  }

  return (
    <section className={ui.pagePanel} aria-labelledby="upload-folder-title">
      <button className={ui.backButton} type="button" onClick={onClose}><BackIcon /> Volver</button>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}>
          <div><p className={ui.eyebrow}>Paso {step} de 2</p><h2 id="upload-folder-title">{step === 1 ? "Subir imágenes" : "¿A qué pedido las asignamos?"}</h2></div>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <>
              <label className={ui.field}>
                <span>Cliente / carpeta</span>
                <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                  {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                </select>
              </label>
              <div className={ui.uploadZone}>
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                <UploadIcon />
                <strong>{files.length ? `${files.length} imagen${files.length === 1 ? "" : "es"} lista${files.length === 1 ? "" : "s"}` : "Seleccioná las imágenes"}</strong>
                <span>En el próximo paso vas a elegir el pedido de destino.</span>
                <button type="button" className={ui.secondaryButton} onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>
              </div>
              {files.length > 0 && <div className={ui.fileSummary}>{files.map((file) => <span key={`${file.name}-${file.size}`}><ImageIcon />{file.name}</span>)}</div>}
            </>
          ) : (
            <div className={ui.assignmentStep}>
              <button type="button" className={`${ui.assignmentCard} ${assignment === "new" ? ui.assignmentSelected : ""}`} onClick={() => setAssignment("new")}>
                <span className={`${ui.assignmentRadio} ${assignment === "new" ? ui.assignmentRadioSelected : ""}`} />
                <span><strong>Asignar a pedido nuevo</strong><small>Se creará un pedido pendiente para {folders.find((folder) => folder.id === clientId)?.name}.</small></span>
              </button>
              <button type="button" disabled={!recommendedOrder} className={`${ui.assignmentCard} ${assignment === "existing" ? ui.assignmentSelected : ""}`} onClick={() => recommendedOrder && setAssignment("existing")}>
                <span className={`${ui.assignmentRadio} ${assignment === "existing" ? ui.assignmentRadioSelected : ""}`} />
                <span><strong>Asignar a un pedido</strong><small>{recommendedOrder ? `Último pedido activo: ${recommendedOrder.code}.` : "No hay pedidos activos disponibles."}</small></span>
              </button>
              {assignment === "existing" && pendingOrders.length > 0 && (
                <label className={`${ui.field} ${ui.assignmentSelect}`}>
                  <span>Pedido activo</span>
                  <select value={effectiveOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                    {pendingOrders.map((order, index) => <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Último pedido" : ""}</option>)}
                  </select>
                </label>
              )}
              <div className={ui.safetyNote}><span>✓</span><p><strong>Destino confirmado</strong>Las {files.length} imágenes quedarán vinculadas por ID y no se mezclarán con otros pedidos.</p></div>
            </div>
          )}
          <div className={ui.formActions}>
            <button type="button" className={ui.secondaryButton} onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 2 ? "Atrás" : "Cancelar"}</button>
            <button className={ui.primaryButton} disabled={!files.length || uploading || (step === 2 && assignment === "existing" && !effectiveOrderId)} type="submit">
              {uploading ? "Guardando..." : step === 1 ? "Continuar" : assignment === "new" ? "Crear y asignar" : "Asignar imágenes"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
