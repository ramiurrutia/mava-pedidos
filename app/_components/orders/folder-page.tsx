import Link from "next/link";
import {
  isOrderActive,
  MAVA_STOCK_FOLDER_ID,
  type ClientFolder,
  type Order,
} from "../../../lib/orders";
import { ArrowIcon, BackIcon, ImageIcon } from "../icons";
import { formatDate, statusStyles, ui } from "./shared";

export function FolderPage({
  folder,
  orders,
  onClose,
}: {
  folder: ClientFolder;
  orders: Order[];
  onClose: () => void;
}) {
  const isSourceGroup = folder.id === MAVA_STOCK_FOLDER_ID;

  return (
    <section className={ui.pagePanel} aria-labelledby="folder-title">
      <button className={ui.backButton} type="button" onClick={onClose}><BackIcon /> Volver</button>
      <div className={ui.pageCard}>
        <div className={ui.pageHead}>
          <div><p className={ui.eyebrow}>{isSourceGroup ? "Pedidos sincronizados" : "Carpeta de pedidos"}</p><h2 id="folder-title">{folder.name}</h2></div>
        </div>
        <div className={ui.folderSummary}>
          <span><strong>{orders.length}</strong>Pedidos</span>
          <span><strong>{orders.filter((order) => isOrderActive(order.status)).length}</strong>Activos</span>
          <span><strong>{orders.reduce((total, order) => total + order.images.length, 0)}</strong>Imágenes</span>
        </div>
        <div className={ui.folderOrderList}>
          {orders.map((order) => (
            <Link className={`${ui.folderOrderCard} text-inherit no-underline`} href={`/pedidos/${encodeURIComponent(order.id)}`} key={order.id}>
              <span className={ui.orderCover} style={{ background: order.cover }}><ImageIcon /></span>
              <span className={ui.folderOrderCopy}>
                <strong>{order.code}</strong>
                <small>{isSourceGroup ? `${order.clientName} · ` : order.sourceSystem ? `${order.sourceSystem} · ` : ""}{order.images.length} imagen{order.images.length === 1 ? "" : "es"} · {formatDate(order.createdAt)}</small>
              </span>
              <span className={`${ui.statusPill} ${statusStyles[order.status]}`}><i />{order.status}</span>
              <ArrowIcon />
            </Link>
          ))}
          {!orders.length && <div className={ui.detailEmpty}>Esta carpeta todavía no tiene pedidos.</div>}
        </div>
      </div>
    </section>
  );
}
