"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sileo } from "sileo";
import {
  findLatestPendingOrder,
  getOrderFolderId,
  isMavaStockOrder,
  MAVA_STOCK_FOLDER_ID,
  isOrderActive,
  type ArtworkPreparationStatus,
  type ClientFolder,
  type Order,
  type OrderStatus,
  type PendingImageUpload,
} from "../../../lib/orders";
import { isSupabaseConfigured } from "../../../lib/supabase/client";
import {
  createRemoteOrder,
  moveRemoteOrder,
  deleteRemoteOrder,
  loadWorkspace,
  updateRemoteOrderDetails,
  updateRemoteImageDescription,
  updateRemoteCanvasesOrdered,
  updateRemoteArtworkPreparation,
  updateRemoteOrderStatus,
  uploadRemoteImages,
  type OrderDetailsInput,
  type UploadFailure,
} from "../../../lib/supabase/orders-repository";
import type { DataSource } from "./shared";

const LOCAL_STORAGE_KEYS = ["mava-orders", "mava-orders-v2"];
const MAVA_SYNC_INTERVAL_MS = 60_000;

type RefreshOptions = {
  notifyOnError?: boolean;
  showLoading?: boolean;
};

function useOrdersWorkspaceState() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [folders, setFolders] = useState<ClientFolder[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const refreshPromise = useRef<Promise<boolean> | null>(null);
  const syncPromise = useRef<Promise<boolean> | null>(null);
  const lastSyncAt = useRef(0);
  const movingOrders = useRef(new Set<string>());

  async function moveOrder(orderId: string, folderId: string) {
    if (dataSource !== "supabase" || movingOrders.current.has(orderId)) return false;
    const order = orders.find((candidate) => candidate.id === orderId);
    const folder = folders.find((candidate) => candidate.id === folderId);
    const toStock = folderId === MAVA_STOCK_FOLDER_ID;
    if (!order || (!folder && !toStock)) return false;
    if (toStock && !isMavaStockOrder(order)) {
      sileo.warning({ title: "Esta carpeta es de MAVA STOCK", description: "Solo los pedidos importados de stock pueden volver a ella." });
      return false;
    }
    if (getOrderFolderId(order) === folderId) return true;
    movingOrders.current.add(orderId);
    try {
      await moveRemoteOrder(orderId, toStock ? null : folderId);
      setOrders((current) => current.map((candidate) => candidate.id === orderId ? {
        ...candidate,
        folderId: toStock ? undefined : folderId,
        folderName: toStock ? undefined : folder?.name,
      } : candidate));
      sileo.success({ title: "Pedido movido", description: `${order.code} ahora está en ${toStock ? "MAVA STOCK" : folder?.name}.` });
      return true;
    } catch {
      sileo.error({ title: "No se pudo mover el pedido", description: "El pedido sigue en su carpeta original. Intenta nuevamente." });
      return false;
    } finally {
      movingOrders.current.delete(orderId);
    }
  }

  const refreshWorkspace = useCallback(({
    notifyOnError = false,
    showLoading = false,
  }: RefreshOptions = {}) => {
    if (refreshPromise.current) return refreshPromise.current;

    const refresh = (async () => {
      if (showLoading) setDataSource("loading");

      if (!isSupabaseConfigured()) {
        setDataSource("error");
        if (notifyOnError) {
          sileo.error({
            title: "Supabase no está configurado",
            description: "Revisa las variables de entorno antes de continuar.",
          });
        }
        return false;
      }

      try {
        const workspace = await loadWorkspace();
        setFolders(workspace.folders);
        setOrders(workspace.orders);
        setDataSource("supabase");
        return true;
      } catch {
        setDataSource("error");
        if (notifyOnError) {
          sileo.error({
            title: "No se pudo conectar con Supabase",
            description: "No se guardó nada localmente. Revisa la conexión e intenta nuevamente.",
          });
        }
        return false;
      }
    })();

    refreshPromise.current = refresh;
    void refresh.finally(() => {
      if (refreshPromise.current === refresh) refreshPromise.current = null;
    });
    return refresh;
  }, []);

  const syncExternalOrders = useCallback(() => {
    if (syncPromise.current) return syncPromise.current;
    if (Date.now() - lastSyncAt.current < MAVA_SYNC_INTERVAL_MS) return Promise.resolve(false);

    lastSyncAt.current = Date.now();
    const sync = (async () => {
      try {
        const response = await fetch("/api/integrations/mava-stock/sync", {
          cache: "no-store",
          method: "POST",
        });
        if (!response.ok && response.status !== 207) return false;
        await refreshWorkspace();
        return true;
      } catch {
        // Los pedidos ya guardados siguen disponibles aunque falle el origen externo.
        return false;
      }
    })();

    syncPromise.current = sync;
    void sync.finally(() => {
      if (syncPromise.current === sync) syncPromise.current = null;
    });
    return sync;
  }, [refreshWorkspace]);

  useEffect(() => {
    for (const key of LOCAL_STORAGE_KEYS) window.localStorage.removeItem(key);
    void refreshWorkspace({ notifyOnError: true, showLoading: true })
      .then((loaded) => {
        if (loaded) void syncExternalOrders();
      });
  }, [refreshWorkspace, syncExternalOrders]);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        void refreshWorkspace().then(() => syncExternalOrders());
      }
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [refreshWorkspace, syncExternalOrders]);

  function upsertOrder(order: Order) {
    setOrders((currentOrders) => [
      order,
      ...currentOrders.filter((candidate) => candidate.id !== order.id),
    ]);
  }

  function addFolderFromOrder(order: Order) {
    setFolders((currentFolders) => currentFolders.some((folder) => folder.id === order.clientId)
      ? currentFolders
      : [...currentFolders, { id: order.clientId, name: order.clientName }]
        .sort((left, right) => left.name.localeCompare(right.name, "es")));
  }

  function prependImages(orderId: string, images: Order["images"]) {
    if (!images.length) return;
    setOrders((currentOrders) => currentOrders.map((order) => {
      if (order.id !== orderId) return order;
      const incomingIds = new Set(images.map((image) => image.id));
      return {
        ...order,
        images: [...images, ...order.images.filter((image) => !incomingIds.has(image.id))],
      };
    }));
  }

  async function createOrder(input: { clientName: string; locality: string; notes: string; canvasesOrdered: boolean; uploads: PendingImageUpload[] }) {
    if (dataSource !== "supabase") return null;
    const clientName = input.clientName.trim();
    if (!clientName) return null;

    let order: Order;
    try {
      order = await createRemoteOrder(clientName, input.notes, input.canvasesOrdered, input.locality);
      addFolderFromOrder(order);
      upsertOrder(order);
    } catch {
      sileo.error({
        title: "Error al crear el pedido",
        description: `No se pudo crear el pedido de ${clientName}. Intenta nuevamente.`,
      });
      return null;
    }

    if (!input.uploads.length) {
      sileo.success({
        title: "Pedido creado",
        description: `${order.code} se guardó correctamente en ${order.clientName}.`,
      });
      return order.id;
    }

    try {
      const upload = await uploadRemoteImages({
        clientId: order.clientId,
        orderId: order.id,
        uploads: input.uploads,
      });
      order = { ...order, images: upload.images };
      prependImages(order.id, upload.images);
      notifyCreatedOrderUpload(order, input.uploads.length, upload.failedFiles);
    } catch {
      sileo.warning({
        title: "Pedido creado sin imágenes",
        description: `${order.code} quedó guardado. Las imágenes no pudieron subirse y puedes intentarlo desde el pedido.`,
      });
    }

    return order.id;
  }

  async function updateStatus(id: string, status: OrderStatus) {
    if (dataSource !== "supabase") return;
    const previousOrder = orders.find((order) => order.id === id);
    if (!previousOrder) return;
    const completesOrder = status === "Terminado" || status === "Entregado";
    setOrders((currentOrders) => currentOrders.map((order) => (
      order.id === id ? {
        ...order,
        status,
        canvasesOrdered: completesOrder ? true : order.canvasesOrdered,
        images: completesOrder
          ? order.images.map((image) => ({ ...image, preparationStatus: "Listo" }))
          : order.images,
        items: completesOrder
          ? order.items?.map((item) => ({ ...item, preparationStatus: "Listo" }))
          : order.items,
      } : order
    )));

    try {
      await updateRemoteOrderStatus(id, status);
      if (completesOrder) {
        sileo.success({
          title: "Pedido completado",
          description: "Las telas quedaron pedidas y todos los cuadros se marcaron como listos.",
        });
      }
    } catch {
      setOrders((currentOrders) => currentOrders.map((order) => (
        order.id === id ? previousOrder : order
      )));
      sileo.error({
        title: "No se pudo cambiar el estado",
        description: "El pedido, las telas y los cuadros volvieron a su estado anterior.",
      });
    }
  }

  async function updateCanvasesOrdered(id: string, canvasesOrdered: boolean) {
    if (dataSource !== "supabase") return false;
    const previousValue = orders.find((order) => order.id === id)?.canvasesOrdered ?? false;
    setOrders((currentOrders) => currentOrders.map((order) => (
      order.id === id ? { ...order, canvasesOrdered } : order
    )));

    try {
      await updateRemoteCanvasesOrdered(id, canvasesOrdered);
      sileo.success({
        title: canvasesOrdered ? "Telas marcadas como pedidas" : "Telas marcadas como pendientes",
        description: canvasesOrdered
          ? "El pedido ya registra que las telas fueron solicitadas."
          : "El pedido volvió a indicar que las telas todavía no se pidieron.",
      });
      return true;
    } catch {
      setOrders((currentOrders) => currentOrders.map((order) => (
        order.id === id ? { ...order, canvasesOrdered: previousValue } : order
      )));
      sileo.error({
        title: "No se pudo actualizar el check",
        description: "El valor anterior se mantuvo. Intenta nuevamente.",
      });
      return false;
    }
  }

  async function updateArtworkPreparation(
    orderId: string,
    artworkKey: string,
    status: ArtworkPreparationStatus,
  ) {
    if (dataSource !== "supabase") return false;
    const targetOrder = orders.find((order) => order.id === orderId);
    const previousStatus = targetOrder?.images.find((image) => image.preparationKey === artworkKey)?.preparationStatus
      ?? targetOrder?.items?.find((item) => item.preparationKey === artworkKey)?.preparationStatus
      ?? "Pendiente";

    function applyStatus(currentOrders: Order[], nextStatus: ArtworkPreparationStatus) {
      return currentOrders.map((order) => order.id !== orderId ? order : ({
        ...order,
        images: order.images.map((image) => image.preparationKey === artworkKey
          ? { ...image, preparationStatus: nextStatus }
          : image),
        items: order.items?.map((item) => item.preparationKey === artworkKey
          ? { ...item, preparationStatus: nextStatus }
          : item),
      }));
    }

    setOrders((currentOrders) => applyStatus(currentOrders, status));
    try {
      await updateRemoteArtworkPreparation(orderId, artworkKey, status);
      sileo.success({
        title: "Preparación actualizada",
        description: `El cuadro quedó marcado como ${status.toLocaleLowerCase("es")}.`,
      });
      return true;
    } catch {
      setOrders((currentOrders) => applyStatus(currentOrders, previousStatus));
      sileo.error({
        title: "No se pudo cambiar la preparación",
        description: "El estado anterior se mantuvo. Intenta nuevamente.",
      });
      return false;
    }
  }

  async function updateOrderDetails(id: string, input: OrderDetailsInput) {
    if (dataSource !== "supabase") return false;
    try {
      const details = await updateRemoteOrderDetails(id, input);
      const nextOrders = orders.map((order) => (
        order.id === id ? { ...order, ...details } : order
      ));
      setOrders(nextOrders);
      setFolders(foldersFromOrders(nextOrders));
      sileo.success({
        title: "Pedido actualizado",
        description: "Los cambios se guardaron correctamente.",
      });
      return true;
    } catch {
      sileo.error({
        title: "No se pudo editar el pedido",
        description: "Revisa los datos e intenta nuevamente.",
      });
      return false;
    }
  }

  async function updateImageDescription(orderId: string, imageId: string, description: string) {
    if (dataSource !== "supabase") return null;
    try {
      const savedDescription = await updateRemoteImageDescription(imageId, description);
      setOrders((currentOrders) => currentOrders.map((order) => (
        order.id === orderId
          ? {
              ...order,
              images: order.images.map((image) => (
                image.id === imageId ? { ...image, description: savedDescription } : image
              )),
            }
          : order
      )));
      sileo.success({
        title: "Descripción actualizada",
        description: "La nota de la imagen se guardó correctamente.",
      });
      return savedDescription;
    } catch {
      sileo.error({
        title: "No se pudo guardar la descripción",
        description: "La nota anterior se mantuvo. Intenta nuevamente.",
      });
      return null;
    }
  }

  async function deleteOrder(id: string) {
    if (dataSource !== "supabase") return false;
    try {
      await deleteRemoteOrder(id);
      const remainingOrders = orders.filter((order) => order.id !== id);
      setOrders(remainingOrders);
      setFolders(foldersFromOrders(remainingOrders));
      sileo.success({
        title: "Pedido eliminado",
        description: "El pedido y sus imágenes dejaron de aparecer en la aplicación.",
      });
      return true;
    } catch {
      sileo.error({
        title: "No se pudo eliminar el pedido",
        description: "Nada cambió. Intenta nuevamente.",
      });
      return false;
    }
  }

  async function uploadImagesToFolder(clientId: string, uploads: PendingImageUpload[], requestedOrderId?: string) {
    if (dataSource !== "supabase" || !uploads.length) return false;
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
          && (order.clientId === clientId || getOrderFolderId(order) === clientId)
          && isOrderActive(order.status)
        ))
      : findLatestPendingOrder(orders, clientId);
    if (!targetOrder) {
      sileo.warning({
        title: "No hay pedidos activos",
        description: `${folder.name} no tiene ningún pedido pendiente o en producción. Crea un pedido nuevo antes de agregar imágenes.`,
      });
      return false;
    }

    try {
      const upload = await uploadRemoteImages({
        clientId: targetOrder.clientId,
        orderId: targetOrder.id,
        uploads,
      });
      if (upload.images.length) {
        prependImages(targetOrder.id, upload.images);
      }
      notifyExistingOrderUpload(folder.name, uploads.length, upload.images.length, upload.failedFiles);
      return upload.images.length > 0;
    } catch {
      sileo.error({
        title: "Error al subir las imágenes",
        description: `No se pudo agregar ninguna imagen al pedido de ${folder.name}. Intenta nuevamente.`,
      });
      return false;
    }
  }

  async function createPendingOrderWithImages(clientId: string, uploads: PendingImageUpload[]) {
    if (dataSource !== "supabase" || !uploads.length) return false;
    const folder = folders.find((candidate) => candidate.id === clientId);
    if (!folder) return false;

    let order: Order;
    try {
      order = await createRemoteOrder(folder.name, "");
      upsertOrder(order);
    } catch {
      sileo.error({
        title: "Error al crear el pedido",
        description: `No se pudo crear el pedido de ${folder.name}. Intenta nuevamente.`,
      });
      return false;
    }

    try {
      const upload = await uploadRemoteImages({
        clientId: folder.id,
        orderId: order.id,
        uploads,
      });
      order = { ...order, images: upload.images };
      prependImages(order.id, upload.images);
      notifyCreatedOrderUpload(order, uploads.length, upload.failedFiles);
    } catch {
      sileo.warning({
        title: "Pedido creado sin imágenes",
        description: `${order.code} quedó guardado. Puedes reintentar la subida desde el pedido.`,
      });
    }

    return true;
  }

  return {
    orders,
    folders,
    dataSource,
    retryConnection: () => refreshWorkspace({ notifyOnError: true, showLoading: true }),
    refreshOrders: refreshWorkspace,
    createOrder,
    moveOrder,
    updateStatus,
    updateCanvasesOrdered,
    updateArtworkPreparation,
    updateOrderDetails,
    updateImageDescription,
    deleteOrder,
    uploadImagesToFolder,
    createPendingOrderWithImages,
  };
}

function notifyCreatedOrderUpload(order: Order, totalFiles: number, failedFiles: UploadFailure[]) {
  const uploadedCount = totalFiles - failedFiles.length;
  if (!failedFiles.length) {
    sileo.success({
      title: "Pedido creado",
      description: `${order.code} se guardó con ${uploadedCount} imagen${uploadedCount === 1 ? "" : "es"}.`,
    });
    return;
  }

  sileo.warning({
    title: uploadedCount ? "Pedido creado parcialmente" : "Pedido creado sin imágenes",
    description: `${order.code} quedó guardado. ${uploadSummary(uploadedCount, totalFiles, failedFiles)}`,
  });
}

function notifyExistingOrderUpload(
  folderName: string,
  totalFiles: number,
  uploadedCount: number,
  failedFiles: UploadFailure[],
) {
  if (!failedFiles.length) {
    sileo.success({
      title: uploadedCount === 1 ? "Nueva imagen agregada" : "Nuevas imágenes agregadas",
      description: uploadedCount === 1
        ? `Se agregó una nueva imagen al pedido activo de ${folderName}.`
        : `Se agregaron ${uploadedCount} imágenes al pedido activo de ${folderName}.`,
    });
    return;
  }

  const notify = uploadedCount ? sileo.warning : sileo.error;
  notify({
    title: uploadedCount ? "Subida completada parcialmente" : "No se subieron las imágenes",
    description: uploadSummary(uploadedCount, totalFiles, failedFiles),
  });
}

function uploadSummary(uploadedCount: number, totalFiles: number, failedFiles: UploadFailure[]) {
  const visibleNames = failedFiles.slice(0, 3).map((file) => file.fileName).join(", ");
  const remaining = failedFiles.length - 3;
  const failedNames = remaining > 0 ? `${visibleNames} y ${remaining} más` : visibleNames;
  return `Se subieron ${uploadedCount} de ${totalFiles}. Fallaron: ${failedNames}.`;
}

export type OrdersWorkspace = ReturnType<typeof useOrdersWorkspaceState>;

const OrdersWorkspaceContext = createContext<OrdersWorkspace | null>(null);

export function OrdersWorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useOrdersWorkspaceState();
  return createElement(OrdersWorkspaceContext.Provider, { value: workspace }, children);
}

export function useOrdersWorkspace() {
  const workspace = useContext(OrdersWorkspaceContext);
  if (!workspace) throw new Error("useOrdersWorkspace debe usarse dentro de OrdersWorkspaceProvider.");
  return workspace;
}

function foldersFromOrders(orders: Order[]) {
  const folders = orders.flatMap((order) => [
    { id: order.clientId, name: order.clientName },
    ...(order.folderId && order.folderName ? [{ id: order.folderId, name: order.folderName }] : []),
  ]);
  return [...new Map(folders.map((folder) => [folder.id, folder])).values()]
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}
