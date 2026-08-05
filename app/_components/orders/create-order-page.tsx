"use client";

import { useMemo, useRef, useState } from "react";
import {
  createPendingImageUploads,
  isOrderActive,
  type ClientFolder,
  type Order,
  type PendingImageUpload,
} from "../../../lib/orders";
import { BackIcon, UploadIcon } from "../icons";
import { ui } from "./shared";
import { ImageDescriptionEditor } from "./image-description-editor";
import { SelectedImageThumbnails } from "./local-image-preview";

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
  onCreate: (input: { clientName: string; notes: string; uploads: PendingImageUpload[] }) => Promise<boolean>;
  onAssignExisting: (clientId: string, uploads: PendingImageUpload[], orderId?: string) => Promise<boolean>;
}) {
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [uploads, setUploads] = useState<PendingImageUpload[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  const displayedStep = uploads.length ? step : step === 3 ? 2 : 1;
  const totalSteps = uploads.length ? 3 : 2;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedClientName = clientName.trim();
    if (!normalizedClientName || saving) return;

    if (step === 1) {
      setSelectedOrderId(recommendedOrder?.id ?? "");
      setStep(uploads.length ? 2 : 3);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }

    setSaving(true);
    const success = assignment === "new"
      ? await onCreate({ clientName: normalizedClientName, notes: notes.trim(), uploads })
      : uploads.length && effectiveOrderId && matchingFolder
        ? await onAssignExisting(matchingFolder.id, uploads, effectiveOrderId)
        : false;
    setSaving(false);
    if (success) onClose();
  }

  function goBack() {
    if (step === 3) setStep(uploads.length ? 2 : 1);
    else if (step === 2) setStep(1);
    else onClose();
  }

  const title = step === 1
    ? "Crear pedido"
    : step === 2
      ? "Describir imágenes"
      : "Asignar imágenes";

  return (
    <section className={ui.pagePanel} aria-labelledby="new-order-title">
      <button className={ui.backButton} type="button" onClick={goBack}>
        <BackIcon />{step === 1 ? "Volver al dashboard" : "Volver al paso anterior"}
      </button>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}>
          <div><p className={ui.eyebrow}>Nuevo pedido · Paso {displayedStep} de {totalSteps}</p><h2 id="new-order-title">{title}</h2></div>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <FirstStep
              clientName={clientName}
              fileInput={fileInput}
              folders={folders}
              notes={notes}
              onClientNameChange={setClientName}
              onFilesChange={(files) => setUploads(createPendingImageUploads(files))}
              onNotesChange={setNotes}
              uploads={uploads}
            />
          ) : step === 2 ? (
            <ImageDescriptionEditor onChange={setUploads} uploads={uploads} />
          ) : (
            <AssignmentStep
              assignment={assignment}
              clientName={clientName.trim()}
              effectiveOrderId={effectiveOrderId}
              folderExists={Boolean(matchingFolder)}
              onAssignmentChange={setAssignment}
              onOrderChange={setSelectedOrderId}
              pendingOrders={pendingOrders}
              recommendedOrder={recommendedOrder}
              uploadCount={uploads.length}
            />
          )}
          <div className="mt-5 flex justify-end">
            <button className={ui.primaryButton} disabled={saving || (step === 3 && assignment === "existing" && (!uploads.length || !effectiveOrderId))} type="submit">
              {saving ? "Guardando..." : step !== 3 ? "Continuar" : assignment === "new" ? "Crear pedido" : "Asignar imágenes"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function FirstStep({
  clientName,
  uploads,
  fileInput,
  folders,
  notes,
  onClientNameChange,
  onFilesChange,
  onNotesChange,
}: {
  clientName: string;
  uploads: PendingImageUpload[];
  fileInput: React.RefObject<HTMLInputElement | null>;
  folders: ClientFolder[];
  notes: string;
  onClientNameChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <>
      <div className={ui.field}>
        <ClientFolderInput folders={folders} onChange={onClientNameChange} value={clientName} />
      </div>
      <label className={ui.field}>
        <span>Notas generales del pedido</span>
        <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Fecha de entrega u otras indicaciones generales..." rows={3} />
      </label>
      <div className={ui.uploadZone}>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))} />
        <UploadIcon />
        <strong>{uploads.length ? `${uploads.length} imagen${uploads.length === 1 ? "" : "es"} seleccionada${uploads.length === 1 ? "" : "s"}` : "Agregar imágenes"}</strong>
        <span>{uploads.length ? "En el próximo paso podrás escribir una nota para cada imagen." : "Podés crear el pedido sin imágenes y agregarlas después."}</span>
        <button type="button" className={ui.secondaryButton} onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>
      </div>
      {uploads.length > 0 && <SelectedImageThumbnails uploads={uploads} />}
    </>
  );
}

function ClientFolderInput({
  folders,
  onChange,
  value,
}: {
  folders: ClientFolder[];
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = normalizeClientName(value);
  const exactFolder = folders.find((folder) => normalizeClientName(folder.name) === query);
  const suggestions = useMemo(() => {
    if (!query) return [];
    return folders
      .filter((folder) => normalizeClientName(folder.name).includes(query))
      .sort((left, right) => {
        const leftStarts = normalizeClientName(left.name).startsWith(query);
        const rightStarts = normalizeClientName(right.name).startsWith(query);
        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        return left.name.localeCompare(right.name, "es");
      })
      .slice(0, 5);
  }, [folders, query]);
  const showSuggestions = open && !exactFolder && suggestions.length > 0;

  function selectFolder(folder: ClientFolder) {
    onChange(folder.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!suggestions.length || exactFolder) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      selectFolder(suggestions[activeIndex]);
    }
  }

  return (
    <>
      <span id="client-folder-label">Cliente / carpeta</span>
      <div className="relative">
        <input
          aria-activedescendant={activeIndex >= 0 ? `folder-suggestion-${suggestions[activeIndex]?.id}` : undefined}
          aria-autocomplete="list"
          aria-controls="folder-suggestions"
          aria-expanded={showSuggestions}
          aria-labelledby="client-folder-label"
          autoComplete="off"
          autoFocus
          maxLength={80}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(Boolean(query) && !exactFolder)}
          onKeyDown={handleKeyDown}
          placeholder="Ej. Juan Pérez o nombre del negocio"
          required
          role="combobox"
          value={value}
        />
        {showSuggestions && (
          <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-lg border border-[#dfe3df] bg-white p-1 shadow-[0_12px_32px_rgba(34,48,42,.14)]" id="folder-suggestions" role="listbox">
            {suggestions.map((folder, index) => (
              <button
                aria-selected={index === activeIndex}
                className={`${index === activeIndex ? "bg-[#edf3ef] text-[#235c4c]" : "text-[#303a36] hover:bg-[#f6f8f6]"} flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-xs font-medium transition-colors`}
                id={`folder-suggestion-${folder.id}`}
                key={folder.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectFolder(folder)}
                role="option"
                type="button"
              >
                <span className="truncate">{folder.name}</span>
                <small className="ml-3 shrink-0 text-[9px] font-normal text-[#89928e]">Carpeta existente</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <small className={`${exactFolder ? "text-[#3f765f]" : "text-[#7b8580]"} text-[10px] leading-relaxed`}>
        {exactFolder ? `Se usará la carpeta existente “${exactFolder.name}”.` : "Si el cliente todavía no existe, su carpeta se creará junto con el pedido."}
      </small>
    </>
  );
}

function AssignmentStep({
  assignment,
  clientName,
  effectiveOrderId,
  folderExists,
  onAssignmentChange,
  onOrderChange,
  pendingOrders,
  recommendedOrder,
  uploadCount,
}: {
  assignment: "new" | "existing";
  clientName: string;
  effectiveOrderId: string;
  folderExists: boolean;
  onAssignmentChange: (value: "new" | "existing") => void;
  onOrderChange: (value: string) => void;
  pendingOrders: Order[];
  recommendedOrder?: Order;
  uploadCount: number;
}) {
  return (
    <div className={ui.assignmentStep}>
      <button type="button" className={`${ui.assignmentCard} ${assignment === "new" ? ui.assignmentSelected : ""}`} onClick={() => onAssignmentChange("new")}>
        <span className={`${ui.assignmentRadio} ${assignment === "new" ? ui.assignmentRadioSelected : ""}`} />
        <span><strong>Asignar a pedido nuevo</strong><small>{folderExists ? `Crear un pedido dentro de ${clientName}.` : `Crear el pedido y la carpeta ${clientName}.`} Se generará un código como PEDIDO-01072026-1220.</small></span>
      </button>
      <button type="button" disabled={!recommendedOrder || !uploadCount} className={`${ui.assignmentCard} ${assignment === "existing" ? ui.assignmentSelected : ""}`} onClick={() => recommendedOrder && uploadCount && onAssignmentChange("existing")}>
        <span className={`${ui.assignmentRadio} ${assignment === "existing" ? ui.assignmentRadioSelected : ""}`} />
        <span><strong>Asignar a un pedido</strong><small>{!uploadCount ? "Primero seleccioná al menos una imagen." : recommendedOrder ? `Último pedido activo: ${recommendedOrder.code}.` : "No hay pedidos activos disponibles."}</small></span>
      </button>
      {assignment === "existing" && pendingOrders.length > 0 && (
        <label className={`${ui.field} ${ui.assignmentSelect}`}>
          <span>Pedido activo</span>
          <select value={effectiveOrderId} onChange={(event) => onOrderChange(event.target.value)}>
            {pendingOrders.map((order, index) => <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Último pedido" : ""}</option>)}
          </select>
        </label>
      )}
      <div className={ui.safetyNote}><span>✓</span><p><strong>Confirmación manual</strong>Cada imagen y su descripción quedarán vinculadas al pedido elegido mediante su ID.</p></div>
    </div>
  );
}

function normalizeClientName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}
