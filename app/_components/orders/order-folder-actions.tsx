"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { pointerIntersection } from "@dnd-kit/collision";
import { isMavaStockOrder, MAVA_STOCK_FOLDER_ID, MAVA_STOCK_SOURCE, type ClientFolder, type Order } from "../../../lib/orders";
import { ArrowIcon, EditIcon, FolderIcon, MoreIcon, SpinnerIcon, TrashIcon } from "../icons";
import { useOrdersWorkspace } from "./use-orders-workspace";
import { MoveOrderDialog } from "./move-order-dialog";
import { DeleteOrderDialog } from "./delete-order-dialog";
import { canDropOrder, useOrderDrag } from "./order-drag-provider";

const menuItem = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-[#35433b] no-underline outline-none data-[highlighted]:bg-[#edf3ef] [&_svg]:size-4 [&_svg]:text-[#68726d]";

function RowMenu({ label, href, onMove, onDelete, disabled = false }: { label: string; href: string; onMove?: () => void; onDelete?: () => void; disabled?: boolean }) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`Acciones de ${label}`} className="relative z-10 col-start-[-2] row-start-1 grid size-11 place-items-center justify-self-end rounded-xl text-[#68726d] transition-colors hover:bg-[#edf3ef] data-[popup-open]:bg-[#e7efe9] data-[popup-open]:text-[#235c4c] focus-visible:outline-2 focus-visible:outline-[#235c4c] [&_svg]:size-5">
        <MoreIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50">
          <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-xl border border-[#dfe3df] bg-white p-1.5 shadow-[0_8px_30px_rgb(20_37_30/14%)] outline-none transition-[opacity,scale] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none">
            <Menu.LinkItem className={menuItem} render={<Link href={href} />}><ArrowIcon />Abrir {onMove ? "pedido" : "carpeta"}</Menu.LinkItem>
            {onMove && (disabled ? <Menu.Item disabled className={menuItem}><EditIcon />Editar pedido</Menu.Item> : <Menu.LinkItem className={menuItem} render={<Link href={`${href}?editar=1`} />}><EditIcon />Editar pedido</Menu.LinkItem>)}
            {onMove && <Menu.Item disabled={disabled} className={menuItem} onClick={onMove}><FolderIcon />Mover a carpeta</Menu.Item>}
            {onDelete && <><Menu.Separator className="my-1 border-t border-[#e4e7e3]" /><Menu.Item disabled={disabled} className={`${menuItem} text-[#a34e42] data-[highlighted]:bg-[#fff5f3] [&_svg]:text-[#a34e42]`} onClick={onDelete}><TrashIcon />Eliminar pedido</Menu.Item></>}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function OrderMoveRow({ order, className, children }: { order: Order; className: string; children: ReactNode }) {
  const [moving, setMoving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pressing, setPressing] = useState(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const { pendingMove } = useOrderDrag();
  const { dataSource } = useOrdersWorkspace();
  const disabled = Boolean(pendingMove) || dataSource !== "supabase" || moving || confirmingDelete;
  const { ref, handleRef, isDragging, isDropping } = useDraggable({
    id: `order:${order.id}`,
    type: "order",
    data: { orderId: order.id, order },
    disabled,
  });
  const saving = pendingMove?.orderId === order.id;
  const href = `/pedidos/${encodeURIComponent(order.id)}`;
  useEffect(() => {
    if (!pressing) return;
    const reset = () => { setPressing(false); pressOrigin.current = null; };
    document.addEventListener("pointerup", reset, true);
    document.addEventListener("pointercancel", reset, true);
    const timer = window.setTimeout(reset, 1050);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerup", reset, true);
      document.removeEventListener("pointercancel", reset, true);
    };
  }, [pressing]);
  return (
    <>
      <div
        ref={ref}
        aria-busy={saving}
        className={`${className} relative transition-[background-color,opacity] duration-200 motion-reduce:transition-none ${isDragging || isDropping || saving ? "!bg-[#eef4ee] opacity-45" : ""}`}
      >
        <Link ref={handleRef} href={href} aria-label={`Abrir ${order.code} de ${order.clientName}`} title="Tocá para abrir. Mantené apretado 1 segundo para mover." className="absolute inset-0 select-none rounded-lg [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-[#235c4c]" draggable={false}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0 || !event.isPrimary) return;
            pressOrigin.current = { x: event.clientX, y: event.clientY };
            setPressing(true);
          }}
          onPointerMove={(event) => {
            const origin = pressOrigin.current;
            if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) {
              setPressing(false);
              pressOrigin.current = null;
            }
          }}
          onContextMenu={(event) => { if (pressing || isDragging || isDropping) event.preventDefault(); }}
        />
        <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#3f765f] ${pressing && !isDragging ? "scale-x-100 transition-transform duration-1000 ease-linear motion-reduce:transition-none" : "scale-x-0"}`} />
        {children}
        <RowMenu label={order.code} href={href} disabled={disabled} onMove={() => setMoving(true)} onDelete={() => setConfirmingDelete(true)} />
      </div>
      {moving && <MoveOrderDialog order={order} onClose={() => setMoving(false)} />}
      {confirmingDelete && <DeleteOrderDialog order={order} onClose={() => setConfirmingDelete(false)} />}
    </>
  );
}

function useFolderDrop(folder: ClientFolder) {
  const instanceId = useId();
  const { activeOrder, pendingMove } = useOrderDrag();
  const eligible = !activeOrder || canDropOrder(activeOrder, folder.id);
  const { ref, isDropTarget } = useDroppable({
    id: `folder:${folder.id}:${instanceId}`,
    type: "folder",
    data: { folderId: folder.id, folderName: folder.name },
    collisionDetector: pointerIntersection,
    accept: (source) => source.type === "order" && canDropOrder(source.data.order as Order, folder.id),
    disabled: !eligible,
  });
  return { ref, over: isDropTarget, saving: pendingMove?.folderId === folder.id, eligible };
}

export function FolderDropRow({ folder, className, children }: { folder: ClientFolder; className: string; children: ReactNode }) {
  const { over, ref, saving } = useFolderDrop(folder);
  const href = `/carpetas/${encodeURIComponent(folder.id)}`;
  return (
    <div ref={ref} aria-busy={saving} className={`${className} relative transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${over ? "!bg-[#e4f0e8] ring-2 ring-inset ring-[#3f765f]" : ""}`}>
      <Link href={href} aria-label={`Abrir carpeta ${folder.name.toLocaleUpperCase("es")}`} className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-[#235c4c]" />
      {children}
      <span className="relative z-10 col-start-[-2] row-start-1 justify-self-end">{saving ? <span role="status" aria-label="Moviendo pedido" className="grid size-11 place-items-center"><SpinnerIcon className="animate-spin" /></span> : <RowMenu label={folder.name.toLocaleUpperCase("es")} href={href} />}</span>
    </div>
  );
}

function FolderDropTarget({ folder }: { folder: ClientFolder }) {
  const { over, saving, ref, eligible } = useFolderDrop(folder);
  return (
    <div ref={ref} data-folder-drop={folder.id} aria-busy={saving} className={`flex min-h-12 max-w-full items-center gap-2 rounded-xl border px-3 text-xs transition-[background-color,box-shadow,scale,opacity] duration-150 motion-reduce:transition-none ${over ? "scale-[1.03] border-[#3f765f] bg-[#dfeee3] shadow-md ring-2 ring-[#b8d3c2]" : "border-[#dfe3df] bg-white"} ${eligible ? "" : "opacity-40"} text-[#235c4c] [&_svg]:size-4 [&_svg]:shrink-0`}>
      {saving ? <SpinnerIcon className="animate-spin" /> : <FolderIcon />}<span className="truncate">{folder.name.toLocaleUpperCase("es")}</span>
    </div>
  );
}

export function FolderDropTargets({ currentFolderId }: { currentFolderId?: string }) {
  const { folders, orders } = useOrdersWorkspace();
  const { activeOrder, pendingMove } = useOrderDrag();
  const [expanded, setExpanded] = useState(false);
  const showTargets = expanded || Boolean(activeOrder) || Boolean(pendingMove);
  const panelId = useId();
  const targets = folders.filter((folder) => folder.id !== currentFolderId);
  if (currentFolderId !== MAVA_STOCK_FOLDER_ID && orders.some(isMavaStockOrder)) {
    targets.unshift({ id: MAVA_STOCK_FOLDER_ID, name: MAVA_STOCK_SOURCE });
  }
  if (!targets.length) return null;
  return (
    <div className={`mb-4 ${activeOrder || pendingMove ? "sticky top-[76px] z-30" : ""}`}>
      <div className={`rounded-xl border bg-[#f3f6f2] transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${activeOrder ? "border-[#8dad9b] shadow-lg" : "border-[#e1e7e1]"}`}>
        <button type="button" disabled={Boolean(activeOrder || pendingMove)} aria-expanded={showTargets} aria-controls={panelId} onClick={() => setExpanded((value) => !value)} className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl px-4 text-left text-xs text-[#354b3e] focus-visible:outline-2 focus-visible:outline-[#235c4c]">
          <FolderIcon className="size-4" /><span className="flex-1 font-medium">{pendingMove ? "Guardando movimiento…" : activeOrder ? "Soltá el pedido en una carpeta" : "Mover entre carpetas"}</span>{!activeOrder && !pendingMove && <span className="text-[11px] text-[#68726d]">{expanded ? "Ocultar" : "Organizar"}</span>}<ArrowIcon className={`size-3.5 transition-transform motion-reduce:transition-none ${showTargets ? "rotate-90" : ""}`} />
        </button>
        <div id={panelId} inert={!showTargets} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${showTargets ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="px-3 pb-3">
              <p className="mb-2 px-1 text-xs leading-relaxed text-[#68726d]">Mantené apretado un pedido durante 1 segundo y arrastralo. También podés moverlo desde los tres puntos.</p>
              <div className="flex max-h-[min(28dvh,180px)] flex-wrap gap-2 overflow-y-auto overscroll-contain p-1">
                {targets.map((folder) => <FolderDropTarget key={folder.id} folder={folder} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
