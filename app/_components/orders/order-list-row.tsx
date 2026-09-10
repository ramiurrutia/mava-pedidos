import { getOrderArtworkProgress, getOrderFolderId, MAVA_STOCK_FOLDER_ID, MAVA_STOCK_SOURCE, type Order } from "../../../lib/orders";
import { CheckIcon, FolderIcon, ImageIcon } from "../icons";
import { OrderMoveRow } from "./order-folder-actions";
import { formatDate, statusStyles, ui } from "./shared";

export const orderListGrid = "grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-3 @min-[680px]:grid-cols-[minmax(0,1fr)_136px_76px_44px]";

export function OrderListRow({ order, showFolder = true }: { order: Order; showFolder?: boolean }) {
  const { ready, total } = getOrderArtworkProgress(order);
  const folderName = getOrderFolderId(order) === MAVA_STOCK_FOLDER_ID ? MAVA_STOCK_SOURCE : order.folderName ?? order.clientName;
  return (
    <OrderMoveRow order={order} className={`${orderListGrid} gap-y-2 border-b border-[#eceeeb] bg-white px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[#fafbf9] @min-[680px]:px-4`}>
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
        <span className={`${ui.orderCover} text-white!`} style={{ background: order.cover }}><ImageIcon /></span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold text-[#26372e]" title={order.clientName}>{order.clientName}</strong>
          <small className="mt-1 block break-all text-[11px] text-[#68726d]">{order.code}</small>
        </span>
      </span>
      <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-2 @min-[680px]:col-start-2 @min-[680px]:row-start-1">
        <span className={`${ui.statusPill} ${statusStyles[order.status]}`}><i />{order.status}</span>
        <span className="text-[11px] text-[#7b8580] @min-[680px]:hidden">{formatDate(order.createdAt)}</span>
      </span>
      <span className="col-start-3 row-start-1 hidden text-xs text-[#7b8580] @min-[680px]:block">{formatDate(order.createdAt)}</span>
      <span className="col-span-full row-start-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] leading-relaxed @min-[680px]:row-start-2 @min-[680px]:pl-13">
        {showFolder && <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[#68726d]" title={`Carpeta: ${folderName.toLocaleUpperCase("es")}`}><FolderIcon className="size-3 shrink-0" /><span className="truncate">{folderName.toLocaleUpperCase("es")}</span></span>}
        {order.sourceSystem && order.sourceSystem !== (showFolder ? folderName : "") && <span className="rounded bg-[#edf1ef] px-1.5 py-0.5 text-[10px] font-medium text-[#68726d]">{order.sourceSystem}</span>}
        <span className={`inline-flex items-center gap-1 ${order.canvasesOrdered ? "text-[#527460]" : "font-medium text-[#a3622f]"}`}>{order.canvasesOrdered && <CheckIcon className="size-3" />}{order.canvasesOrdered ? "Telas pedidas" : "Telas sin pedir"}</span>
        <span className={total && ready === total ? "font-medium text-[#235c4c]" : "text-[#68726d]"}>{total ? `${ready}/${total} cuadros listos` : "Sin cuadros"}</span>
      </span>
    </OrderMoveRow>
  );
}
