"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isOrderActive, type PendingImageUpload } from "../../../lib/orders";
import { loadSharedImages, removeSharedImages, saveSharedImages, type SharedImages } from "../../../lib/shared-images";
import { createRemoteOrder, uploadRemoteImages } from "../../../lib/supabase/orders-repository";
import { BackIcon, PlusIcon, SpinnerIcon, UploadIcon } from "../icons";
import { CreateOrderPage } from "./create-order-page";
import { ImageDescriptionEditor } from "./image-description-editor";
import { SelectedImageThumbnails } from "./local-image-preview";
import { LoadingPage } from "./resource-states";
import { ui } from "./shared";
import { useOrdersWorkspace } from "./use-orders-workspace";

const errors: Record<string, string> = {
  images: "No recibimos imágenes válidas. Seleccioná las fotos en WhatsApp y volvé a compartirlas.",
  size: "Podés compartir hasta 30 imágenes por vez, de hasta 6 MB cada una. Volvé a seleccionar las fotos.",
  storage: "No pudimos guardar las fotos en este dispositivo. Revisá el espacio disponible y volvé a compartirlas.",
  worker: "La app necesita actualizarse. Cerrala, abrila con conexión y volvé a compartir las imágenes.",
};

export function SharedImagesPage() {
  const params = useSearchParams();
  const id = params.get("share") ?? "";
  // A new share must never reuse a previous share's in-memory files or selection.
  return <SharedImagesFlow key={`${id}:${params.get("error")}`} id={id} receiveError={params.get("error")} />;
}

function SharedImagesFlow({ id, receiveError }: { id: string; receiveError: string | null }) {
  const router = useRouter();
  const workspace = useOrdersWorkspace();
  const [draft, setDraft] = useState<SharedImages | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"choose" | "new" | "existing">("choose");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!id || receiveError) return;
    let active = true;
    void loadSharedImages(id).then((loaded) => {
      if (!active) return;
      setDraft(loaded);
      if (loaded.orderId) {
        setSelectedOrderId(loaded.orderId);
        setMode("existing");
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "No pudimos recuperar las imágenes compartidas.");
    });
    return () => { active = false; };
  }, [id, receiveError]);

  const initialError = receiveError ? errors[receiveError] ?? errors.images : !id
    ? "Para empezar, seleccioná una imagen en WhatsApp, tocá Compartir y elegí MAVA Pedidos."
    : "";
  const activeOrders = workspace.orders.filter((order) => isOrderActive(order.status))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const search = normalize(query);
  const matchingOrders = activeOrders.filter((order) => normalize(`${order.code} ${order.clientName} ${order.folderName ?? ""}`).includes(search));
  const selectedOrder = activeOrders.find((order) => order.id === (draft?.orderId || selectedOrderId));

  async function finish(orderId: string) {
    // Successful uploads must not be reported as failures if local cleanup fails.
    await removeSharedImages(id).catch(() => undefined);
    void workspace.refreshOrders();
    router.replace(`/pedidos/${encodeURIComponent(orderId)}`);
  }

  async function upload(orderId: string, clientId: string, uploads: PendingImageUpload[]) {
    if (!draft) return false;
    let next: SharedImages = { ...draft, orderId, uploads };
    setDraft(next);
    setSelectedOrderId(orderId);
    setMode("existing");
    await saveSharedImages(id, next);
    // Checkpoint after each success; retries only send the remaining files.
    for (const item of uploads) {
      const result = await uploadRemoteImages({ clientId, orderId, uploads: [item] });
      if (result.failedFiles.length || !result.images.length) {
        setError(`${item.file.name}: ${result.failedFiles[0]?.reason ?? "No se pudo subir."} Las imágenes pendientes se conservaron para reintentar.`);
        void workspace.refreshOrders();
        return false;
      }
      next = { ...next, uploads: next.uploads.filter((candidate) => candidate !== item) };
      setDraft(next);
      await saveSharedImages(id, next);
    }
    await finish(orderId);
    return true;
  }

  async function submitExisting(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedOrder || !draft || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await upload(selectedOrder.id, selectedOrder.clientId, draft.uploads);
    } catch {
      setError("No pudimos completar la subida. Las imágenes pendientes siguen disponibles; revisá la conexión y reintentá.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!draft && !error && !initialError) return <LoadingPage />;

  if (mode === "new" && draft) {
    return <>
      {error && <p className="mb-4 text-sm text-[#a34e42]" role="alert">{error}</p>}
      <CreateOrderPage
        folders={workspace.folders}
        orders={workspace.orders}
        initialUploads={draft.uploads}
        onClose={() => setMode("choose")}
        onOpenOrder={() => undefined}
        onAssignExisting={async (clientId, uploads, orderId) => {
          if (!orderId || busy.current) return false;
          busy.current = true;
          setSaving(true);
          try { return await upload(orderId, clientId, uploads); }
          catch { setError("No pudimos completar la subida. Reintentá con las imágenes pendientes."); return false; }
          finally { busy.current = false; setSaving(false); }
        }}
        onCreate={async (input) => {
          if (busy.current) return null;
          busy.current = true;
          setSaving(true);
          setError("");
          try {
            // Create once, then keep the order ID even if uploading fails.
            await saveSharedImages(id, { ...draft, uploads: input.uploads });
            const order = await createRemoteOrder(input.clientName, input.notes, input.canvasesOrdered, input.locality);
            await upload(order.id, order.clientId, input.uploads);
            return null;
          } catch {
            setError("No pudimos completar la operación. Revisá la conexión y reintentá.");
            return null;
          } finally { void workspace.refreshOrders(); busy.current = false; setSaving(false); }
        }}
      />
    </>;
  }

  return (
    <section className={ui.pagePanel} aria-labelledby="shared-images-title">
      <button className={ui.backButton} disabled={saving} onClick={() => mode === "existing" && !draft?.orderId ? setMode("choose") : router.replace("/")} type="button"><BackIcon />Volver</button>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}><div><p className={ui.eyebrow}>Imágenes compartidas</p><h2 id="shared-images-title">{mode === "existing" ? "Subir imagen a pedido" : "¿Qué querés hacer con las imágenes?"}</h2></div></div>
        {(initialError || error) && <p className="mb-4 text-sm text-[#a34e42]" role="alert">{initialError || error}</p>}
        {draft && <>
          <p className="mb-4 text-sm text-[#68726d]">{draft.uploads.length} imagen{draft.uploads.length === 1 ? "" : "es"} pendiente{draft.uploads.length === 1 ? "" : "s"}. Se conservarán en este dispositivo por hasta 24 horas.</p>
          {mode === "choose" ? <>
            <SelectedImageThumbnails uploads={draft.uploads} />
            <div className="mt-6 grid gap-3">
              <button className={ui.primaryButton} type="button" onClick={() => setMode("new")}><PlusIcon />CREAR PEDIDO</button>
              <button className={ui.secondaryButton} type="button" onClick={() => setMode("existing")}><UploadIcon />SUBIR IMAGEN A PEDIDO</button>
            </div>
          </> : <form onSubmit={submitExisting}>
            {draft.orderId ? <>
              <p className="mb-4 rounded-lg bg-[#edf3ef] p-3 text-sm">Pedido: <strong>{selectedOrder?.code ?? (saving ? "Guardando pedido…" : "No disponible para subir imágenes")}</strong>{selectedOrder && ` · ${selectedOrder.clientName}`}. Las imágenes se guardarán en este pedido.</p>
              {!saving && !selectedOrder && draft.uploads.length > 0 && <button className={`${ui.secondaryButton} mb-4`} type="button" onClick={async () => {
                const next = { ...draft, orderId: undefined };
                try {
                  await saveSharedImages(id, next);
                  setDraft(next);
                  setSelectedOrderId("");
                  setMode("choose");
                } catch { setError("No pudimos cambiar el destino. Intentá nuevamente."); }
              }}>Elegir otro destino para las imágenes pendientes</button>}
            </> : <>
              <label className={ui.field}><span>Buscar por cliente o código</span><input disabled={saving} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del cliente o PEDIDO-…" /></label>
              <label className={ui.field}><span>Pedido de destino</span><select disabled={saving} required value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                <option value="">Seleccioná un pedido</option>
                {selectedOrder && !matchingOrders.includes(selectedOrder) && <option value={selectedOrder.id}>{selectedOrder.code} · {selectedOrder.clientName}</option>}
                {matchingOrders.map((order) => <option key={order.id} value={order.id}>{order.code} · {order.clientName} · {order.status}</option>)}
              </select></label>
              {!matchingOrders.length && <p className="mb-4 text-sm text-[#68726d]">{activeOrders.length ? "No hay coincidencias para esa búsqueda." : "No hay pedidos activos. Volvé y elegí CREAR PEDIDO."}</p>}
            </>}
            <ImageDescriptionEditor disabled={saving} uploads={draft.uploads} onChange={(uploads) => setDraft({ ...draft, uploads })} />
            <button className={`${ui.primaryButton} mt-5 w-full`} disabled={saving || !selectedOrder || !draft.uploads.length} type="submit">{saving ? <><SpinnerIcon className="animate-spin" />Guardando…</> : "SUBIR IMAGEN A PEDIDO"}</button>
            {!draft.uploads.length && draft.orderId && <button className={`${ui.secondaryButton} mt-3 w-full`} disabled={saving} onClick={() => void finish(draft.orderId!)} type="button">Abrir pedido</button>}
          </form>}
          <button className={`${ui.textButton} mt-5 w-full`} disabled={saving} type="button" onClick={async () => {
            try { await removeSharedImages(id); router.replace("/"); }
            catch { setError("No pudimos descartar las imágenes. Intentá nuevamente."); }
          }}>Descartar imágenes compartidas</button>
        </>}
      </div>
    </section>
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").trim();
}
