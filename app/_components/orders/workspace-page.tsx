"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  isMavaStockOrder,
  isOrderActive,
  MAVA_STOCK_FOLDER_ID,
  MAVA_STOCK_SOURCE,
  type ClientFolder,
  type Order,
  type OrderStatus,
} from "../../../lib/orders";
import {
  ArrowIcon,
  BellIcon,
  BoxIcon,
  FolderIcon,
  ImageIcon,
  SearchIcon,
} from "../icons";
import {
  formatDate,
  statuses,
  statusStyles,
  ui,
  type DataSource,
  type WorkspaceView,
} from "./shared";

export function WorkspacePage({
  view,
  orders,
  folders,
  dataSource,
}: {
  view: WorkspaceView;
  orders: Order[];
  folders: ClientFolder[];
  dataSource: DataSource;
}) {
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<OrderStatus | "Todos">("Todos");

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      const matchesStatus = activeStatus === "Todos" || order.status === activeStatus;
      const matchesQuery = !normalized
        || `${order.code} ${order.clientName} ${order.contactName ?? ""} ${order.whatsapp ?? ""} ${order.sourceSystem ?? ""} ${order.notes} ${(order.items ?? []).map((item) => item.code).join(" ")}`
          .toLocaleLowerCase("es")
          .includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [activeStatus, orders, query]);

  const folderSummaries = useMemo(() => {
    const clientFolders = folders
      .map((folder) => {
      const allFolderOrders = orders.filter((order) => order.clientId === folder.id);
      const folderOrders = filteredOrders
        .filter((order) => order.clientId === folder.id && !isMavaStockOrder(order))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      return {
        ...folder,
        hiddenSourceFolder: allFolderOrders.length > 0 && allFolderOrders.every(isMavaStockOrder),
        orderCount: folderOrders.length,
        pendingCount: folderOrders.filter((order) => isOrderActive(order.status)).length,
        imageCount: folderOrders.reduce((total, order) => total + order.images.length, 0),
        latestAt: folderOrders[0]?.createdAt,
      };
    })
      .filter((folder) => !folder.hiddenSourceFolder && (
        folder.orderCount > 0 || (activeStatus === "Todos" && !query.trim())
      ));

    const mavaOrders = filteredOrders
      .filter(isMavaStockOrder)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const hasMavaOrders = orders.some(isMavaStockOrder);
    const showMavaFolder = mavaOrders.length > 0
      || (hasMavaOrders && activeStatus === "Todos" && !query.trim());
    const mavaFolder: FolderSummary = {
      id: MAVA_STOCK_FOLDER_ID,
      name: MAVA_STOCK_SOURCE,
      orderCount: mavaOrders.length,
      pendingCount: mavaOrders.filter((order) => isOrderActive(order.status)).length,
      imageCount: mavaOrders.reduce((total, order) => total + order.images.length, 0),
      latestAt: mavaOrders[0]?.createdAt,
      sourceGroup: true,
    };

    return showMavaFolder ? [mavaFolder, ...clientFolders] : clientFolders;
  }, [activeStatus, filteredOrders, folders, orders, query]);

  const counts = useMemo(
    () => Object.fromEntries(statuses.map((status) => [status, orders.filter((order) => order.status === status).length])),
    [orders],
  );
  const recentOrders = useMemo(
    () => [...orders]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [orders],
  );

  return (
    <>
      <header className={ui.topbar}>
        <div>
          <p className={ui.eyebrow}>
            {view === "pedidos" ? "Gestión" : view === "carpetas" ? "Organización" : "Mi taller"}
          </p>
          <h1 className={ui.h1}>
            {view === "pedidos" ? "Pedidos" : view === "carpetas" ? "Carpetas" : "Resumen"}
          </h1>
          <ConnectionStatus dataSource={dataSource} />
        </div>
      </header>

      {view === "resumen" && (
        <section className={ui.overview} aria-labelledby="overview-title">
          <h2 className="sr-only" id="overview-title">Pedidos por estado</h2>
          <div className={ui.metricGrid}>
            {statuses.map((status) => (
              <button
                aria-pressed={activeStatus === status}
                className={`${ui.metricCard} ${activeStatus === status ? ui.metricSelected : ""}`}
                key={status}
                onClick={() => setActiveStatus(activeStatus === status ? "Todos" : status)}
              >
                <span className={ui.metricLabel}>{status}</span>
                <strong>{dataSource === "loading" ? "—" : counts[status]}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "resumen" && (
        <RecentNotifications dataSource={dataSource} orders={recentOrders} />
      )}

      <section aria-labelledby="orders-title">
        <div className={`${ui.sectionHeading} ${ui.ordersHeading}`}>
          <div>
            <h2 className={ui.h2} id="orders-title">{view === "pedidos" ? "Todos los pedidos" : "Carpetas"}</h2>
            <p className="mt-1 text-[11px] text-[#7b8580]">
              {view === "pedidos" ? `${filteredOrders.length} pedidos encontrados` : "Pedidos agrupados por carpeta y origen"}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 max-[680px]:w-full">
            {activeStatus !== "Todos" && (
              <button className={ui.textButton} onClick={() => setActiveStatus("Todos")}>Quitar filtro</button>
            )}
            <label className={ui.searchBox}>
              <SearchIcon />
              <span className="sr-only">Buscar pedidos</span>
              <input
                className={ui.searchInput}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar carpeta o código"
                value={query}
              />
            </label>
          </div>
        </div>

        <div className={ui.orderList}>
          {dataSource === "loading" ? (
            <LoadingWorkspace />
          ) : view === "pedidos" ? (
            <OrdersList orders={filteredOrders} />
          ) : (
            <FoldersList folders={folderSummaries} isWorkspaceEmpty={!folders.length} />
          )}
        </div>
      </section>
    </>
  );
}

function RecentNotifications({
  dataSource,
  orders,
}: {
  dataSource: DataSource;
  orders: Order[];
}) {
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(() => new Set());
  const [seenStateReady, setSeenStateReady] = useState(false);
  const visibleOrders = useMemo(
    () => orders.filter((order) => !seenOrderIds.has(order.id)).slice(0, 5),
    [orders, seenOrderIds],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(SEEN_NOTIFICATIONS_KEY) ?? "[]") as unknown;
        if (Array.isArray(stored)) {
          setSeenOrderIds(new Set(stored.filter((id): id is string => typeof id === "string")));
        }
      } catch {
        window.localStorage.removeItem(SEEN_NOTIFICATIONS_KEY);
      }
      setSeenStateReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function markAllAsSeen() {
    setSeenOrderIds((current) => {
      const next = new Set(current);
      for (const order of orders) next.add(order.id);
      window.localStorage.setItem(
        SEEN_NOTIFICATIONS_KEY,
        JSON.stringify([...next].slice(-300)),
      );
      return next;
    });
  }

  return (
    <section className="mb-8" aria-labelledby="recent-notifications-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className={ui.h2} id="recent-notifications-title">Notificaciones recientes</h2>
          <p className="mt-1 text-[11px] text-[#7b8580]">Últimos pedidos recibidos</p>
        </div>
        {seenStateReady && visibleOrders.length > 0 && (
          <button className={ui.textButton} onClick={markAllAsSeen} type="button">Marcar todos como vistos</button>
        )}
      </div>

      <div className="divide-y divide-[#e7e9e6] overflow-hidden rounded-xl border border-[#e4e6e3] bg-white">
        {dataSource === "loading" || !seenStateReady ? (
          <div className="flex min-h-20 items-center gap-3 px-4 text-[11px] text-[#78827d]">
            <span className="grid size-9 shrink-0 animate-pulse place-items-center rounded-full bg-[#edf3ef] text-[#235c4c]"><BellIcon /></span>
            Cargando actividad reciente...
          </div>
        ) : visibleOrders.length ? visibleOrders.map((order) => (
          <Link
            className="grid min-h-[68px] grid-cols-[36px_minmax(0,1fr)_auto_14px] items-center gap-3 px-4 text-inherit no-underline transition-colors hover:bg-[#fafbf9] focus-visible:outline-2 focus-visible:outline-[#235c4c] max-[520px]:grid-cols-[36px_minmax(0,1fr)_14px]"
            href={`/pedidos/${encodeURIComponent(order.id)}`}
            key={order.id}
          >
            <span className="relative grid size-9 place-items-center rounded-full bg-[#edf3ef] text-[#235c4c] [&_svg]:size-4">
              <BellIcon />
              <i className="absolute right-0 top-0 size-2 rounded-full border-2 border-white bg-[#d08249]" />
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-xs font-semibold">Nuevo pedido de {order.clientName}</strong>
              <small className="mt-1 block truncate text-[10px] text-[#7b8580]">
                {order.code}{order.sourceSystem ? ` · ${order.sourceSystem}` : ""} · {formatRecentDate(order.createdAt)}
              </small>
            </span>
            <span className={`${ui.statusPill} ${statusStyles[order.status]} max-[520px]:hidden`}><i />{order.status}</span>
            <span className="text-[#a4aca8] [&_svg]:size-3.5"><ArrowIcon /></span>
          </Link>
        )) : (
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-5 text-center text-[11px] text-[#78827d]">
            <BellIcon />
            <strong className="text-xs font-semibold text-[#202825]">Todavía no hay notificaciones</strong>
            <span>Los pedidos nuevos aparecerán acá.</span>
          </div>
        )}
      </div>
    </section>
  );
}

const SEEN_NOTIFICATIONS_KEY = "mava-seen-order-notifications-v1";

function formatRecentDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value)).replace(".", "");
}

function ConnectionStatus({ dataSource }: { dataSource: DataSource }) {
  return (
    <p className={ui.connectionStatus}>
      <i className={
        dataSource === "supabase"
          ? "bg-[#3f8a69]"
          : dataSource === "error"
            ? "bg-[#b85d4f]"
            : "animate-pulse bg-[#9aa39f]"
      } />
      {dataSource === "supabase"
        ? "Supabase conectado"
        : dataSource === "error"
          ? "Sin conexión con Supabase"
          : "Conectando datos..."}
    </p>
  );
}

function LoadingWorkspace() {
  return (
    <div className={ui.emptyState}>
      <BoxIcon />
      <strong>Cargando pedidos</strong>
      <span>Estamos preparando tu espacio de trabajo.</span>
    </div>
  );
}

function OrdersList({ orders }: { orders: Order[] }) {
  return (
    <>
      <div className={`${ui.tableGrid} ${ui.listHead}`}><span>Pedido</span><span>Estado</span><span>Imágenes</span><span>Creado</span><span /></div>
      {orders.map((order) => (
        <Link className={`${ui.tableGrid} ${ui.orderRow} no-underline text-inherit`} href={`/pedidos/${encodeURIComponent(order.id)}`} key={order.id}>
          <span className={ui.orderIdentity}>
            <span className={ui.orderCover} style={{ background: order.cover }}><ImageIcon /></span>
            <span><strong>{order.code}</strong><small>Carpeta {order.clientName}{order.sourceSystem ? ` · ${order.sourceSystem}` : ""} · {formatDate(order.createdAt)}</small></span>
          </span>
          <span className={ui.statusCell}><span className={`${ui.statusPill} ${statusStyles[order.status]}`}><i />{order.status}</span></span>
          <span className={ui.imageCount}><ImageIcon /> {order.images.length}</span>
          <span className={ui.dateCell}>{formatDate(order.createdAt)}</span>
          <span className={ui.rowArrow}><ArrowIcon /></span>
        </Link>
      ))}
      {!orders.length && <div className={ui.emptyState}><SearchIcon /><strong>No encontramos pedidos</strong><span>Probá con otro código, carpeta o estado.</span></div>}
    </>
  );
}

type FolderSummary = ClientFolder & {
  orderCount: number;
  pendingCount: number;
  imageCount: number;
  latestAt?: string;
  sourceGroup?: boolean;
};

function FoldersList({ folders, isWorkspaceEmpty }: { folders: FolderSummary[]; isWorkspaceEmpty: boolean }) {
  return (
    <>
      <div className={`${ui.tableGrid} ${ui.listHead}`}><span>Carpeta</span><span>Estado</span><span>Imágenes</span><span>Actividad</span><span /></div>
      {folders.map((folder) => (
        <Link className={`${ui.tableGrid} ${ui.orderRow} no-underline text-inherit`} href={`/carpetas/${encodeURIComponent(folder.id)}`} key={folder.id}>
          <span className={ui.orderIdentity}>
            <span className={`${ui.orderCover} ${ui.folderCover}`}><FolderIcon /></span>
            <span><strong>{folder.name}</strong><small>{folder.orderCount} pedido{folder.orderCount === 1 ? "" : "s"} {folder.sourceGroup ? "sincronizados" : "en la carpeta"}</small></span>
          </span>
          <span className={ui.statusCell}>
            <span className={`${ui.statusPill} ${folder.pendingCount ? statusStyles.Pendiente : statusStyles.Entregado}`}>
              <i />{folder.pendingCount ? `${folder.pendingCount} activo${folder.pendingCount === 1 ? "" : "s"}` : "Sin pedidos activos"}
            </span>
          </span>
          <span className={ui.imageCount}><ImageIcon /> {folder.imageCount}</span>
          <span className={ui.dateCell}>{folder.latestAt ? formatDate(folder.latestAt) : "Sin actividad"}</span>
          <span className={ui.rowArrow}><ArrowIcon /></span>
        </Link>
      ))}
      {!folders.length && (
        <div className={ui.emptyState}>
          {isWorkspaceEmpty ? <FolderIcon /> : <SearchIcon />}
          <strong>{isWorkspaceEmpty ? "Todavía no hay carpetas" : "No encontramos carpetas"}</strong>
          <span>{isWorkspaceEmpty ? "La primera carpeta se creará automáticamente cuando guardes un pedido." : "Probá con otro nombre, código o estado."}</span>
          {isWorkspaceEmpty && <Link className={`${ui.primaryButton} mt-2 no-underline`} href="/pedidos/nuevo">Crear primer pedido</Link>}
        </div>
      )}
    </>
  );
}
