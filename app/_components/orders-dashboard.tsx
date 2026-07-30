"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sileo, Toaster } from "sileo";
import "sileo/styles.css";
import {
  fileToOrderImage,
  findLatestPendingOrder,
  folderIdFromName,
  type ClientFolder,
  type Order,
  type OrderImage,
  type OrderStatus,
} from "../../lib/orders";
import {
  ArrowIcon,
  BoxIcon,
  CloseIcon,
  FolderIcon,
  GridIcon,
  ImageIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "./icons";

const seedFolders: ClientFolder[] = [
  { id: "folder-clash", name: "Clash" },
  { id: "folder-juan", name: "Juan" },
  { id: "folder-maria", name: "María" },
];

function legacyImages(pedidoId: string, names: string[], createdAt: string): OrderImage[] {
  return names.map((name, index) => ({
    id: `${pedidoId}-image-${index + 1}`,
    pedidoId,
    name,
    addedAt: createdAt,
  }));
}

const seedOrders: Order[] = [
  {
    id: "d284425f-5142-49e4-a447-a2ccfa871001",
    code: "CLASH-024",
    clientId: "folder-clash",
    clientName: "Clash",
    status: "Pendiente",
    notes: "Tríptico de mascotas, marco negro.",
    createdAt: "2026-07-27T18:20:00.000Z",
    images: legacyImages("d284425f-5142-49e4-a447-a2ccfa871001", ["luna.jpg", "toto.jpg", "referencia.jpg"], "2026-07-27T18:20:00.000Z"),
    cover: "linear-gradient(145deg, #d9c1a5, #725649)",
  },
  {
    id: "d284425f-5142-49e4-a447-a2ccfa871002",
    code: "CLASH-023",
    clientId: "folder-juan",
    clientName: "Juan",
    status: "Pendiente",
    notes: "Confirmar medida antes de producir.",
    createdAt: "2026-07-26T14:30:00.000Z",
    images: legacyImages("d284425f-5142-49e4-a447-a2ccfa871002", ["familia.jpg", "estilo.png"], "2026-07-26T14:30:00.000Z"),
    cover: "linear-gradient(145deg, #96b3b2, #314d52)",
  },
  {
    id: "d284425f-5142-49e4-a447-a2ccfa871003",
    code: "CLASH-022",
    clientId: "folder-maria",
    clientName: "María",
    status: "Terminado",
    notes: "Listo para retirar.",
    createdAt: "2026-07-25T11:10:00.000Z",
    images: legacyImages("d284425f-5142-49e4-a447-a2ccfa871003", ["boda-01.jpg", "boda-02.jpg", "boda-03.jpg", "mockup.jpg"], "2026-07-25T11:10:00.000Z"),
    cover: "linear-gradient(145deg, #d9c7bb, #806d67)",
  },
  {
    id: "d284425f-5142-49e4-a447-a2ccfa871004",
    code: "CLASH-021",
    clientId: "folder-clash",
    clientName: "Clash",
    status: "Entregado",
    notes: "",
    createdAt: "2026-07-23T09:45:00.000Z",
    images: legacyImages("d284425f-5142-49e4-a447-a2ccfa871004", ["paisaje.jpg"], "2026-07-23T09:45:00.000Z"),
    cover: "linear-gradient(145deg, #95a67c, #374634)",
  },
];

const statuses: OrderStatus[] = ["Pendiente", "En producción", "Terminado", "Entregado"];
const statusStyles: Record<OrderStatus, string> = {
  Pendiente: "status-pending",
  "En producción": "status-production",
  Terminado: "status-finished",
  Entregado: "status-delivered",
};

const navigation = [
  { label: "Resumen", href: "/", view: "resumen", icon: GridIcon },
  { label: "Pedidos", href: "/pedidos", view: "pedidos", icon: BoxIcon },
  { label: "Carpetas", href: "/carpetas", view: "carpetas", icon: FolderIcon },
];

type DashboardView = "resumen" | "pedidos" | "carpetas";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" })
    .format(new Date(value))
    .replace(".", "");
}

function getNextCode(orders: Order[]) {
  const now = new Date();
  const date = [
    String(now.getDate()).padStart(2, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    now.getFullYear(),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  const baseCode = `CLASH-${date}-${time}`;
  const matches = orders.filter((order) => (
    order.code === baseCode || order.code.startsWith(`${baseCode}-`)
  )).length;

  return matches === 0 ? baseCode : `${baseCode}-${String(matches + 1).padStart(2, "0")}`;
}

export function OrdersDashboard({ view = "resumen" }: { view?: DashboardView }) {
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [folders, setFolders] = useState<ClientFolder[]>(seedFolders);
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<OrderStatus | "Todos">("Todos");
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("mava-orders");
      if (saved) {
        try {
          type StoredOrder = Omit<Order, "clientId" | "images"> & {
            clientId?: string;
            images?: OrderImage[];
            imageNames?: string[];
          };
          const storedOrders = JSON.parse(saved) as StoredOrder[];
          const migratedOrders = storedOrders.map((order) => {
            const clientId = order.clientId ?? folderIdFromName(order.clientName);
            return {
              ...order,
              clientId,
              images: order.images ?? legacyImages(order.id, order.imageNames ?? [], order.createdAt),
            };
          });
          const migratedFolders = migratedOrders.reduce<ClientFolder[]>((result, order) => {
            if (!result.some((folder) => folder.id === order.clientId)) {
              result.push({ id: order.clientId, name: order.clientName });
            }
            return result;
          }, [...seedFolders]);
          setFolders(migratedFolders);
          setOrders(migratedOrders);
        } catch {
          window.localStorage.removeItem("mava-orders");
        }
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("mava-orders", JSON.stringify(orders));
  }, [orders, hydrated]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      const matchesStatus = activeStatus === "Todos" || order.status === activeStatus;
      const matchesQuery =
        !normalized ||
        `${order.code} ${order.clientName} ${order.notes}`.toLocaleLowerCase("es").includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [activeStatus, orders, query]);

  const folderSummaries = useMemo(() => folders
    .map((folder) => {
      const folderOrders = filteredOrders
        .filter((order) => order.clientId === folder.id)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const pendingCount = folderOrders.filter((order) => order.status === "Pendiente").length;
      return {
        ...folder,
        orders: folderOrders,
        orderCount: folderOrders.length,
        pendingCount,
        imageCount: folderOrders.reduce((total, order) => total + order.images.length, 0),
        latestAt: folderOrders[0]?.createdAt,
      };
    })
    .filter((folder) => folder.orderCount > 0 || (activeStatus === "Todos" && !query.trim())),
  [activeStatus, filteredOrders, folders, query]);

  const counts = useMemo(
    () => Object.fromEntries(statuses.map((status) => [status, orders.filter((order) => order.status === status).length])),
    [orders],
  );

  function createOrder(input: { clientId: string; notes: string; files: File[] }) {
    const folder = folders.find((candidate) => candidate.id === input.clientId);
    if (!folder) return;
    const id = crypto.randomUUID();
    const order: Order = {
      id,
      code: getNextCode(orders),
      clientId: folder.id,
      clientName: folder.name,
      status: "Pendiente",
      notes: input.notes,
      createdAt: new Date().toISOString(),
      images: input.files.map((file) => ({
        id: crypto.randomUUID(),
        pedidoId: id,
        name: file.name,
        addedAt: new Date().toISOString(),
      })),
      cover: "linear-gradient(145deg, #dccab0, #8d7255)",
    };
    setOrders((current) => [order, ...current]);
    setShowCreate(false);
    setSelectedOrder(order);
  }

  function updateStatus(id: string, status: OrderStatus) {
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, status } : order)));
    setSelectedOrder((current) => (current?.id === id ? { ...current, status } : current));
  }

  async function uploadImagesToFolder(clientId: string, files: File[], requestedOrderId?: string) {
    const folder = folders.find((candidate) => candidate.id === clientId);
    if (!folder) {
      sileo.error({
        title: "Error al subir la imagen",
        description: "La carpeta seleccionada ya no existe. Intenta nuevamente.",
      });
      return false;
    }

    const targetOrder = requestedOrderId
      ? orders.find((order) => (
          order.id === requestedOrderId
          && order.clientId === clientId
          && order.status === "Pendiente"
        ))
      : findLatestPendingOrder(orders, clientId);
    if (!targetOrder) {
      sileo.warning({
        title: "No hay pedidos pendientes",
        description: `${folder.name} no tiene ningún pedido pendiente. Crea un pedido nuevo antes de agregar imágenes.`,
      });
      return false;
    }

    try {
      const uploadedImages = await Promise.all(
        files.map((file) => fileToOrderImage(file, targetOrder.id)),
      );
      const updatedOrder = {
        ...targetOrder,
        images: [...uploadedImages, ...targetOrder.images],
      };
      const updatedOrders = orders.map((order) => (
        order.id === targetOrder.id ? updatedOrder : order
      ));

      if (hydrated) {
        window.localStorage.setItem("mava-orders", JSON.stringify(updatedOrders));
      }
      setOrders(updatedOrders);
      setSelectedOrder((current) => (
        current?.clientId === clientId ? updatedOrder : current
      ));
      sileo.success({
        title: files.length === 1 ? "Nueva imagen agregada" : "Nuevas imágenes agregadas",
        description: files.length === 1
          ? `Se agregó una nueva imagen al pedido pendiente de ${folder.name}.`
          : `Se agregaron ${files.length} imágenes al pedido pendiente de ${folder.name}.`,
      });
      return true;
    } catch {
      sileo.error({
        title: "Error al subir la imagen",
        description: `No se pudo agregar la imagen al pedido de ${folder.name}. Intenta nuevamente.`,
      });
      return false;
    }
  }

  async function createPendingOrderWithImages(clientId: string, files: File[]) {
    const folder = folders.find((candidate) => candidate.id === clientId);
    if (!folder) return false;

    try {
      const id = crypto.randomUUID();
      const images = await Promise.all(files.map((file) => fileToOrderImage(file, id)));
      const order: Order = {
        id,
        code: getNextCode(orders),
        clientId: folder.id,
        clientName: folder.name,
        status: "Pendiente",
        notes: "",
        createdAt: new Date().toISOString(),
        images,
        cover: "linear-gradient(145deg, #dccab0, #8d7255)",
      };
      const updatedOrders = [order, ...orders];
      if (hydrated) {
        window.localStorage.setItem("mava-orders", JSON.stringify(updatedOrders));
      }
      setOrders(updatedOrders);
      setSelectedOrder(order);
      sileo.success({
        title: "Pedido nuevo creado",
        description: `Las imágenes se asignaron al nuevo pedido ${order.code} de ${folder.name}.`,
      });
      return true;
    } catch {
      sileo.error({
        title: "Error al crear el pedido",
        description: `No se pudo crear el pedido de ${folder.name}. Intenta nuevamente.`,
      });
      return false;
    }
  }

  return (
    <div className="app-shell">
      <Toaster position="top-right" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div><strong>MAVA</strong><span>Pedidos</span></div>
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map(({ label, href, view: itemView, icon: Icon }) => (
            <Link className={`nav-item ${view === itemView ? "active" : ""}`} href={href} key={label}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">MU</div>
          <div><strong>Mi taller</strong><span>Administrador</span></div>
          <MoreIcon />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Lunes, 27 de julio</p>
            <h1>Buen día <span>👋</span></h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button upload-button" onClick={() => setShowUpload(true)}>
              <UploadIcon /> Subir imágenes
            </button>
            <button className="primary-button" onClick={() => setShowCreate(true)}>
              <PlusIcon /> Nuevo pedido
            </button>
          </div>
        </header>

        {view === "resumen" && <section className="overview" aria-labelledby="overview-title">
          <div className="section-heading">
            <div><p className="eyebrow">Vista general</p><h2 id="overview-title">Pedidos en marcha</h2></div>
            <button className="text-button" onClick={() => setActiveStatus("Todos")}>Ver todos <ArrowIcon /></button>
          </div>
          <div className="metric-grid">
            {statuses.map((status, index) => (
              <button
                className={`metric-card metric-${index + 1} ${activeStatus === status ? "selected" : ""}`}
                key={status}
                onClick={() => setActiveStatus(activeStatus === status ? "Todos" : status)}
              >
                <span className="metric-label">{status}</span>
                <strong>{counts[status]}</strong>
                <span className="metric-caption">{index === 0 ? "En el taller ahora" : index === 1 ? "Listos para entregar" : "Pedidos completados"}</span>
                <span className="metric-arrow"><ArrowIcon /></span>
              </button>
            ))}
          </div>
        </section>}

        <section className="orders-section" aria-labelledby="orders-title">
          <div className="section-heading orders-heading">
            <div>
              <p className="eyebrow">{view === "pedidos" ? "Gestión" : "Organización"}</p>
              <h2 id="orders-title">{view === "pedidos" ? "Todos los pedidos" : "Carpetas de pedidos"}</h2>
            </div>
            <label className="search-box">
              <SearchIcon />
              <span className="sr-only">Buscar pedidos</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o código..." />
              <kbd>⌘ K</kbd>
            </label>
          </div>

          <div className="order-list">
            {view === "pedidos" ? (
              <>
                <div className="list-head"><span>Pedido</span><span>Estado</span><span>Imágenes</span><span>Creado</span><span /></div>
                {filteredOrders.map((order) => (
                  <button className="order-row" key={order.id} onClick={() => setSelectedOrder(order)}>
                    <span className="order-identity">
                      <span className="order-cover" style={{ background: order.cover }}><ImageIcon /></span>
                      <span><strong>{order.code}</strong><small>Carpeta {order.clientName}</small></span>
                    </span>
                    <span><span className={`status-pill ${statusStyles[order.status]}`}><i />{order.status}</span></span>
                    <span className="image-count"><ImageIcon /> {order.images.length}</span>
                    <span className="date-cell">{formatDate(order.createdAt)}</span>
                    <span className="row-arrow"><ArrowIcon /></span>
                  </button>
                ))}
                {!filteredOrders.length && <div className="empty-state"><SearchIcon /><strong>No encontramos pedidos</strong><span>Probá con otro código, carpeta o estado.</span></div>}
              </>
            ) : (
              <>
                <div className="list-head"><span>Carpeta</span><span>Pedidos</span><span>Imágenes</span><span>Actividad</span><span /></div>
                {folderSummaries.map((folder) => (
                  <button className="order-row" key={folder.id} onClick={() => setSelectedFolderId(folder.id)}>
                    <span className="order-identity">
                      <span className="order-cover folder-cover"><BoxIcon /></span>
                      <span><strong>{folder.name}</strong><small>{folder.orderCount} pedido{folder.orderCount === 1 ? "" : "s"} en la carpeta</small></span>
                    </span>
                    <span><span className={`status-pill ${folder.pendingCount ? "status-pending" : "status-delivered"}`}><i />{folder.pendingCount ? `${folder.pendingCount} pendiente${folder.pendingCount === 1 ? "" : "s"}` : "Sin pendientes"}</span></span>
                    <span className="image-count"><ImageIcon /> {folder.imageCount}</span>
                    <span className="date-cell">{folder.latestAt ? formatDate(folder.latestAt) : "Sin actividad"}</span>
                    <span className="row-arrow"><ArrowIcon /></span>
                  </button>
                ))}
                {!folderSummaries.length && <div className="empty-state"><SearchIcon /><strong>No encontramos carpetas</strong><span>Probá con otro nombre, código o estado.</span></div>}
              </>
            )}
          </div>
        </section>
      </main>

      <button className="mobile-add" aria-label="Crear pedido" onClick={() => setShowCreate(true)}><PlusIcon /></button>

      {showCreate && (
        <CreateOrderModal
          folders={folders}
          orders={orders}
          onClose={() => setShowCreate(false)}
          onCreate={createOrder}
          onAssignExisting={uploadImagesToFolder}
        />
      )}
      {showUpload && (
        <UploadToFolderModal
          folders={folders}
          orders={orders}
          onClose={() => setShowUpload(false)}
          onUpload={uploadImagesToFolder}
          onCreateNew={createPendingOrderWithImages}
        />
      )}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={(status) => updateStatus(selectedOrder.id, status)}
          onAddImages={(files) => uploadImagesToFolder(selectedOrder.clientId, files)}
        />
      )}
      {selectedFolderId && !selectedOrder && (
        <FolderDrawer
          folder={folders.find((folder) => folder.id === selectedFolderId)}
          orders={orders.filter((order) => order.clientId === selectedFolderId).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))}
          onClose={() => setSelectedFolderId(null)}
          onSelectOrder={(order) => setSelectedOrder(order)}
        />
      )}
    </div>
  );
}

function CreateOrderModal({
  folders,
  orders,
  onClose,
  onCreate,
  onAssignExisting,
}: {
  folders: ClientFolder[];
  orders: Order[];
  onClose: () => void;
  onCreate: (input: { clientId: string; notes: string; files: File[] }) => void;
  onAssignExisting: (clientId: string, files: File[], orderId?: string) => Promise<boolean>;
}) {
  const [clientId, setClientId] = useState(folders[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [assignment, setAssignment] = useState<"new" | "existing">("new");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pendingOrders = useMemo(
    () => orders
      .filter((order) => order.clientId === clientId && order.status === "Pendiente")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [clientId, orders],
  );
  const recommendedOrder = pendingOrders[0];
  const effectiveOrderId = selectedOrderId || recommendedOrder?.id || "";
  const nextCode = getNextCode(orders);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!clientId || saving) return;

    if (step === 1) {
      setSelectedOrderId(recommendedOrder?.id ?? "");
      setStep(2);
      return;
    }

    if (assignment === "new") {
      onCreate({ clientId, notes: notes.trim(), files });
      return;
    }

    if (!files.length || !effectiveOrderId) return;
    setSaving(true);
    const success = await onAssignExisting(clientId, files, effectiveOrderId);
    setSaving(false);
    if (success) onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title">
        <div className="modal-head">
          <div><p className="eyebrow">Nuevo pedido · Paso {step} de 2</p><h2 id="new-order-title">{step === 1 ? `Crear ${nextCode}` : "Asignar imágenes"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <>
              <label className="field"><span>Cliente / carpeta</span><select autoFocus required value={clientId} onChange={(event) => setClientId(event.target.value)}>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
              <label className="field"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Medidas, marco, fecha de entrega..." rows={3} /></label>
              <div className="upload-zone">
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                <UploadIcon />
                <strong>{files.length ? `${files.length} imagen${files.length === 1 ? "" : "es"} seleccionada${files.length === 1 ? "" : "s"}` : "Agregar imágenes"}</strong>
                <span>En el próximo paso vas a confirmar a qué pedido asignarlas.</span>
                <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>
              </div>
              {files.length > 0 && <div className="file-summary">{files.map((file) => <span key={`${file.name}-${file.size}`}><ImageIcon />{file.name}</span>)}</div>}
            </>
          ) : (
            <div className="assignment-step">
              <button type="button" className={`assignment-card ${assignment === "new" ? "selected" : ""}`} onClick={() => setAssignment("new")}>
                <span className="assignment-radio" />
                <span><strong>Asignar a pedido nuevo</strong><small>Crear {nextCode} y vincularle las imágenes seleccionadas.</small></span>
              </button>
              <button type="button" disabled={!recommendedOrder || !files.length} className={`assignment-card ${assignment === "existing" ? "selected" : ""}`} onClick={() => recommendedOrder && files.length && setAssignment("existing")}>
                <span className="assignment-radio" />
                <span><strong>Asignar a un pedido</strong><small>{!files.length ? "Primero seleccioná al menos una imagen." : recommendedOrder ? `Pedido recomendado: ${recommendedOrder.code}, por ser el más reciente.` : "No hay pedidos pendientes disponibles."}</small></span>
              </button>
              {assignment === "existing" && pendingOrders.length > 0 && (
                <label className="field assignment-select">
                  <span>Pedido pendiente</span>
                  <select value={effectiveOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                    {pendingOrders.map((order, index) => <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Recomendado (último pedido)" : ""}</option>)}
                  </select>
                </label>
              )}
              <div className="safety-note"><span>✓</span><p><strong>Confirmación manual</strong>No se creará ni modificará ningún pedido hasta que confirmes esta selección.</p></div>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 2 ? "Atrás" : "Cancelar"}</button>
            <button className="primary-button" disabled={saving || (step === 2 && assignment === "existing" && (!files.length || !effectiveOrderId))} type="submit">{saving ? "Guardando..." : step === 1 ? "Continuar" : assignment === "new" ? "Crear pedido" : "Asignar imágenes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadToFolderModal({
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
      .filter((order) => order.clientId === clientId && order.status === "Pendiente")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [clientId, orders],
  );
  const recommendedOrder = pendingOrders[0];
  const effectiveOrderId = selectedOrderId || recommendedOrder?.id || "";

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
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="upload-folder-title">
        <div className="modal-head">
          <div><p className="eyebrow">Paso {step} de 2</p><h2 id="upload-folder-title">{step === 1 ? "Subir imágenes" : "¿A qué pedido las asignamos?"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <>
              <label className="field">
                <span>Cliente / carpeta</span>
                <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                  {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                </select>
              </label>
              <div className="upload-zone">
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                <UploadIcon />
                <strong>{files.length ? `${files.length} imagen${files.length === 1 ? "" : "es"} lista${files.length === 1 ? "" : "s"}` : "Seleccioná las imágenes"}</strong>
                <span>En el próximo paso vas a elegir el pedido de destino.</span>
                <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>
              </div>
              {files.length > 0 && <div className="file-summary">{files.map((file) => <span key={`${file.name}-${file.size}`}><ImageIcon />{file.name}</span>)}</div>}
            </>
          ) : (
            <div className="assignment-step">
              <button type="button" className={`assignment-card ${assignment === "new" ? "selected" : ""}`} onClick={() => setAssignment("new")}>
                <span className="assignment-radio" />
                <span><strong>Asignar a pedido nuevo</strong><small>Se creará un pedido pendiente para {folders.find((folder) => folder.id === clientId)?.name}.</small></span>
              </button>
              <button type="button" disabled={!recommendedOrder} className={`assignment-card ${assignment === "existing" ? "selected" : ""}`} onClick={() => recommendedOrder && setAssignment("existing")}>
                <span className="assignment-radio" />
                <span>
                  <strong>Asignar a un pedido</strong>
                  <small>{recommendedOrder ? `Pedido recomendado: ${recommendedOrder.code}, por ser el más reciente.` : "No hay pedidos pendientes disponibles."}</small>
                </span>
              </button>
              {assignment === "existing" && pendingOrders.length > 0 && (
                <label className="field assignment-select">
                  <span>Pedido pendiente</span>
                  <select value={effectiveOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                    {pendingOrders.map((order, index) => (
                      <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Recomendado (último pedido)" : ""}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="safety-note"><span>✓</span><p><strong>Destino confirmado</strong>Las {files.length} imágenes quedarán vinculadas por ID y no se mezclarán con otros pedidos.</p></div>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 2 ? "Atrás" : "Cancelar"}</button>
            <button className="primary-button" disabled={!files.length || uploading || (step === 2 && assignment === "existing" && !effectiveOrderId)} type="submit">
              {uploading ? "Guardando..." : step === 1 ? "Continuar" : assignment === "new" ? "Crear y asignar" : "Asignar imágenes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FolderDrawer({
  folder,
  orders,
  onClose,
  onSelectOrder,
}: {
  folder: ClientFolder | undefined;
  orders: Order[];
  onClose: () => void;
  onSelectOrder: (order: Order) => void;
}) {
  if (!folder) return null;

  return (
    <div className="modal-backdrop drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer folder-drawer" role="dialog" aria-modal="true" aria-labelledby="folder-title">
        <div className="modal-head">
          <div><p className="eyebrow">Carpeta de pedidos</p><h2 id="folder-title">{folder.name}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <div className="folder-summary-strip">
          <span><strong>{orders.length}</strong>Pedidos</span>
          <span><strong>{orders.filter((order) => order.status === "Pendiente").length}</strong>Pendientes</span>
          <span><strong>{orders.reduce((total, order) => total + order.images.length, 0)}</strong>Imágenes</span>
        </div>
        <div className="folder-order-list">
          {orders.map((order) => (
            <button className="folder-order-card" key={order.id} onClick={() => onSelectOrder(order)}>
              <span className="order-cover" style={{ background: order.cover }}><ImageIcon /></span>
              <span className="folder-order-copy">
                <strong>{order.code}</strong>
                <small>{order.images.length} imagen{order.images.length === 1 ? "" : "es"} · {formatDate(order.createdAt)}</small>
              </span>
              <span className={`status-pill ${statusStyles[order.status]}`}><i />{order.status}</span>
              <ArrowIcon />
            </button>
          ))}
          {!orders.length && <div className="drawer-empty">Esta carpeta todavía no tiene pedidos.</div>}
        </div>
      </aside>
    </div>
  );
}

function OrderDrawer({
  order,
  onClose,
  onStatusChange,
  onAddImages,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onAddImages: (files: File[]) => Promise<boolean>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function addImages(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    await onAddImages(files);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="modal-backdrop drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <div className="modal-head">
          <div><p className="eyebrow">{order.code}</p><h2 id="order-title">{order.clientName}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <div className="drawer-content">
          <label className="field"><span>Estado</span><select value={order.status} onChange={(event) => onStatusChange(event.target.value as OrderStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <div className="detail-block"><span>Notas</span><p>{order.notes || "Sin notas para este pedido."}</p></div>
          <div className="detail-block">
            <div className="detail-title"><span>Imágenes</span><small>{order.images.length} archivos</small></div>
            <div className="image-grid">
              {order.images.map((image, index) => (
                <div className={`image-tile ${image.previewUrl ? "has-preview" : ""}`} key={image.id} style={image.previewUrl ? { backgroundImage: `url("${image.previewUrl}")` } : index === 0 ? { background: order.cover } : undefined}>
                  {!image.previewUrl && <ImageIcon />}
                  <small>{image.name}</small>
                  <time dateTime={image.addedAt}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(image.addedAt))}</time>
                </div>
              ))}
              {!order.images.length && <div className="drawer-empty">Todavía no hay imágenes.</div>}
            </div>
          </div>
          <div className="locked-target"><span>✓</span><p><strong>Destino bloqueado</strong>Las nuevas imágenes se asignarán a <b>{order.code}</b> mediante su ID interno.</p></div>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void addImages(Array.from(event.target.files ?? []))} />
          <button className="primary-button full-button" disabled={uploading} onClick={() => fileInput.current?.click()}><UploadIcon /> {uploading ? "Subiendo..." : `Agregar imágenes de ${order.clientName}`}</button>
        </div>
      </aside>
    </div>
  );
}
