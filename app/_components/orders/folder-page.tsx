import {
  getOrderArtworkProgress,
  isOrderActive,
  MAVA_STOCK_FOLDER_ID,
  type ClientFolder,
  type Order,
} from "../../../lib/orders";
import { BackIcon } from "../icons";
import { FolderDropTargets } from "./order-folder-actions";
import { OrderListRow } from "./order-list-row";
import { ui } from "./shared";

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
          <div><p className={ui.eyebrow}>{isSourceGroup ? "Pedidos sincronizados" : "Carpeta de pedidos"}</p><h2 id="folder-title">{folder.name.toLocaleUpperCase("es")}</h2></div>
        </div>
        <div className={ui.folderSummary}>
          <span><strong>{orders.length}</strong>Pedidos</span>
          <span><strong>{orders.filter((order) => isOrderActive(order.status)).length}</strong>Activos</span>
          <span><strong>{orders.reduce((total, order) => total + getOrderArtworkProgress(order).total, 0)}</strong>Cuadros</span>
        </div>
        <FolderDropTargets currentFolderId={folder.id} />
        <div className={`${ui.folderOrderList} @container`}>
          {orders.map((order) => <OrderListRow order={order} showFolder={false} key={order.id} />)}
          {!orders.length && <div className={ui.detailEmpty}>Esta carpeta todavía no tiene pedidos.</div>}
        </div>
      </div>
    </section>
  );
}
