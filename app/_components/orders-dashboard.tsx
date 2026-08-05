"use client";

import { useRouter } from "next/navigation";
import { Toaster } from "sileo";
import "sileo/styles.css";
import {
  isMavaStockOrder,
  MAVA_STOCK_FOLDER_ID,
  MAVA_STOCK_SOURCE,
} from "../../lib/orders";
import { AppShell } from "./orders/app-shell";
import { CreateOrderPage } from "./orders/create-order-page";
import { FolderPage } from "./orders/folder-page";
import { OrderPage } from "./orders/order-page";
import { ConnectionErrorPage, LoadingPage, ResourceNotFound } from "./orders/resource-states";
import { type DashboardView, type WorkspaceView } from "./orders/shared";
import { UploadToFolderPage } from "./orders/upload-to-folder-page";
import { useOrdersWorkspace } from "./orders/use-orders-workspace";
import { WorkspacePage } from "./orders/workspace-page";

export function OrdersDashboard({
  view = "resumen",
  entityId,
}: {
  view?: DashboardView;
  entityId?: string;
}) {
  const router = useRouter();
  const workspace = useOrdersWorkspace();
  const activeView = getActiveNavigationView(view);
  const routeOrder = view === "pedido"
    ? workspace.orders.find((order) => order.id === entityId)
    : undefined;
  const routeFolder = view === "carpeta"
    ? entityId === MAVA_STOCK_FOLDER_ID
      ? { id: MAVA_STOCK_FOLDER_ID, name: MAVA_STOCK_SOURCE }
      : workspace.folders.find((folder) => folder.id === entityId)
    : undefined;

  return (
    <AppShell activeView={activeView}>
      <Toaster position="top-right" />
      {workspace.dataSource === "error" ? (
        <ConnectionErrorPage onRetry={workspace.retryConnection} />
      ) : isWorkspaceView(view) ? (
        <WorkspacePage
          dataSource={workspace.dataSource}
          folders={workspace.folders}
          orders={workspace.orders}
          view={view}
        />
      ) : workspace.dataSource === "loading" ? (
        <LoadingPage />
      ) : view === "nuevo" ? (
        <CreateOrderPage
          folders={workspace.folders}
          onAssignExisting={workspace.uploadImagesToFolder}
          onClose={() => router.back()}
          onCreate={workspace.createOrder}
          orders={workspace.orders}
        />
      ) : view === "subir" ? (
        <UploadToFolderPage
          folders={workspace.folders}
          onClose={() => router.back()}
          onCreateNew={workspace.createPendingOrderWithImages}
          onUpload={workspace.uploadImagesToFolder}
          orders={workspace.orders}
        />
      ) : view === "pedido" && routeOrder ? (
        <OrderPage
          onAddImages={(uploads) => workspace.uploadImagesToFolder(routeOrder.clientId, uploads, routeOrder.id)}
          onClose={() => router.back()}
          onDelete={async () => {
            const deleted = await workspace.deleteOrder(routeOrder.id);
            if (deleted) router.replace("/pedidos");
            return deleted;
          }}
          onEdit={(details) => workspace.updateOrderDetails(routeOrder.id, details)}
          onEditImageDescription={(imageId, description) => workspace.updateImageDescription(routeOrder.id, imageId, description)}
          onStatusChange={(status) => workspace.updateStatus(routeOrder.id, status)}
          order={routeOrder}
        />
      ) : view === "carpeta" && routeFolder ? (
        <FolderPage
          folder={routeFolder}
          onClose={() => router.back()}
          orders={workspace.orders
            .filter((order) => routeFolder.id === MAVA_STOCK_FOLDER_ID
              ? isMavaStockOrder(order)
              : order.clientId === routeFolder.id && !isMavaStockOrder(order))
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))}
        />
      ) : (
        <ResourceNotFound onClose={() => router.back()} />
      )}
    </AppShell>
  );
}

function isWorkspaceView(view: DashboardView): view is WorkspaceView {
  return view === "resumen" || view === "pedidos" || view === "carpetas";
}

function getActiveNavigationView(view: DashboardView): WorkspaceView {
  if (view === "pedido" || view === "nuevo") return "pedidos";
  if (view === "carpeta") return "carpetas";
  if (view === "subir") return "resumen";
  return view;
}
