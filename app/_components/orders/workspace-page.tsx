"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getOrderArtworkProgress,
  getOrderFolderId,
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
  CloseIcon,
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
import { FolderDropRow, FolderDropTargets } from "./order-folder-actions";
import { OrderListRow, orderListGrid } from "./order-list-row";

export function WorkspacePage({
  view,
  orders,
  folders,
  dataSource,
  initialStatus,
}: {
  view: WorkspaceView;
  orders: Order[];
  folders: ClientFolder[];
  dataSource: DataSource;
  initialStatus?: OrderStatus;
}) {
  const [queries, setQueries] = useState<Partial<Record<WorkspaceView, string>>>({});
  const query = queries[view] ?? "";
  const activeStatus: OrderStatus | "Todos" = initialStatus ?? "Todos";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedQuery = window.sessionStorage.getItem(`mava-search-${view}`) ?? "";
        setQueries((current) => current[view] === savedQuery ? current : { ...current, [view]: savedQuery });
      } catch {
        // La búsqueda sigue funcionando aunque el navegador bloquee sessionStorage.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  function setQuery(value: string) {
    setQueries((current) => ({ ...current, [view]: value }));
    try {
      window.sessionStorage.setItem(`mava-search-${view}`, value);
    } catch {
      // El estado en memoria mantiene la búsqueda durante esta navegación.
    }
  }

  const filteredOrders = useMemo(() => {
    const normalized = normalizeSearch(query);
    return orders.filter((order) => {
      const matchesStatus = activeStatus === "Todos" || order.status === activeStatus;
      const matchesQuery = !normalized || matchesSearch(getOrderSearchIndex(order), normalized);
      return matchesStatus && matchesQuery;
    });
  }, [activeStatus, orders, query]);

  const globalFolderResults = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return [];
    const results = folders.filter((folder) => matchesSearch(`${folder.id} ${folder.name.toLocaleUpperCase("es")}`, normalized));
    if (orders.some(isMavaStockOrder) && matchesSearch(`${MAVA_STOCK_SOURCE} mava stock origen sincronizados`, normalized)) {
      return [{ id: MAVA_STOCK_FOLDER_ID, name: MAVA_STOCK_SOURCE }, ...results];
    }
    return results;
  }, [folders, orders, query]);

  const folderSummaries = useMemo(() => {
    const clientFolders = folders
      .map((folder) => {
      const allFolderOrders = orders.filter((order) => order.clientId === folder.id);
      const folderOrders = filteredOrders
        .filter((order) => getOrderFolderId(order) === folder.id)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      return {
        ...folder,
        hiddenSourceFolder: !orders.some((order) => getOrderFolderId(order) === folder.id)
          && allFolderOrders.length > 0 && allFolderOrders.every(isMavaStockOrder),
        orderCount: folderOrders.length,
        pendingCount: folderOrders.filter((order) => isOrderActive(order.status)).length,
        imageCount: folderOrders.reduce((total, order) => total + getOrderArtworkProgress(order).total, 0),
        latestAt: folderOrders[0]?.createdAt,
      };
    })
      .filter((folder) => !folder.hiddenSourceFolder && (
        folder.orderCount > 0 || !query.trim()
      ));

    const mavaOrders = filteredOrders
      .filter((order) => getOrderFolderId(order) === MAVA_STOCK_FOLDER_ID)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const hasMavaOrders = orders.some(isMavaStockOrder);
    const showMavaFolder = mavaOrders.length > 0
      || (hasMavaOrders && !query.trim());
    const mavaFolder: FolderSummary = {
      id: MAVA_STOCK_FOLDER_ID,
      name: MAVA_STOCK_SOURCE,
      orderCount: mavaOrders.length,
      pendingCount: mavaOrders.filter((order) => isOrderActive(order.status)).length,
      imageCount: mavaOrders.reduce((total, order) => total + getOrderArtworkProgress(order).total, 0),
      latestAt: mavaOrders[0]?.createdAt,
      sourceGroup: true,
    };

    return showMavaFolder ? [mavaFolder, ...clientFolders] : clientFolders;
  }, [filteredOrders, folders, orders, query]);
  const recentOrders = useMemo(
    () => [...orders]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [orders],
  );

  return (
    <div className={view === "resumen" ? "flex h-full min-h-0 flex-col" : undefined}>
      <header className={`${ui.topbar} ${view === "resumen" ? "mb-4 shrink-0" : ""}`}>
        <div>
          <h1 className={ui.h1}>
            {view === "pedidos" ? "Pedidos" : view === "carpetas" ? "Carpetas" : "Resumen"}
          </h1>
          <ConnectionStatus dataSource={dataSource} />
        </div>
      </header>

      {view === "resumen" && <GlobalSearch query={query} onQueryChange={setQuery} />}

      {view === "resumen" && query.trim() && (
        <GlobalSearchResults
          dataSource={dataSource}
          folders={globalFolderResults}
          orders={filteredOrders}
          query={query}
        />
      )}

      {view === "resumen" && !query.trim() && (
        <StatusFolders dataSource={dataSource} orders={orders} />
      )}

      {view === "resumen" && !query.trim() && (
        <RecentNotifications compact dataSource={dataSource} orders={recentOrders} />
      )}

      {view !== "resumen" && <section aria-labelledby="orders-title">
        <div className={`${ui.sectionHeading} ${ui.ordersHeading}`}>
          <div>
            <h2 className={ui.h2} id="orders-title">{view === "pedidos" ? activeStatus === "Todos" ? "Todos los pedidos" : statusFolderNames[activeStatus] : "Carpetas"}</h2>
            <p className="mt-1 text-[11px] text-[#7b8580]">
              {view === "pedidos" ? `${filteredOrders.length} pedidos encontrados` : "Pedidos agrupados por carpeta y origen"}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 max-[680px]:w-full">
            {view === "pedidos" && activeStatus !== "Todos" && (
              <Link className={`${ui.textButton} shrink-0 no-underline`} href="/pedidos">Ver todos</Link>
            )}
            <label className={`${ui.searchBox} w-full! min-[681px]:w-72!`}>
              <SearchIcon />
              <span className="sr-only">{view === "pedidos" ? "Buscar pedidos" : "Buscar carpetas"}</span>
              <input
                className={ui.searchInput}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={view === "pedidos" ? "Buscar cliente o código" : "Buscar carpeta o código"}
                value={query}
              />
            </label>
          </div>
        </div>

        {view === "pedidos" && <FolderDropTargets />}
        <div className={`${ui.orderList} @container`}>
          {dataSource === "loading" ? (
            <LoadingWorkspace />
          ) : view === "pedidos" ? (
            <OrdersList orders={filteredOrders} />
          ) : (
            <FoldersList folders={folderSummaries} isWorkspaceEmpty={!folders.length} />
          )}
        </div>
      </section>}
    </div>
  );
}

function GlobalSearch({
  onQueryChange,
  query,
}: {
  onQueryChange: (value: string) => void;
  query: string;
}) {
  return (
    <section className="mb-5 shrink-0" aria-label="Búsqueda global">
      <label className="flex h-12 w-full items-center gap-3 rounded-xl border border-[#dce2de] bg-white px-4 shadow-[0_2px_10px_rgb(32_48_40/4%)] transition focus-within:border-[#82a092] focus-within:ring-2 focus-within:ring-[#e4eee8]">
        <SearchIcon />
        <span className="sr-only">Buscar en toda la aplicación</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#202825] outline-none placeholder:text-[#8d9792]"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar pedidos, clientes, notas, cuadros..."
          type="text"
          value={query}
        />
        {query && (
          <button
            aria-label="Limpiar búsqueda"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[#737e78] transition-colors hover:bg-[#f0f3f0] focus-visible:outline-2 focus-visible:outline-[#235c4c] [&_svg]:size-3.5"
            onClick={() => onQueryChange("")}
            type="button"
          >
            <CloseIcon />
          </button>
        )}
      </label>
    </section>
  );
}

function GlobalSearchResults({
  dataSource,
  folders,
  orders,
  query,
}: {
  dataSource: DataSource;
  folders: ClientFolder[];
  orders: Order[];
  query: string;
}) {
  const visibleOrders = orders.slice(0, 12);
  const totalResults = orders.length + folders.length;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2" aria-live="polite" aria-label="Resultados de búsqueda">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-.02em]">Resultados</h2>
          <p className="mt-0.5 text-[11px] text-[#7b8580]">
            {dataSource === "loading" ? "Buscando en el taller..." : `${totalResults} coincidencia${totalResults === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {dataSource === "loading" ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, index) => <div className="loading-skeleton h-16 rounded-xl" key={index} />)}
        </div>
      ) : totalResults ? (
        <div className="grid gap-4">
          {folders.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#87918c]">Carpetas</h3>
              <div className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
                {folders.slice(0, 4).map((folder) => (
                  <Link
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-[#e2e6e2] bg-white px-3.5 text-inherit no-underline transition-colors hover:border-[#b9c8c0] hover:bg-[#fafbf9] focus-visible:outline-2 focus-visible:outline-[#235c4c]"
                    href={`/carpetas/${encodeURIComponent(folder.id)}`}
                    key={folder.id}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e7efe9] text-[#235c4c] [&_svg]:size-4"><FolderIcon /></span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold">{folder.name.toLocaleUpperCase("es")}</strong><small className="mt-1 block text-[10px] text-[#7b8580]">Abrir carpeta</small></span>
                    <span className="text-[#a4aca8] [&_svg]:size-3"><ArrowIcon /></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {visibleOrders.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#87918c]">Pedidos</h3>
              <div className="divide-y divide-[#e7e9e6] overflow-hidden rounded-xl border border-[#e2e6e2] bg-white">
                {visibleOrders.map((order) => (
                  <Link
                    className="grid min-h-16 grid-cols-[40px_minmax(0,1fr)_auto_14px] items-center gap-3 px-3.5 text-inherit no-underline transition-colors hover:bg-[#fafbf9] focus-visible:outline-2 focus-visible:outline-[#235c4c] max-[520px]:grid-cols-[40px_minmax(0,1fr)_14px]"
                    href={`/pedidos/${encodeURIComponent(order.id)}`}
                    key={order.id}
                  >
                    <span className={ui.orderCover} style={{ background: order.cover }}><ImageIcon /></span>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs font-semibold">{order.code} · {order.clientName}</strong>
                      <small className="mt-1 block truncate text-[10px] text-[#6f7a74]">{describeOrderMatch(order, query)}</small>
                    </span>
                    <span className={`${ui.statusPill} ${statusStyles[order.status]} max-[520px]:hidden`}><i />{order.status}</span>
                    <span className="text-[#a4aca8] [&_svg]:size-3"><ArrowIcon /></span>
                  </Link>
                ))}
              </div>
              {orders.length > visibleOrders.length && <p className="mt-2 text-center text-[10px] text-[#7b8580]">Mostrando los primeros {visibleOrders.length} pedidos.</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-[#e2e6e2] bg-white px-5 text-center">
          <SearchIcon />
          <strong className="text-xs font-semibold">No encontramos “{query.trim()}”</strong>
          <span className="max-w-sm text-[11px] leading-relaxed text-[#78827d]">Probá con un código, cliente, teléfono, estado, nota, descripción, tamaño o nombre de cuadro.</span>
        </div>
      )}
    </section>
  );
}

function StatusFolders({
  dataSource,
  orders,
}: {
  dataSource: DataSource;
  orders: Order[];
}) {
  const counts = Object.fromEntries(
    statuses.map((status) => [status, orders.filter((order) => order.status === status).length]),
  ) as Record<OrderStatus, number>;

  return (
    <section className="mb-5 shrink-0" aria-labelledby="home-status-folders-title">
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-.02em]" id="home-status-folders-title">Etapas del trabajo</h2>
          <p className="mt-0.5 text-[11px] text-[#7b8580]">Abrí una etapa para ver sus pedidos</p>
        </div>
        <Link className={`${ui.textButton} no-underline`} href="/pedidos">Ver todos</Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {dataSource === "loading" ? Array.from({ length: 4 }, (_, index) => (
          <div className="loading-skeleton h-16 rounded-xl border border-[#e4e6e3]" key={index} />
        )) : statuses.map((status) => (
          <Link
            className="flex h-16 min-w-0 items-center gap-2.5 rounded-xl border border-[#e4e6e3] bg-white px-3 text-inherit no-underline transition-colors hover:border-[#b9c8c0] hover:bg-[#fafbf9] focus-visible:outline-2 focus-visible:outline-[#235c4c]"
            href={`/pedidos?estado=${encodeURIComponent(status)}`}
            key={status}
          >
            <span className={`${statusStyles[status]} grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4`}><FolderIcon /></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-semibold">{statusFolderNames[status]}</strong>
              <small className="mt-1 block truncate text-[11px] text-[#7b8580]">{counts[status]} pedido{counts[status] === 1 ? "" : "s"}</small>
            </span>
            <span className="shrink-0 text-[#a4aca8] [&_svg]:size-3"><ArrowIcon /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const statusFolderNames: Record<OrderStatus, string> = {
  Pendiente: "Pendientes",
  "En producción": "En producción",
  Terminado: "Terminados",
  Entregado: "Entregados",
};

function RecentNotifications({
  compact = false,
  dataSource,
  orders,
}: {
  compact?: boolean;
  dataSource: DataSource;
  orders: Order[];
}) {
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(() => new Set());
  const [seenStateReady, setSeenStateReady] = useState(false);
  const visibleOrders = useMemo(
    () => orders.filter((order) => !seenOrderIds.has(order.id)).slice(0, compact ? 2 : 5),
    [compact, orders, seenOrderIds],
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
    <section className={compact ? "min-h-0 flex-1" : "mb-8"} aria-labelledby="recent-notifications-title">
      <div className={`${compact ? "mb-2.5" : "mb-4"} flex items-end justify-between gap-4`}>
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
          Array.from({ length: compact ? 2 : 3 }, (_, index) => (
            <div className="grid min-h-14 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 px-4" key={index}>
              <span className="loading-skeleton size-9 rounded-full" />
              <span className="grid gap-2">
                <span className="loading-skeleton h-2.5 w-2/3 rounded-full" />
                <span className="loading-skeleton h-2 w-1/2 rounded-full" />
              </span>
            </div>
          ))
        ) : visibleOrders.length ? visibleOrders.map((order) => (
          <Link
            className={`${compact ? "min-h-14" : "min-h-17"} grid grid-cols-[36px_minmax(0,1fr)_auto_14px] items-center gap-3 px-4 text-inherit no-underline transition-colors hover:bg-[#fafbf9] focus-visible:outline-2 focus-visible:outline-[#235c4c] max-[520px]:grid-cols-[36px_minmax(0,1fr)_14px]`}
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
        ? "Todo actualizado"
        : dataSource === "error"
          ? "Sin conexión"
          : "Actualizando pedidos..."}
    </p>
  );
}

function LoadingWorkspace() {
  return (
    <div aria-busy="true" aria-label="Cargando pedidos">
      <div className={`${ui.tableGrid} ${ui.listHead}`}><span>Pedido</span><span>Estado</span><span>Imágenes</span><span>Creado</span><span /></div>
      {Array.from({ length: 5 }, (_, index) => (
        <div className={`${ui.tableGrid} min-h-17.5 border-b border-[#eceeeb] px-4 last:border-b-0 max-[760px]:grid-cols-[1fr_auto]`} key={index}>
          <span className="flex items-center gap-3">
            <span className="loading-skeleton size-10 shrink-0 rounded-lg" />
            <span className="grid w-full max-w-52 gap-2">
              <span className="loading-skeleton h-2.5 w-3/5 rounded-full" />
              <span className="loading-skeleton h-2 w-full rounded-full" />
            </span>
          </span>
          <span className="loading-skeleton h-6 w-24 rounded-full max-[760px]:hidden" />
          <span className="loading-skeleton h-3 w-10 rounded-full max-[760px]:hidden" />
          <span className="loading-skeleton h-3 w-16 rounded-full max-[760px]:hidden" />
          <span />
        </div>
      ))}
      <span className="sr-only">Estamos preparando tu espacio de trabajo.</span>
    </div>
  );
}

function OrdersList({ orders }: { orders: Order[] }) {
  return (
    <>
      <div className={`${orderListGrid} hidden min-h-10 border-b border-[#e5e7e3] bg-[#fafbf9] px-4 text-[10px] font-medium uppercase tracking-wide text-[#7b8580] @min-[680px]:grid`}><span>Cliente / pedido</span><span>Estado</span><span>Creado</span><span className="sr-only">Acciones</span></div>
      {orders.map((order) => <OrderListRow order={order} key={order.id} />)}
      {!orders.length && <div className={ui.emptyState}><SearchIcon /><strong>No encontramos pedidos</strong><span>Probá con otro código, carpeta o estado.</span></div>}
    </>
  );
}

function formatArtworkProgress(order: Order) {
  const { ready, total } = getOrderArtworkProgress(order);
  return total ? `${ready} de ${total} listos` : "Sin cuadros";
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

function matchesSearch(searchableValue: string, normalizedQuery: string) {
  const searchable = normalizeSearch(searchableValue);
  return normalizedQuery.split(/\s+/).every((term) => searchable.includes(term));
}

function getOrderSearchIndex(order: Order) {
  const imageDetails = order.images.flatMap((image) => [
    image.id,
    image.name,
    image.description,
    image.preparationStatus,
    image.addedAt,
  ]);
  const itemDetails = (order.items ?? []).flatMap((item) => [
    item.id,
    item.code,
    item.name,
    item.size,
    item.background,
    item.backgroundLabel,
    item.price,
    item.preparationStatus,
  ]);
  const canvasTerms = order.canvasesOrdered
    ? "telas pedidas tela pedida solicitadas"
    : "telas sin pedir tela pendiente no pedidas";

  return [
    order.id,
    order.code,
    order.clientId,
    order.clientName,
    order.folderName,
    order.status,
    order.notes,
    order.contactName,
    order.whatsapp,
    order.locality,
    order.sourceSystem,
    order.sourceOrderId,
    order.sourceStatus,
    order.createdAt,
    formatDate(order.createdAt),
    order.total,
    canvasTerms,
    formatArtworkProgress(order),
    ...imageDetails,
    ...itemDetails,
  ].filter((value) => value !== undefined && value !== null).join(" ");
}

function describeOrderMatch(order: Order, query: string) {
  const normalized = normalizeSearch(query);
  const candidates: Array<[string, string | undefined]> = [
    ["Estado", order.status],
    ["Notas", order.notes],
    ["Contacto", order.contactName],
    ["WhatsApp", order.whatsapp],
    ["Localidad", order.locality],
    ["Origen", order.sourceSystem],
    ["Pedido de origen", order.sourceOrderId],
    ["Estado de origen", order.sourceStatus],
    ["Telas", order.canvasesOrdered ? "Pedidas" : "Sin pedir"],
    ...order.images.flatMap((image): Array<[string, string | undefined]> => [
      ["Imagen", image.name],
      ["Descripción", image.description],
      ["Preparación", image.preparationStatus],
    ]),
    ...(order.items ?? []).flatMap((item): Array<[string, string | undefined]> => [
      ["Cuadro", `${item.code} ${item.name}`],
      ["Tamaño", item.size],
      ["Fondo", item.backgroundLabel ?? item.background],
      ["Preparación", item.preparationStatus],
    ]),
  ];
  const matchingField = candidates.find(([, value]) => value && matchesSearch(value, normalized));
  return matchingField
    ? `${matchingField[0]}: ${matchingField[1]}`
    : `${order.status} · ${formatArtworkProgress(order)}`;
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
      <div className={`${ui.tableGrid} ${ui.listHead}`}><span>Carpeta</span><span>Estado</span><span>Cuadros</span><span>Actividad</span><span /></div>
      {folders.map((folder) => (
        <FolderDropRow className={`${ui.tableGrid} ${ui.orderRow}`} folder={folder} key={folder.id}>
          <span className={ui.orderIdentity}>
            <span className={`${ui.orderCover} ${ui.folderCover}`}><FolderIcon /></span>
            <span className="min-w-0"><strong>{folder.name.toLocaleUpperCase("es")}</strong><small>{folder.orderCount} pedido{folder.orderCount === 1 ? "" : "s"} {folder.sourceGroup ? (folder.orderCount === 1 ? "sincronizado" : "sincronizados") : "en la carpeta"}</small></span>
          </span>
          <span className={ui.statusCell}>
            <span className={`${ui.statusPill} ${folder.pendingCount ? statusStyles.Pendiente : statusStyles.Entregado}`}>
              <i />{folder.pendingCount ? `${folder.pendingCount} activo${folder.pendingCount === 1 ? "" : "s"}` : "Sin pedidos activos"}
            </span>
          </span>
          <span className={ui.imageCount} aria-label={`${folder.imageCount} cuadros`}><ImageIcon /> {folder.imageCount}<span className="min-[761px]:hidden">cuadros</span></span>
          <span className={ui.dateCell}>{folder.latestAt ? formatDate(folder.latestAt) : "Sin actividad"}</span>
        </FolderDropRow>
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
