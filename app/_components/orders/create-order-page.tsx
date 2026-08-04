"use client";

import { useMemo, useRef, useState } from "react";
import { isOrderActive, type ClientFolder, type Order } from "../../../lib/orders";
import { BackIcon, ImageIcon, UploadIcon } from "../icons";
import { getNextCode, ui } from "./shared";

export function CreateOrderPage({
  folders,
  orders,
  onClose,
  onCreate,
  onAssignExisting,
}: {
  folders: ClientFolder[];
  orders: Order[];
  onClose: () => void;
  onCreate: (input: { clientName: string; notes: string; files: File[] }) => Promise<boolean>;
  onAssignExisting: (clientId: string, files: File[], orderId?: string) => Promise<boolean>;
}) {
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [assignment, setAssignment] = useState<"new" | "existing">("new");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const matchingFolder = useMemo(
    () => folders.find((folder) => normalizeClientName(folder.name) === normalizeClientName(clientName)),
    [clientName, folders],
  );
  const pendingOrders = useMemo(
    () => orders
      .filter((order) => order.clientId === matchingFolder?.id && isOrderActive(order.status))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [matchingFolder?.id, orders],
  );
  const recommendedOrder = pendingOrders[0];
  const effectiveOrderId = selectedOrderId || recommendedOrder?.id || "";
  const nextCode = getNextCode(orders);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedClientName = clientName.trim();
    if (!normalizedClientName || saving) return;

    if (step === 1) {
      setSelectedOrderId(recommendedOrder?.id ?? "");
      setStep(2);
      return;
    }

    setSaving(true);
    const success = assignment === "new"
      ? await onCreate({ clientName: normalizedClientName, notes: notes.trim(), files })
      : files.length && effectiveOrderId && matchingFolder
        ? await onAssignExisting(matchingFolder.id, files, effectiveOrderId)
        : false;
    setSaving(false);
    if (success) onClose();
  }

  return (
    <section className={ui.pagePanel} aria-labelledby="new-order-title">
      <button className={ui.backButton} type="button" onClick={onClose}><BackIcon /> Volver</button>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}>
          <div><p className={ui.eyebrow}>Nuevo pedido · Paso {step} de 2</p><h2 id="new-order-title">{step === 1 ? `Crear ${nextCode}` : "Asignar imágenes"}</h2></div>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <FirstStep
              clientName={clientName}
              files={files}
              fileInput={fileInput}
              folders={folders}
              notes={notes}
              onClientNameChange={setClientName}
              onFilesChange={setFiles}
              onNotesChange={setNotes}
            />
          ) : (
            <AssignmentStep
              assignment={assignment}
              clientName={clientName.trim()}
              effectiveOrderId={effectiveOrderId}
              files={files}
              folderExists={Boolean(matchingFolder)}
              nextCode={nextCode}
              onAssignmentChange={setAssignment}
              onOrderChange={setSelectedOrderId}
              pendingOrders={pendingOrders}
              recommendedOrder={recommendedOrder}
            />
          )}
          <div className={ui.formActions}>
            <button type="button" className={ui.secondaryButton} onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 2 ? "Atrás" : "Cancelar"}</button>
            <button className={ui.primaryButton} disabled={saving || (step === 2 && assignment === "existing" && (!files.length || !effectiveOrderId))} type="submit">
              {saving ? "Guardando..." : step === 1 ? "Continuar" : assignment === "new" ? "Crear pedido" : "Asignar imágenes"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function FirstStep({
  clientName,
  files,
  fileInput,
  folders,
  notes,
  onClientNameChange,
  onFilesChange,
  onNotesChange,
}: {
  clientName: string;
  files: File[];
  fileInput: React.RefObject<HTMLInputElement | null>;
  folders: ClientFolder[];
  notes: string;
  onClientNameChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <>
      <label className={ui.field}>
        <span>Cliente / carpeta</span>
        <input
          autoFocus
          required
          list="existing-client-folders"
          maxLength={80}
          onChange={(event) => onClientNameChange(event.target.value)}
          placeholder="Ej. Clash"
          value={clientName}
        />
        <datalist id="existing-client-folders">
          {folders.map((folder) => <option value={folder.name} key={folder.id} />)}
        </datalist>
        <small className="text-[10px] leading-relaxed text-[#7b8580]">Si el cliente todavía no existe, su carpeta se creará junto con el pedido.</small>
      </label>
      <label className={ui.field}>
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Medidas, marco, fecha de entrega..." rows={3} />
      </label>
      <div className={ui.uploadZone}>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))} />
        <UploadIcon />
        <strong>{files.length ? `${files.length} imagen${files.length === 1 ? "" : "es"} seleccionada${files.length === 1 ? "" : "s"}` : "Agregar imágenes"}</strong>
        <span>En el próximo paso vas a confirmar a qué pedido asignarlas.</span>
        <button type="button" className={ui.secondaryButton} onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>
      </div>
      {files.length > 0 && <div className={ui.fileSummary}>{files.map((file) => <span key={`${file.name}-${file.size}`}><ImageIcon />{file.name}</span>)}</div>}
    </>
  );
}

function AssignmentStep({
  assignment,
  clientName,
  effectiveOrderId,
  files,
  folderExists,
  nextCode,
  onAssignmentChange,
  onOrderChange,
  pendingOrders,
  recommendedOrder,
}: {
  assignment: "new" | "existing";
  clientName: string;
  effectiveOrderId: string;
  files: File[];
  folderExists: boolean;
  nextCode: string;
  onAssignmentChange: (value: "new" | "existing") => void;
  onOrderChange: (value: string) => void;
  pendingOrders: Order[];
  recommendedOrder?: Order;
}) {
  return (
    <div className={ui.assignmentStep}>
      <button type="button" className={`${ui.assignmentCard} ${assignment === "new" ? ui.assignmentSelected : ""}`} onClick={() => onAssignmentChange("new")}>
        <span className={`${ui.assignmentRadio} ${assignment === "new" ? ui.assignmentRadioSelected : ""}`} />
        <span><strong>Asignar a pedido nuevo</strong><small>{folderExists ? `Crear ${nextCode} dentro de ${clientName}.` : `Crear ${nextCode} y la carpeta ${clientName}.`}</small></span>
      </button>
      <button type="button" disabled={!recommendedOrder || !files.length} className={`${ui.assignmentCard} ${assignment === "existing" ? ui.assignmentSelected : ""}`} onClick={() => recommendedOrder && files.length && onAssignmentChange("existing")}>
        <span className={`${ui.assignmentRadio} ${assignment === "existing" ? ui.assignmentRadioSelected : ""}`} />
        <span><strong>Asignar a un pedido</strong><small>{!files.length ? "Primero seleccioná al menos una imagen." : recommendedOrder ? `Último pedido activo: ${recommendedOrder.code}.` : "No hay pedidos activos disponibles."}</small></span>
      </button>
      {assignment === "existing" && pendingOrders.length > 0 && (
        <label className={`${ui.field} ${ui.assignmentSelect}`}>
          <span>Pedido activo</span>
          <select value={effectiveOrderId} onChange={(event) => onOrderChange(event.target.value)}>
            {pendingOrders.map((order, index) => <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Último pedido" : ""}</option>)}
          </select>
        </label>
      )}
      <div className={ui.safetyNote}><span>✓</span><p><strong>Confirmación manual</strong>No se creará ni modificará ningún pedido hasta que confirmes esta selección.</p></div>
    </div>
  );
}

function normalizeClientName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}
