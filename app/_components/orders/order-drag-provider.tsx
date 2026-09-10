"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDragOperation, type DragEndEvent } from "@dnd-kit/react";
import { Accessibility, PointerActivationConstraints, type DropAnimationFunction } from "@dnd-kit/dom";
import { getOrderFolderId, isMavaStockOrder, MAVA_STOCK_FOLDER_ID, type Order } from "../../../lib/orders";
import { FolderIcon, ImageIcon, SpinnerIcon } from "../icons";
import { useOrdersWorkspace } from "./use-orders-workspace";

type PendingMove = { orderId: string; folderId: string };
type DragState = { activeOrder: Order | null; pendingMove: PendingMove | null };
const OrderDragContext = createContext<DragState>({ activeOrder: null, pendingMove: null });
export const useOrderDrag = () => useContext(OrderDragContext);

export function canDropOrder(order: Order, folderId: string) {
  return getOrderFolderId(order) !== folderId && (folderId !== MAVA_STOCK_FOLDER_ID || isMavaStockOrder(order));
}

const sensors = [
  PointerSensor.configure({ activationConstraints: () => [new PointerActivationConstraints.Delay({ value: 1000, tolerance: 8 })] }),
  KeyboardSensor.configure({ keyboardCodes: {
    start: ["Space"], end: ["Space", "Enter", "Tab"], cancel: ["Escape"],
    up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"],
  } }),
];

const accessibility = {
  plugin: Accessibility,
  options: {
    screenReaderInstructions: { draggable: "Para mover este pedido, presioná Espacio. Elegí una carpeta con las flechas y presioná Espacio para soltar. Escape cancela el movimiento." },
    announcements: {
      dragstart: () => "Pedido seleccionado. Elegí una carpeta de destino.",
      dragover: ({ operation }: { operation: { target: { data: Record<string, unknown> } | null } }) => operation.target ? `Destino: ${operation.target.data.folderName}.` : "Fuera de una carpeta de destino.",
      dragend: ({ canceled }: { canceled: boolean }) => canceled ? "Movimiento cancelado." : "Arrastre finalizado.",
    },
  },
};

export function OrderDragProvider({ children }: { children: ReactNode }) {
  const { orders, folders, moveOrder, dataSource } = useOrdersWorkspace();
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const busy = useRef(false);
  const dropDestination = useRef<DOMRect | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function finishDrag(event: DragEndEvent) {
    const { source, target } = event.operation;
    const order = orders.find((candidate) => candidate.id === source?.data.orderId);
    const folderId = target?.data.folderId;
    const valid = !event.canceled && !busy.current && dataSource === "supabase" && order
      && typeof folderId === "string" && canDropOrder(order, folderId)
      && (folderId === MAVA_STOCK_FOLDER_ID || folders.some((folder) => folder.id === folderId));
    dropDestination.current = valid ? target?.element?.getBoundingClientRect() ?? null : null;
    if (!valid) {
      setActiveOrder(null);
      return;
    }
    busy.current = true;
    setPendingMove({ orderId: order.id, folderId });
    try {
      // Keep the source and destinations in place until the drop animation ends.
      // This also avoids a fast response removing the row halfway through its landing.
      await new Promise<void>((resolve) => {
        const fallback = window.setTimeout(resolve, 600);
        animationComplete.current = () => { window.clearTimeout(fallback); resolve(); };
      });
      await moveOrder(order.id, folderId);
    } finally {
      busy.current = false;
      if (mounted.current) { setPendingMove(null); setActiveOrder(null); }
    }
  }

  const animationComplete = useRef<(() => void) | null>(null);
  useEffect(() => () => { animationComplete.current?.(); }, []);

  const animateDrop: DropAnimationFunction = async ({ feedbackElement, element }) => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // The overlay wrapper keeps the original row's dimensions. Animate the
      // visible compact card so it lands on the folder, even on a wide desktop row.
      const card = feedbackElement.firstElementChild ?? feedbackElement;
      const from = card.getBoundingClientRect();
      const to = dropDestination.current ?? element.getBoundingClientRect();
      const landing = Boolean(dropDestination.current);
      const dx = landing ? to.x + to.width / 2 - (from.x + from.width / 2) : to.x - from.x;
      const dy = landing ? to.y + to.height / 2 - (from.y + from.height / 2) : to.y - from.y;
      await card.animate([
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${landing ? 0.35 : 1})`, opacity: landing ? 0 : 1 },
      ], { duration: landing ? 240 : 200, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }).finished;
    } catch {
      // A canceled animation must not leave a valid move waiting indefinitely.
    } finally {
      dropDestination.current = null;
      animationComplete.current?.();
      animationComplete.current = null;
    }
  };

  return (
    <OrderDragContext.Provider value={{ activeOrder, pendingMove }}>
      <DragDropProvider sensors={sensors} plugins={(defaults) => [...defaults, accessibility]}
        onBeforeDragStart={(event) => { if (busy.current || dataSource !== "supabase") event.preventDefault(); }}
        onDragStart={({ operation }) => {
          dropDestination.current = null;
          setActiveOrder(orders.find((order) => order.id === operation.source?.data.orderId) ?? null);
        }}
        onDragEnd={finishDrag}>
        {children}
        <DragOverlay dropAnimation={animateDrop}>
          {(source) => {
            const order = source.data.order as Order | undefined;
            return order ? <OrderDragPreview order={order} saving={Boolean(pendingMove)} /> : null;
          }}
        </DragOverlay>
      </DragDropProvider>
    </OrderDragContext.Provider>
  );
}

function OrderDragPreview({ order, saving }: { order: Order; saving: boolean }) {
  const { target } = useDragOperation();
  const destination = target?.data.folderName as string | undefined;
  return (
    <div className="w-[min(300px,calc(100vw_-_32px))] rounded-xl border border-[#91b4a1] bg-white p-3 shadow-[0_16px_45px_rgb(20_45_30/22%)] ring-4 ring-[#235c4c]/10" aria-hidden="true">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg text-white" style={{ background: order.cover }}><ImageIcon /></span>
        <span className="min-w-0"><strong className="block truncate text-sm font-semibold">{order.clientName}</strong><small className="mt-1 block text-[11px] text-[#68726d]">{order.code}</small></span>
      </div>
      <p className="mt-3 flex items-center gap-2 border-t border-[#e5ece6] pt-2 text-xs text-[#235c4c]">{saving ? <SpinnerIcon className="size-3.5 animate-spin" /> : <FolderIcon className="size-3.5" />}<span className="truncate">{saving ? "Moviendo pedido…" : destination ? `Soltar en ${destination.toLocaleUpperCase("es")}` : "Arrastrá a una carpeta"}</span></p>
    </div>
  );
}
