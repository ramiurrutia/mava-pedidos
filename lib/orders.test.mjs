import assert from "node:assert/strict";
import { test } from "node:test";
import { findLatestPendingOrder, getOrderFolderId, getOrderArtworkProgress, isOrderActive } from "./orders.ts";

test("las subidas buscan pedidos pendientes aunque exista uno archivado más reciente", () => {
  const orders = [
    { id: "older", status: "Pendiente", clientId: "client", createdAt: "2026-10-01" },
    { id: "archived", status: "Archivado", clientId: "client", createdAt: "2026-10-08" },
    { id: "latest", status: "Pendiente", clientId: "client", createdAt: "2026-10-06" },
  ];
  assert.equal(findLatestPendingOrder(orders, "client").id, "latest");
  assert.equal(findLatestPendingOrder([orders[1]], "client"), undefined);
  assert.equal(isOrderActive("Archivado"), false);
});

test("archivar no cambia la carpeta original ni el progreso de las imágenes", () => {
  const order = {
    clientId: "client", folderId: "original-folder", status: "Pendiente", canvasesOrdered: false,
    images: [{ preparationStatus: "Pendiente" }, { preparationStatus: "Listo" }],
  };
  const archived = { ...order, status: "Archivado" };
  assert.equal(getOrderFolderId(archived), "original-folder");
  assert.deepEqual(getOrderArtworkProgress(archived), getOrderArtworkProgress(order));
  assert.equal(archived.canvasesOrdered, false);
  assert.equal(findLatestPendingOrder([archived], "original-folder"), undefined);
  assert.equal(findLatestPendingOrder([{ ...archived, status: "Pendiente" }], "original-folder").folderId, "original-folder");
});

test("el progreso incluye las cantidades de los ítems sin foto junto a imágenes y stock", () => {
  const order = { images: [{ preparationStatus: "Listo" }], items: [{ preparationStatus: "Pendiente" }],
    manualItems: [{ quantity: 2, preparationStatus: "Listo" }, { quantity: 3, preparationStatus: "Pendiente" }],
  };
  assert.deepEqual(getOrderArtworkProgress(order), { ready: 3, total: 7, percentage: 43 });
  const ready = { ...order, images: [], items: [], manualItems: [{ quantity: 4, preparationStatus: "Listo" }] };
  assert.deepEqual(getOrderArtworkProgress(ready), { ready: 4, total: 4, percentage: 100 });
  assert.deepEqual(getOrderArtworkProgress({ images: [] }), { ready: 0, total: 0, percentage: 0 });
  assert.deepEqual(getOrderArtworkProgress({ ...order, manualItems: [] }), { ready: 1, total: 2, percentage: 50 });
});
