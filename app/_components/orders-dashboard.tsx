"use client";

import { useRouter } from "next/navigation";
import { Toaster } from "sileo";
import "sileo/styles.css";
import {
  getOrderFolderId,
  MAVA_STOCK_FOLDER_ID,
  MAVA_STOCK_SOURCE,
  type OrderStatus,
} from "../../lib/orders";
import { AppShell, type NavigationMemoryAction } from "./orders/app-shell";
import { CreateOrderPage } from "./orders/create-order-page";
import { FolderPage } from "./orders/folder-page";
import { OrderPage } from "./orders/order-page";
import { ConnectionErrorPage, LoadingPage, ResourceNotFound } from "./orders/resource-states";
import { type DashboardView, type WorkspaceView } from "./orders/shared";
import { UploadToFolderPage } from "./orders/upload-to-folder-page";
import { useOrdersWorkspace } from "./orders/use-orders-workspace";
import { WorkspacePage } from "./orders/workspace-page";
import { OrderDragProvider } from "./orders/order-drag-provider";
import { ImportPdfPage } from "./orders/import-pdf-page";

export function OrdersDashboard({
  view = "resumen",
  entityId,
  initialStatus,
}: {
  view?: DashboardView;
  entityId?: string;
  initialStatus?: OrderStatus;
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
  const navigationMemoryAction: NavigationMemoryAction = (
    (view === "pedido" || view === "carpeta") && workspace.dataSource !== "supabase"
      ? "ignore"
      : (view === "pedido" && !routeOrder) || (view === "carpeta" && !routeFolder)
        ? "reset"
        : "remember"
  );

  return (
    <OrderDragProvider>
    <AppShell activeView={activeView} memoryAction={navigationMemoryAction}>
      <Toaster
        offset={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        options={{ fill: "#111311", roundness: 18 }}
        position="top-center"
        theme="light"
      />
      {workspace.dataSource === "error" ? (
        <ConnectionErrorPage onRetry={workspace.retryConnection} />
      ) : isWorkspaceView(view) ? (
        <WorkspacePage
          dataSource={workspace.dataSource}
          folders={workspace.folders}
          initialStatus={initialStatus}
          orders={workspace.orders}
          view={view}
        />
      ) : workspace.dataSource === "loading" ? (
        <LoadingPage />
      ) : view === "importar-pdf" ? (
        <ImportPdfPage />
      ) : view === "nuevo" ? (
        <CreateOrderPage
          folders={workspace.folders}
          onAssignExisting={workspace.uploadImagesToFolder}
          onClose={() => router.back()}
          onCreate={workspace.createOrder}
          onOpenOrder={(orderId) => router.replace(`/pedidos/${encodeURIComponent(orderId)}`)}
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
          onClose={() => router.replace("/pedidos")}
          onDelete={async () => {
            const deleted = await workspace.deleteOrder(routeOrder.id);
            if (deleted) router.replace("/pedidos");
            return deleted;
          }}
          onEdit={(details) => workspace.updateOrderDetails(routeOrder.id, details)}
          onEditImageDescription={(imageId, description) => workspace.updateImageDescription(routeOrder.id, imageId, description)}
          onDeleteImage={(imageId) => workspace.deleteImage(routeOrder.id, imageId)}
          onCanvasesOrderedChange={(value) => workspace.updateCanvasesOrdered(routeOrder.id, value)}
          onArtworkPreparationChange={(artworkKey, status) => workspace.updateArtworkPreparation(routeOrder.id, artworkKey, status)}
          onStatusChange={(status) => workspace.updateStatus(routeOrder.id, status)}
          order={routeOrder}
        />
      ) : view === "carpeta" && routeFolder ? (
        <FolderPage
          folder={routeFolder}
          onClose={() => router.replace("/carpetas")}
          orders={workspace.orders
            .filter((order) => getOrderFolderId(order) === routeFolder.id)
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))}
        />
      ) : (
        <ResourceNotFound onClose={() => router.replace(activeView === "carpetas" ? "/carpetas" : activeView === "pedidos" ? "/pedidos" : "/")} />
      )}
    </AppShell>
    </OrderDragProvider>
  );
}

function isWorkspaceView(view: DashboardView): view is WorkspaceView {
  return view === "resumen" || view === "pedidos" || view === "carpetas";
}

function getActiveNavigationView(view: DashboardView): WorkspaceView {
  if (view === "pedido" || view === "nuevo" || view === "importar-pdf") return "pedidos";
  if (view === "carpeta") return "carpetas";
  if (view === "subir") return "resumen";
  return view;
}
