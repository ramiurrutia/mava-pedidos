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
import { isSupabaseConfigured } from "../../lib/supabase/client";
import {
  createRemoteOrder,
  loadWorkspace,
  updateRemoteOrderStatus,
  uploadRemoteImages,
} from "../../lib/supabase/orders-repository";
import {
  ArrowIcon,
  BoxIcon,
  CloseIcon,
  FolderIcon,
  GridIcon,
  ImageIcon,
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
  Pendiente: "text-[#9a5b32] bg-[#fbede2]",
  "En producción": "text-[#356753] bg-[#e4eee8]",
  Terminado: "text-[#65597d] bg-[#eeeaf5]",
  Entregado: "text-[#63706a] bg-[#edf0ee]",
};

const ui = {
  appShell: "min-h-screen bg-[#f7f7f5] text-[#202825]",
  sidebar: "sticky top-0 z-20 flex h-[68px] items-center border-b border-[#e7e8e5] bg-white/95 px-[clamp(18px,4vw,48px)] backdrop-blur-xl",
  brand: "flex shrink-0 items-center gap-2.5 text-inherit no-underline",
  brandMark: "grid size-8 place-items-center rounded-lg bg-[#235c4c] text-sm font-bold text-white",
  brandCopy: "leading-none [&_strong]:block [&_strong]:text-sm [&_strong]:font-bold [&_strong]:tracking-[.04em] [&_span]:mt-1 [&_span]:block [&_span]:text-[9px] [&_span]:font-medium [&_span]:uppercase [&_span]:tracking-[.12em] [&_span]:text-[#89928e]",
  nav: "fixed inset-x-0 bottom-0 z-30 flex h-[calc(64px+env(safe-area-inset-bottom))] items-start justify-center gap-2 border-t border-[#e3e5e2] bg-white/95 px-4 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl",
  navItem: "flex h-12 min-w-[112px] items-center justify-center gap-2 rounded-lg px-4 text-xs font-medium text-[#6f7874] no-underline transition-colors hover:bg-[#f3f5f2] hover:text-[#235c4c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] [&_svg]:size-4 max-[480px]:min-w-0 max-[480px]:flex-1 max-[480px]:flex-col max-[480px]:gap-1 max-[480px]:px-2 max-[480px]:text-[9px]",
  navActive: "bg-[#edf3ef] font-semibold text-[#235c4c]",
  sidebarFoot: "ml-auto flex items-center gap-2",
  main: "mx-auto w-full max-w-[1120px] px-[clamp(18px,4vw,48px)] pb-[calc(92px+env(safe-area-inset-bottom))] pt-9 motion-safe:animate-[page-enter_220ms_ease-out_both] max-[600px]:pt-6",
  topbar: "mb-8 flex items-start justify-between gap-6",
  connectionStatus: "mt-2 flex items-center gap-2 text-[11px] text-[#7b8580] [&_i]:size-1.5 [&_i]:rounded-full",
  eyebrow: "mb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8b9490]",
  h1: "text-[clamp(26px,3vw,34px)] font-semibold tracking-[-.035em]",
  h2: "text-xl font-semibold tracking-[-.025em]",
  primaryButton: "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#235c4c] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#1b4d40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
  secondaryButton: "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#dfe3df] bg-white px-3.5 text-xs font-semibold text-[#34413c] transition-colors hover:bg-[#f5f6f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
  textButton: "inline-flex cursor-pointer items-center justify-center gap-1 bg-transparent text-[11px] text-[#75807b] [&_svg]:w-[14px]",
  overview: "mb-8",
  sectionHeading: "mb-4 flex items-end justify-between gap-5 max-[680px]:flex-col max-[680px]:items-stretch",
  ordersHeading: "",
  metricGrid: "grid grid-cols-4 overflow-hidden rounded-xl border border-[#e4e6e3] bg-white max-[680px]:grid-cols-2",
  metricCard: "flex min-h-[82px] cursor-pointer flex-col justify-center border-r border-[#e7e9e6] px-5 text-left transition-colors last:border-r-0 hover:bg-[#fafbf9] max-[680px]:border-b max-[680px]:odd:border-r max-[680px]:even:border-r-0 max-[680px]:nth-[n+3]:border-b-0 [&_strong]:mt-1.5 [&_strong]:text-2xl [&_strong]:font-semibold [&_strong]:leading-none",
  metricSelected: "bg-[#edf3ef] text-[#235c4c] hover:bg-[#edf3ef]",
  metricLabel: "text-[11px] font-medium text-[#717b76]",
  searchBox: "flex h-10 w-[min(340px,48%)] items-center gap-2.5 rounded-lg border border-[#dfe3df] bg-white px-3 focus-within:border-[#94aa9f] focus-within:ring-2 focus-within:ring-[#e8efeb] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[#8a938f] max-[680px]:w-full",
  searchInput: "min-w-0 flex-1 border-0 bg-transparent text-xs text-[#202825] outline-none placeholder:text-[#9ba39f]",
  orderList: "overflow-hidden rounded-xl border border-[#e4e6e3] bg-white",
  tableGrid: "grid grid-cols-[minmax(220px,2fr)_minmax(130px,1fr)_90px_100px_20px] items-center gap-x-4",
  listHead: "min-h-10 border-b border-[#e7e9e6] bg-[#fafbf9] px-4 text-[9px] font-semibold uppercase tracking-[.08em] text-[#929a96] max-[760px]:hidden",
  orderRow: "min-h-[70px] w-full cursor-pointer border-b border-[#eceeeb] bg-white px-4 text-left transition-colors last:border-b-0 hover:bg-[#fafbf9] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#235c4c] max-[760px]:grid-cols-[1fr_auto] max-[760px]:grid-rows-2 max-[760px]:gap-y-2 max-[760px]:p-3.5",
  orderIdentity: "flex min-w-0 items-center gap-3 max-[760px]:[grid-area:1/1] [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:mt-1 [&_small]:block [&_small]:truncate [&_small]:text-[10px] [&_small]:text-[#828b87]",
  orderCover: "grid size-10 shrink-0 place-items-center rounded-lg text-white/80 [&_svg]:size-[17px]",
  folderCover: "bg-[#dfe9e2] text-[#173d34]",
  statusPill: "inline-flex w-max items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-semibold [&_i]:size-1.5 [&_i]:rounded-full [&_i]:bg-current",
  statusCell: "max-[760px]:[grid-area:2/1]",
  imageCount: "flex items-center gap-1.5 text-[10px] text-[#68726d] [&_svg]:size-3.5 max-[760px]:[grid-area:2/2] max-[760px]:justify-self-end",
  dateCell: "text-[10px] capitalize text-[#747e79] max-[760px]:hidden",
  rowArrow: "text-[#a4aca8] [&_svg]:size-3.5 max-[760px]:[grid-area:1/2]",
  emptyState: "flex min-h-[190px] flex-col items-center justify-center gap-2 px-5 text-center text-[11px] text-[#78827d] [&_svg]:mb-1 [&_svg]:size-5 [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-[#202825]",
  modalBackdrop: "fixed inset-0 z-40 grid place-items-center bg-[rgb(22_31_28/42%)] p-5 backdrop-blur-sm max-[480px]:p-2.5",
  modal: "max-h-[calc(100vh-40px)] w-[min(500px,100%)] overflow-auto rounded-xl bg-white p-6 shadow-[0_24px_70px_rgb(18_33_28/22%)] motion-safe:animate-[modal-in_.18s_ease-out] max-[480px]:max-h-[calc(100vh-20px)] max-[480px]:p-5",
  modalHead: "mb-6 flex items-start justify-between gap-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-.025em]",
  iconButton: "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#66706b] transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#235c4c] [&_svg]:size-4",
  field: "mb-4 grid gap-1.5 [&>span]:text-[10px] [&>span]:font-semibold [&>span]:text-[#68726d] [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[#dfe3df] [&_input]:bg-white [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-xs [&_input]:outline-none [&_input:focus]:border-[#8fa79c] [&_input:focus]:ring-2 [&_input:focus]:ring-[#e8efeb] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-[#dfe3df] [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-xs [&_textarea]:outline-none [&_textarea:focus]:border-[#8fa79c] [&_textarea:focus]:ring-2 [&_textarea:focus]:ring-[#e8efeb] [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[#dfe3df] [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-xs [&_select]:outline-none [&_select:focus]:border-[#8fa79c] [&_select:focus]:ring-2 [&_select:focus]:ring-[#e8efeb]",
  uploadZone: "flex min-h-[145px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#bdc8c2] bg-[#fafbf9] px-5 text-center [&>svg]:size-6 [&>svg]:text-[#235c4c] [&>strong]:text-xs [&>span]:text-[10px] [&>span]:leading-relaxed [&>span]:text-[#78827d] [&_button]:mt-1",
  fileSummary: "mt-2.5 flex max-h-20 flex-wrap gap-1.5 overflow-auto [&_span]:flex [&_span]:max-w-full [&_span]:items-center [&_span]:gap-1.5 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:rounded-md [&_span]:bg-[#eef2ef] [&_span]:px-2 [&_span]:py-1.5 [&_span]:text-[9px] [&_svg]:size-3 [&_svg]:shrink-0",
  assignmentStep: "grid gap-[10px]",
  assignmentCard: "grid w-full cursor-pointer grid-cols-[18px_1fr] items-start gap-3 rounded-lg border border-[#dfe3df] bg-white p-3.5 text-left transition-colors hover:bg-[#fafbf9] disabled:cursor-not-allowed disabled:opacity-50 [&_strong]:block [&_strong]:text-xs [&_strong]:font-semibold [&_small]:mt-1 [&_small]:block [&_small]:text-[10px] [&_small]:leading-relaxed [&_small]:text-[#75807b]",
  assignmentSelected: "border-[#7f9d90] bg-[#f1f6f2]",
  assignmentRadio: "size-[17px] rounded-full border-[1.5px] border-[#aab4af] shadow-[inset_0_0_0_4px_transparent]",
  assignmentRadioSelected: "border-[#173d34] bg-[#173d34] shadow-[inset_0_0_0_4px_#f1f6f2]",
  assignmentSelect: "mb-0 mt-1 rounded-lg bg-[#f7f8f6] p-3",
  safetyNote: "mt-4 flex items-start gap-2.5 rounded-lg bg-[#eef5f0] p-3 text-[#335a4b] [&>span]:grid [&>span]:size-[18px] [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-full [&>span]:bg-[#d7e7dc] [&>span]:text-[9px] [&_p]:m-0 [&_p]:text-[10px] [&_p]:leading-relaxed [&_strong]:block [&_strong]:text-[10px] [&_strong]:font-semibold [&_strong]:text-[#25483b]",
  modalActions: "mt-5 flex justify-end gap-2 max-[480px]:grid max-[480px]:grid-cols-2",
  drawerBackdrop: "place-items-stretch end p-0",
  drawer: "h-full w-[min(460px,100%)] overflow-auto bg-white p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[-20px_0_60px_rgb(18_33_28/18%)] motion-safe:animate-[drawer-in_.2s_ease-out] max-[480px]:p-5 max-[480px]:pb-[calc(80px+env(safe-area-inset-bottom))]",
  drawerContent: "grid gap-5",
  folderSummary: "mb-5 grid grid-cols-3 divide-x divide-[#e4e7e3] rounded-lg border border-[#e4e7e3] bg-[#fafbf9] py-3 [&_span]:px-2 [&_span]:text-center [&_span]:text-[9px] [&_span]:text-[#75807b] [&_strong]:mb-1 [&_strong]:block [&_strong]:text-lg [&_strong]:font-semibold [&_strong]:leading-none [&_strong]:text-[#202825]",
  folderOrderList: "divide-y divide-[#e7e9e6] overflow-hidden rounded-lg border border-[#e4e7e3]",
  folderOrderCard: "grid w-full cursor-pointer grid-cols-[40px_minmax(90px,1fr)_auto_16px] items-center gap-2.5 bg-white p-3 text-left transition-colors hover:bg-[#fafbf9] [&>svg]:size-3.5 [&>svg]:text-[#9aa39f] max-[480px]:grid-cols-[40px_minmax(0,1fr)_16px] max-[480px]:[&>span:nth-child(3)]:col-start-2 max-[480px]:[&>span:nth-child(3)]:row-start-2",
  folderOrderCopy: "min-w-0 [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:mt-1 [&_small]:block [&_small]:truncate [&_small]:text-[9px] [&_small]:text-[#75807b]",
  detailBlock: "grid gap-2 [&>span]:text-[10px] [&>span]:font-semibold [&>span]:text-[#69736e] [&_p]:m-0 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-[#56615c]",
  detailTitle: "flex justify-between [&>span]:text-[10px] [&>span]:font-semibold [&>span]:text-[#69736e] [&_small]:text-[10px] [&_small]:text-[#75807b]",
  imageGrid: "grid grid-cols-2 gap-[9px]",
  imageTile: "flex aspect-[1.35] min-w-0 flex-col items-center justify-center gap-2 rounded-lg bg-[#eef1ee] text-[#78837e] [&_svg]:size-5 [&_small]:max-w-[85%] [&_small]:truncate [&_small]:text-[9px] [&_time]:text-[8px] [&_time]:text-[#65706b]",
  imagePreview: "relative justify-end overflow-hidden bg-cover bg-center text-white after:absolute after:inset-x-0 after:bottom-0 after:top-[45%] after:bg-gradient-to-b after:from-transparent after:to-[rgb(14_24_21/75%)] [&_small]:relative [&_small]:z-[1] [&_small]:text-white [&_small]:[text-shadow:0_1px_2px_rgb(0_0_0/30%)] [&_time]:relative [&_time]:z-[1] [&_time]:text-white [&_time]:[text-shadow:0_1px_2px_rgb(0_0_0/30%)]",
  drawerEmpty: "col-span-full p-7 text-center text-[11px] text-[#75807b]",
} as const;

const navigation = [
  { label: "Inicio", href: "/", view: "resumen", icon: GridIcon },
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
  const [dataSource, setDataSource] = useState<"loading" | "local" | "supabase">("loading");

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      const loadLocalWorkspace = () => {
        if (cancelled) return;
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
        setDataSource("local");
      };

      if (!isSupabaseConfigured()) {
        loadLocalWorkspace();
        return;
      }

      void loadWorkspace()
        .then((workspace) => {
          if (cancelled) return;
          setFolders(workspace.folders);
          setOrders(workspace.orders);
          setDataSource("supabase");
        })
        .catch(() => {
          if (cancelled) return;
          sileo.error({
            title: "No se pudo conectar con Supabase",
            description: "Se abrió el modo local para que puedas seguir trabajando.",
          });
          loadLocalWorkspace();
        });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (dataSource === "local") {
      window.localStorage.setItem("mava-orders", JSON.stringify(orders));
    }
  }, [orders, dataSource]);

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

  async function createOrder(input: { clientId: string; notes: string; files: File[] }) {
    if (dataSource === "loading") return false;
    const folder = folders.find((candidate) => candidate.id === input.clientId);
    if (!folder) return false;

    try {
      let order: Order;
      if (dataSource === "supabase") {
        order = await createRemoteOrder(folder.id, input.notes);
        if (input.files.length) {
          const upload = await uploadRemoteImages({
            clientId: folder.id,
            orderId: order.id,
            files: input.files,
          });
          order = { ...order, images: upload.images };
        }
      } else {
        const id = crypto.randomUUID();
        order = {
          id,
          code: getNextCode(orders),
          clientId: folder.id,
          clientName: folder.name,
          status: "Pendiente",
          notes: input.notes,
          createdAt: new Date().toISOString(),
          images: await Promise.all(input.files.map((file) => fileToOrderImage(file, id))),
          cover: "linear-gradient(145deg, #dccab0, #8d7255)",
        };
      }
      setOrders((current) => [order, ...current]);
      setSelectedOrder(order);
      return true;
    } catch {
      sileo.error({
        title: "Error al crear el pedido",
        description: `No se pudo crear el pedido de ${folder.name}. Intenta nuevamente.`,
      });
      return false;
    }
  }

  async function updateStatus(id: string, status: OrderStatus) {
    const previousStatus = orders.find((order) => order.id === id)?.status;
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, status } : order)));
    setSelectedOrder((current) => (current?.id === id ? { ...current, status } : current));

    if (dataSource !== "supabase") return;
    try {
      await updateRemoteOrderStatus(id, status);
    } catch {
      if (previousStatus) {
        setOrders((current) => current.map((order) => order.id === id ? { ...order, status: previousStatus } : order));
        setSelectedOrder((current) => current?.id === id ? { ...current, status: previousStatus } : current);
      }
      sileo.error({
        title: "No se pudo cambiar el estado",
        description: "El pedido volvió a su estado anterior.",
      });
    }
  }

  async function uploadImagesToFolder(clientId: string, files: File[], requestedOrderId?: string) {
    if (dataSource === "loading") return false;
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
      const uploadedImages = dataSource === "supabase"
        ? (await uploadRemoteImages({ clientId, orderId: targetOrder.id, files })).images
        : await Promise.all(files.map((file) => fileToOrderImage(file, targetOrder.id)));
      const updatedOrder = {
        ...targetOrder,
        images: [...uploadedImages, ...targetOrder.images],
      };
      const updatedOrders = orders.map((order) => (
        order.id === targetOrder.id ? updatedOrder : order
      ));

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
    if (dataSource === "loading") return false;
    const folder = folders.find((candidate) => candidate.id === clientId);
    if (!folder) return false;

    try {
      let order: Order;
      if (dataSource === "supabase") {
        order = await createRemoteOrder(folder.id, "");
        const upload = await uploadRemoteImages({ clientId: folder.id, orderId: order.id, files });
        order = { ...order, images: upload.images };
      } else {
        const id = crypto.randomUUID();
        order = {
          id,
          code: getNextCode(orders),
          clientId: folder.id,
          clientName: folder.name,
          status: "Pendiente",
          notes: "",
          createdAt: new Date().toISOString(),
          images: await Promise.all(files.map((file) => fileToOrderImage(file, id))),
          cover: "linear-gradient(145deg, #dccab0, #8d7255)",
        };
      }
      const updatedOrders = [order, ...orders];
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
    <div className={ui.appShell}>
      <Toaster position="top-right" />
      <header className={ui.sidebar}>
        <Link className={ui.brand} href="/" aria-label="Ir al inicio">
          <div className={ui.brandMark}>M</div>
          <div className={ui.brandCopy}><strong>MAVA</strong><span>Pedidos</span></div>
        </Link>
        <div className={ui.sidebarFoot}>
          <button className={ui.secondaryButton} disabled={dataSource === "loading"} onClick={() => setShowUpload(true)}>
            <UploadIcon /><span className="max-[560px]:sr-only">Subir imágenes</span>
          </button>
          <button className={ui.primaryButton} disabled={dataSource === "loading"} onClick={() => setShowCreate(true)}>
            <PlusIcon /><span className="max-[440px]:sr-only">Nuevo pedido</span>
          </button>
        </div>
      </header>
      <nav className={ui.nav} aria-label="Navegación principal">
        {navigation.map(({ label, href, view: itemView, icon: Icon }) => (
          <Link aria-current={view === itemView ? "page" : undefined} className={`${ui.navItem} ${view === itemView ? ui.navActive : ""}`} href={href} key={label}>
            <Icon /><span>{label}</span>
          </Link>
        ))}
      </nav>

      <main className={ui.main}>
        <header className={ui.topbar}>
          <div>
            <p className={ui.eyebrow}>
              {view === "pedidos" ? "Gestión" : view === "carpetas" ? "Organización" : "Mi taller"}
            </p>
            <h1 className={ui.h1}>
              {view === "pedidos" ? "Pedidos" : view === "carpetas" ? "Carpetas" : "Resumen"}
            </h1>
            <p className={ui.connectionStatus}>
              <i className={
                dataSource === "supabase"
                  ? "bg-[#3f8a69]"
                  : dataSource === "local"
                    ? "bg-[#c58a52]"
                    : "animate-pulse bg-[#9aa39f]"
              } />
              {dataSource === "supabase"
                ? "Supabase conectado"
                : dataSource === "local"
                  ? "Datos guardados en este dispositivo"
                  : "Conectando datos..."}
            </p>
          </div>
        </header>

        {view === "resumen" && <section className={ui.overview} aria-labelledby="overview-title">
          <h2 className="sr-only" id="overview-title">Pedidos por estado</h2>
          <div className={ui.metricGrid}>
            {statuses.map((status) => (
              <button
                className={`${ui.metricCard} ${activeStatus === status ? ui.metricSelected : ""}`}
                key={status}
                onClick={() => setActiveStatus(activeStatus === status ? "Todos" : status)}
                aria-pressed={activeStatus === status}
              >
                <span className={ui.metricLabel}>{status}</span>
                <strong>{dataSource === "loading" ? "—" : counts[status]}</strong>
              </button>
            ))}
          </div>
        </section>}

        <section aria-labelledby="orders-title">
          <div className={`${ui.sectionHeading} ${ui.ordersHeading}`}>
            <div>
              <h2 className={ui.h2} id="orders-title">{view === "pedidos" ? "Todos los pedidos" : "Carpetas"}</h2>
              <p className="mt-1 text-[11px] text-[#7b8580]">
                {view === "pedidos" ? `${filteredOrders.length} pedidos encontrados` : "Pedidos agrupados por cliente"}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 max-[680px]:w-full">
              {activeStatus !== "Todos" && (
                <button className={ui.textButton} onClick={() => setActiveStatus("Todos")}>
                  Quitar filtro
                </button>
              )}
              <label className={ui.searchBox}>
                <SearchIcon />
                <span className="sr-only">Buscar pedidos</span>
                <input className={ui.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar carpeta o código" />
              </label>
            </div>
          </div>

          <div className={ui.orderList}>
            {dataSource === "loading" ? (
              <div className={ui.emptyState}>
                <BoxIcon />
                <strong>Cargando pedidos</strong>
                <span>Estamos preparando tu espacio de trabajo.</span>
              </div>
            ) : view === "pedidos" ? (
              <>
                <div className={`${ui.tableGrid} ${ui.listHead}`}><span>Pedido</span><span>Estado</span><span>Imágenes</span><span>Creado</span><span /></div>
                {filteredOrders.map((order) => (
                  <button className={`${ui.tableGrid} ${ui.orderRow}`} key={order.id} onClick={() => setSelectedOrder(order)}>
                    <span className={ui.orderIdentity}>
                      <span className={ui.orderCover} style={{ background: order.cover }}><ImageIcon /></span>
                      <span><strong>{order.code}</strong><small>Carpeta {order.clientName} · {formatDate(order.createdAt)}</small></span>
                    </span>
                    <span className={ui.statusCell}><span className={`${ui.statusPill} ${statusStyles[order.status]}`}><i />{order.status}</span></span>
                    <span className={ui.imageCount}><ImageIcon /> {order.images.length}</span>
                    <span className={ui.dateCell}>{formatDate(order.createdAt)}</span>
                    <span className={ui.rowArrow}><ArrowIcon /></span>
                  </button>
                ))}
                {!filteredOrders.length && <div className={ui.emptyState}><SearchIcon /><strong>No encontramos pedidos</strong><span>Probá con otro código, carpeta o estado.</span></div>}
              </>
            ) : (
              <>
                <div className={`${ui.tableGrid} ${ui.listHead}`}><span>Carpeta</span><span>Estado</span><span>Imágenes</span><span>Actividad</span><span /></div>
                {folderSummaries.map((folder) => (
                  <button className={`${ui.tableGrid} ${ui.orderRow}`} key={folder.id} onClick={() => setSelectedFolderId(folder.id)}>
                    <span className={ui.orderIdentity}>
                      <span className={`${ui.orderCover} ${ui.folderCover}`}><FolderIcon /></span>
                      <span><strong>{folder.name}</strong><small>{folder.orderCount} pedido{folder.orderCount === 1 ? "" : "s"} en la carpeta</small></span>
                    </span>
                    <span className={ui.statusCell}><span className={`${ui.statusPill} ${folder.pendingCount ? statusStyles.Pendiente : statusStyles.Entregado}`}><i />{folder.pendingCount ? `${folder.pendingCount} pendiente${folder.pendingCount === 1 ? "" : "s"}` : "Sin pendientes"}</span></span>
                    <span className={ui.imageCount}><ImageIcon /> {folder.imageCount}</span>
                    <span className={ui.dateCell}>{folder.latestAt ? formatDate(folder.latestAt) : "Sin actividad"}</span>
                    <span className={ui.rowArrow}><ArrowIcon /></span>
                  </button>
                ))}
                {!folderSummaries.length && <div className={ui.emptyState}><SearchIcon /><strong>No encontramos carpetas</strong><span>Probá con otro nombre, código o estado.</span></div>}
              </>
            )}
          </div>
        </section>
      </main>

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
          onAddImages={(files) => uploadImagesToFolder(selectedOrder.clientId, files, selectedOrder.id)}
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
  onCreate: (input: { clientId: string; notes: string; files: File[] }) => Promise<boolean>;
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
      setSaving(true);
      const success = await onCreate({ clientId, notes: notes.trim(), files });
      setSaving(false);
      if (success) onClose();
      return;
    }

    if (!files.length || !effectiveOrderId) return;
    setSaving(true);
    const success = await onAssignExisting(clientId, files, effectiveOrderId);
    setSaving(false);
    if (success) onClose();
  }

  return (
    <div className={ui.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={ui.modal} role="dialog" aria-modal="true" aria-labelledby="new-order-title">
        <div className={ui.modalHead}>
          <div><p className={ui.eyebrow}>Nuevo pedido · Paso {step} de 2</p><h2 id="new-order-title">{step === 1 ? `Crear ${nextCode}` : "Asignar imágenes"}</h2></div>
          <button className={ui.iconButton} onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <>
              <label className={ui.field}><span>Cliente / carpeta</span><select autoFocus required value={clientId} onChange={(event) => setClientId(event.target.value)}>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
              <label className={ui.field}><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Medidas, marco, fecha de entrega..." rows={3} /></label>
              <div className={ui.uploadZone}>
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                <UploadIcon />
                <strong>{files.length ? `${files.length} imagen${files.length === 1 ? "" : "es"} seleccionada${files.length === 1 ? "" : "s"}` : "Agregar imágenes"}</strong>
                <span>En el próximo paso vas a confirmar a qué pedido asignarlas.</span>
                <button type="button" className={ui.secondaryButton} onClick={() => fileInput.current?.click()}>Seleccionar archivos</button>
              </div>
              {files.length > 0 && <div className={ui.fileSummary}>{files.map((file) => <span key={`${file.name}-${file.size}`}><ImageIcon />{file.name}</span>)}</div>}
            </>
          ) : (
            <div className={ui.assignmentStep}>
              <button type="button" className={`${ui.assignmentCard} ${assignment === "new" ? ui.assignmentSelected : ""}`} onClick={() => setAssignment("new")}>
                <span className={`${ui.assignmentRadio} ${assignment === "new" ? ui.assignmentRadioSelected : ""}`} />
                <span><strong>Asignar a pedido nuevo</strong><small>Crear {nextCode} y vincularle las imágenes seleccionadas.</small></span>
              </button>
              <button type="button" disabled={!recommendedOrder || !files.length} className={`${ui.assignmentCard} ${assignment === "existing" ? ui.assignmentSelected : ""}`} onClick={() => recommendedOrder && files.length && setAssignment("existing")}>
                <span className={`${ui.assignmentRadio} ${assignment === "existing" ? ui.assignmentRadioSelected : ""}`} />
                <span><strong>Asignar a un pedido</strong><small>{!files.length ? "Primero seleccioná al menos una imagen." : recommendedOrder ? `Último pedido pendiente: ${recommendedOrder.code}.` : "No hay pedidos pendientes disponibles."}</small></span>
              </button>
              {assignment === "existing" && pendingOrders.length > 0 && (
                <label className={`${ui.field} ${ui.assignmentSelect}`}>
                  <span>Pedido pendiente</span>
                  <select value={effectiveOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                    {pendingOrders.map((order, index) => <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Último pedido" : ""}</option>)}
                  </select>
                </label>
              )}
              <div className={ui.safetyNote}><span>✓</span><p><strong>Confirmación manual</strong>No se creará ni modificará ningún pedido hasta que confirmes esta selección.</p></div>
            </div>
          )}
          <div className={ui.modalActions}>
            <button type="button" className={ui.secondaryButton} onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 2 ? "Atrás" : "Cancelar"}</button>
            <button className={ui.primaryButton} disabled={saving || (step === 2 && assignment === "existing" && (!files.length || !effectiveOrderId))} type="submit">{saving ? "Guardando..." : step === 1 ? "Continuar" : assignment === "new" ? "Crear pedido" : "Asignar imágenes"}</button>
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
    <div className={ui.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={ui.modal} role="dialog" aria-modal="true" aria-labelledby="upload-folder-title">
        <div className={ui.modalHead}>
          <div><p className={ui.eyebrow}>Paso {step} de 2</p><h2 id="upload-folder-title">{step === 1 ? "Subir imágenes" : "¿A qué pedido las asignamos?"}</h2></div>
          <button className={ui.iconButton} onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
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
                <span>
                  <strong>Asignar a un pedido</strong>
                  <small>{recommendedOrder ? `Último pedido pendiente: ${recommendedOrder.code}.` : "No hay pedidos pendientes disponibles."}</small>
                </span>
              </button>
              {assignment === "existing" && pendingOrders.length > 0 && (
                <label className={`${ui.field} ${ui.assignmentSelect}`}>
                  <span>Pedido pendiente</span>
                  <select value={effectiveOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                    {pendingOrders.map((order, index) => (
                      <option value={order.id} key={order.id}>{order.code}{index === 0 ? " — Último pedido" : ""}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className={ui.safetyNote}><span>✓</span><p><strong>Destino confirmado</strong>Las {files.length} imágenes quedarán vinculadas por ID y no se mezclarán con otros pedidos.</p></div>
            </div>
          )}
          <div className={ui.modalActions}>
            <button type="button" className={ui.secondaryButton} onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 2 ? "Atrás" : "Cancelar"}</button>
            <button className={ui.primaryButton} disabled={!files.length || uploading || (step === 2 && assignment === "existing" && !effectiveOrderId)} type="submit">
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
    <div className={`${ui.modalBackdrop} ${ui.drawerBackdrop}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={ui.drawer} role="dialog" aria-modal="true" aria-labelledby="folder-title">
        <div className={ui.modalHead}>
          <div><p className={ui.eyebrow}>Carpeta de pedidos</p><h2 id="folder-title">{folder.name}</h2></div>
          <button className={ui.iconButton} onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <div className={ui.folderSummary}>
          <span><strong>{orders.length}</strong>Pedidos</span>
          <span><strong>{orders.filter((order) => order.status === "Pendiente").length}</strong>Pendientes</span>
          <span><strong>{orders.reduce((total, order) => total + order.images.length, 0)}</strong>Imágenes</span>
        </div>
        <div className={ui.folderOrderList}>
          {orders.map((order) => (
            <button className={ui.folderOrderCard} key={order.id} onClick={() => onSelectOrder(order)}>
              <span className={ui.orderCover} style={{ background: order.cover }}><ImageIcon /></span>
              <span className={ui.folderOrderCopy}>
                <strong>{order.code}</strong>
                <small>{order.images.length} imagen{order.images.length === 1 ? "" : "es"} · {formatDate(order.createdAt)}</small>
              </span>
              <span className={`${ui.statusPill} ${statusStyles[order.status]}`}><i />{order.status}</span>
              <ArrowIcon />
            </button>
          ))}
          {!orders.length && <div className={ui.drawerEmpty}>Esta carpeta todavía no tiene pedidos.</div>}
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
    <div className={`${ui.modalBackdrop} ${ui.drawerBackdrop}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={ui.drawer} role="dialog" aria-modal="true" aria-labelledby="order-title">
        <div className={ui.modalHead}>
          <div><p className={ui.eyebrow}>{order.code}</p><h2 id="order-title">{order.clientName}</h2></div>
          <button className={ui.iconButton} onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <div className={ui.drawerContent}>
          <label className={ui.field}><span>Estado</span><select value={order.status} onChange={(event) => onStatusChange(event.target.value as OrderStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void addImages(Array.from(event.target.files ?? []))} />
          <button className={`${ui.primaryButton} w-full`} disabled={uploading || order.status !== "Pendiente"} onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            {uploading
              ? "Subiendo..."
              : order.status === "Pendiente"
                ? "Agregar imágenes"
                : "Pedido cerrado"}
          </button>
          <div className={`${ui.safetyNote} -mt-2`}><span>✓</span><p><strong>Destino confirmado</strong>Las imágenes se vinculan a {order.code} mediante su ID.</p></div>
          <div className={ui.detailBlock}><span>Notas</span><p>{order.notes || "Sin notas para este pedido."}</p></div>
          <div className={ui.detailBlock}>
            <div className={ui.detailTitle}><span>Imágenes</span><small>{order.images.length} archivos</small></div>
            <div className={ui.imageGrid}>
              {order.images.map((image, index) => (
                <div className={`${ui.imageTile} ${image.previewUrl ? ui.imagePreview : ""}`} key={image.id} style={image.previewUrl ? { backgroundImage: `url("${image.previewUrl}")` } : index === 0 ? { background: order.cover } : undefined}>
                  {!image.previewUrl && <ImageIcon />}
                  <small>{image.name}</small>
                  <time dateTime={image.addedAt}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(image.addedAt))}</time>
                </div>
              ))}
              {!order.images.length && <div className={ui.drawerEmpty}>Todavía no hay imágenes.</div>}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
