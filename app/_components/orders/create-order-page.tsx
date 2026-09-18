"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  createPendingImageUploads,
  getOrderFolderId,
  isOrderActive,
  type ClientFolder,
  type Order,
  type PendingImageUpload,
} from "../../../lib/orders";
import { BackIcon, CheckIcon, FileIcon, SpinnerIcon, UploadIcon } from "../icons";
import { ui } from "./shared";
import { ImageDescriptionEditor } from "./image-description-editor";
import { SelectedImageThumbnails } from "./local-image-preview";

export function CreateOrderPage({
  folders,
  orders,
  onClose,
  onCreate,
  onAssignExisting,
  onOpenOrder,
}: {
  folders: ClientFolder[];
  orders: Order[];
  onClose: () => void;
  onCreate: (input: { clientName: string; locality: string; notes: string; canvasesOrdered: boolean; uploads: PendingImageUpload[] }) => Promise<string | null>;
  onAssignExisting: (clientId: string, uploads: PendingImageUpload[], orderId?: string) => Promise<boolean>;
  onOpenOrder: (orderId: string) => void;
}) {
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [locality, setLocality] = useState("");
  const [canvasesOrdered, setCanvasesOrdered] = useState(false);
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
      .filter((order) => getOrderFolderId(order) === matchingFolder?.id && isOrderActive(order.status))
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
    let destinationOrderId: string | null = null;
    if (assignment === "new") {
      destinationOrderId = await onCreate({ clientName: normalizedClientName, locality: locality.trim(), notes: notes.trim(), canvasesOrdered, uploads });
    } else if (uploads.length && effectiveOrderId && matchingFolder) {
      const assigned = await onAssignExisting(matchingFolder.id, uploads, effectiveOrderId);
      if (assigned) destinationOrderId = effectiveOrderId;
    }
    setSaving(false);
    if (destinationOrderId) onOpenOrder(destinationOrderId);
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
      : uploads.length ? "Asignar imágenes" : "Confirmar pedido";

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
          {step === 1 && <Link href="/pedidos/importar" className="mb-5 flex items-center gap-3 rounded-xl border border-[#cbdcd1] bg-[#f0f6f1] p-4 text-inherit no-underline transition-colors hover:bg-[#e6f0e8] focus-visible:outline-2 focus-visible:outline-[#235c4c]"><FileIcon className="size-5 shrink-0 text-[#235c4c]" /><span><strong className="block text-sm font-semibold">¿Tenés el pedido en PDF o Excel?</strong><small className="mt-1 block text-xs text-[#68726d]">Importar datos, cantidades y fotos con vista previa</small></span></Link>}
          {step === 1 ? (
            <FirstStep
              locality={locality}
              onLocalityChange={setLocality}
              clientName={clientName}
              canvasesOrdered={canvasesOrdered}
              fileInput={fileInput}
              folders={folders}
              notes={notes}
              onClientNameChange={setClientName}
              onCanvasesOrderedChange={setCanvasesOrdered}
              onFilesChange={(files) => setUploads(createPendingImageUploads(files))}
              onNotesChange={setNotes}
              uploads={uploads}
            />
          ) : step === 2 ? (
            <ImageDescriptionEditor onChange={setUploads} uploads={uploads} />
          ) : (
            <AssignmentStep
              assignment={assignment}
              canvasesOrdered={canvasesOrdered}
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
              {saving && <SpinnerIcon className="animate-spin" />}
              {saving ? "Guardando..." : step !== 3 ? "Continuar" : assignment === "new" ? "Crear pedido" : "Asignar imágenes"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function FirstStep({
  locality,
  onLocalityChange,
  clientName,
  canvasesOrdered,
  uploads,
  fileInput,
  folders,
  notes,
  onClientNameChange,
  onCanvasesOrderedChange,
  onFilesChange,
  onNotesChange,
}: {
  clientName: string;
  canvasesOrdered: boolean;
  uploads: PendingImageUpload[];
  fileInput: React.RefObject<HTMLInputElement | null>;
  folders: ClientFolder[];
  notes: string;
  onClientNameChange: (value: string) => void;
  onCanvasesOrderedChange: (value: boolean) => void;
  locality: string;
  onLocalityChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <>
      <div className={ui.field}>
        <ClientFolderInput folders={folders} onChange={onClientNameChange} value={clientName} />
      </div>
      <label className={ui.field}>
        <span>Localidad (opcional)</span>
        <input autoComplete="address-level2" maxLength={120} value={locality} onChange={(event) => onLocalityChange(event.target.value)} placeholder="Ej. Mar del Plata" />
      </label>
      <label className={ui.field}>
        <span>Notas generales del pedido</span>
        <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Fecha de entrega u otras indicaciones generales..." rows={3} />
      </label>
      <fieldset className="mb-4 rounded-xl border border-[#dfe3df] bg-[#fafbf9] p-4">
        <legend className="px-1 text-xs font-semibold text-[#34413c]">¿Ya se pidieron las telas?</legend>
        <p className="mb-3 mt-1 text-[10px] leading-relaxed text-[#75807b]">Podrás cambiar esta respuesta después desde el pedido.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            aria-pressed={!canvasesOrdered}
            className={`${!canvasesOrdered ? "border-[#8ca397] bg-[#edf3ef] text-[#235c4c]" : "border-[#dfe3df] bg-white text-[#69736e]"} min-h-10 rounded-lg border px-4 text-xs font-semibold transition-colors`}
            onClick={() => onCanvasesOrderedChange(false)}
            type="button"
          >
            No, todavía no
          </button>
          <button
            aria-pressed={canvasesOrdered}
            className={`${canvasesOrdered ? "border-[#78a08b] bg-[#e4f0e8] text-[#235c4c]" : "border-[#dfe3df] bg-white text-[#69736e]"} inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-semibold transition-colors`}
            onClick={() => onCanvasesOrderedChange(true)}
            type="button"
          >
            {canvasesOrdered && <CheckIcon />} Sí, ya están pedidas
          </button>
        </div>
      </fieldset>
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
                <span className="truncate">{folder.name.toLocaleUpperCase("es")}</span>
                <small className="ml-3 shrink-0 text-[9px] font-normal text-[#89928e]">Carpeta existente</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <small className={`${exactFolder ? "text-[#3f765f]" : "text-[#7b8580]"} text-[10px] leading-relaxed`}>
        {exactFolder ? `Se usará la carpeta existente “${exactFolder.name.toLocaleUpperCase("es")}”.` : "Si el cliente todavía no existe, su carpeta se creará junto con el pedido."}
      </small>
    </>
  );
}

function AssignmentStep({
  assignment,
  canvasesOrdered,
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
  canvasesOrdered: boolean;
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
        <span><strong>Asignar a pedido nuevo</strong><small>{folderExists ? `Crear un pedido dentro de ${clientName.toLocaleUpperCase("es")}.` : `Crear el pedido y la carpeta ${clientName.toLocaleUpperCase("es")}.`} Se generará un código como PEDIDO-01072026-1220.</small></span>
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
      <div className="rounded-xl border border-[#dfe5e1] bg-[#f8faf8] p-4">
        <strong className="block text-xs font-semibold text-[#29352f]">Resumen antes de guardar</strong>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-[#77817c]">Cliente</dt>
          <dd className="truncate text-right font-semibold">{clientName}</dd>
          <dt className="text-[#77817c]">Telas</dt>
          <dd className="text-right font-semibold">{canvasesOrdered ? "Pedidas" : "Sin pedir"}</dd>
          <dt className="text-[#77817c]">Imágenes</dt>
          <dd className="text-right font-semibold">{uploadCount}</dd>
          <dt className="text-[#77817c]">Destino</dt>
          <dd className="truncate text-right font-semibold">{assignment === "new" ? "Pedido nuevo" : pendingOrders.find((order) => order.id === effectiveOrderId)?.code ?? "Pedido activo"}</dd>
        </dl>
      </div>
      <div className={ui.safetyNote}><span>✓</span><p><strong>Confirmación manual</strong>Cada imagen y su descripción quedarán vinculadas al pedido elegido mediante su ID.</p></div>
    </div>
  );
}

function normalizeClientName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}
