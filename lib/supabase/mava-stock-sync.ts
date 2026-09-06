import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { OrderItem } from "../orders";
import {
  notifyNewOrdersOnce,
  type NewOrderNotification,
} from "../push-notifications";

const SOURCE_SYSTEM = "MAVA STOCK";

type SourceOrder = {
  id: string;
  customer_name: string | null;
  whatsapp: string | null;
  business_name: string | null;
  items: unknown;
  status: string | null;
  total: number | null;
  created_at: string;
  observations: string | null;
};

type CatalogProduct = {
  code: string;
  storage_path: string | null;
};

export type MavaStockSyncResult = {
  fetched: number;
  synced: number;
  failed: number;
  notified: number;
};

export async function syncMavaStockOrders(): Promise<MavaStockSyncResult> {
  const sourceUrl = process.env.OTHER_SUPABASE_URL;
  const sourceKey = process.env.OTHER_SUPABASE_SECRET_KEY
    ?? process.env.OTHER_SUPABASE_SERVICE_ROLE_KEY;
  const targetUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const targetKey = process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
    throw new Error("Faltan credenciales privadas para sincronizar MAVA STOCK.");
  }

  const clientOptions = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  } as const;
  const source = createClient(sourceUrl, sourceKey, clientOptions);
  const target = createClient(targetUrl, targetKey, clientOptions);
  const [ordersResult, catalogResult] = await Promise.all([
    source
      .from("orders")
      .select("id, customer_name, whatsapp, business_name, items, status, total, created_at, observations")
      .order("created_at", { ascending: true }),
    source
      .from("catalog_products")
      .select("code, storage_path"),
  ]);

  if (ordersResult.error) throw ordersResult.error;
  if (catalogResult.error) throw catalogResult.error;

  const sourceOrders = (ordersResult.data ?? []) as SourceOrder[];
  const imageUrlsByCode = new Map<string, string>(
    ((catalogResult.data ?? []) as CatalogProduct[])
      .filter((product) => product.code && product.storage_path)
      .map((product) => [
        normalizeProductCode(product.code),
        source.storage.from("sources").getPublicUrl(product.storage_path!).data.publicUrl,
      ]),
  );
  const requestedCodes = new Set(
    sourceOrders.flatMap((order) => parseItems(order.items).map((item) => normalizeProductCode(item.code))),
  );
  const missingFolders = new Set(
    [...requestedCodes]
      .filter((code) => !imageUrlsByCode.has(code))
      .map((code) => storageFolderForCode(code))
      .filter(Boolean),
  );
  const legacyListings = await Promise.all(
    [...missingFolders].map(async (folder) => ({
      folder,
      result: await source.storage.from("sources").list(`images/${folder}`, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      }),
    })),
  );

  for (const { folder, result } of legacyListings) {
    if (result.error) continue;
    for (const object of result.data) {
      if (!object.id) continue;
      const code = normalizeProductCode(object.name.replace(/\.[^.]+$/, ""));
      if (!requestedCodes.has(code) || imageUrlsByCode.has(code)) continue;
      const storagePath = `images/${folder}/${object.name}`;
      imageUrlsByCode.set(
        code,
        source.storage.from("sources").getPublicUrl(storagePath).data.publicUrl,
      );
    }
  }
  const importedOrders: NewOrderNotification[] = [];
  let synced = 0;
  let failed = 0;

  for (let offset = 0; offset < sourceOrders.length; offset += 5) {
    const batch = sourceOrders.slice(offset, offset + 5);
    const results = await Promise.all(batch.map(async (order) => {
      const clientName = order.business_name?.trim() || order.customer_name?.trim();
      if (!clientName) return null;

      const items = normalizeItems(order.items, imageUrlsByCode);
      const result = await target.rpc("import_external_order", {
        requested_source_system: SOURCE_SYSTEM,
        requested_source_order_id: order.id,
        requested_client_name: clientName,
        requested_contact_name: order.customer_name?.trim() || null,
        requested_whatsapp: order.whatsapp?.trim() || null,
        requested_items: items,
        requested_source_status: order.status?.trim() || "",
        requested_status: mapSourceStatus(order.status),
        requested_total: order.total,
        requested_created_at: order.created_at,
        requested_notes: order.observations?.trim() || "",
      });

      if (result.error) return null;
      const imported = normalizeImportedOrder(result.data);
      return {
        id: imported.id,
        code: imported.code,
        clientName: imported.client_name,
        itemCount: items.length,
        sourceSystem: SOURCE_SYSTEM,
      } satisfies NewOrderNotification;
    }));

    for (const result of results) {
      if (result) {
        importedOrders.push(result);
        synced += 1;
      } else {
        failed += 1;
      }
    }
  }

  const notified = await notifyNewOrdersOnce(importedOrders);
  return { fetched: sourceOrders.length, synced, failed, notified };
}

function normalizeImportedOrder(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new Error("INVALID_IMPORTED_ORDER");
  const imported = row as { id?: unknown; code?: unknown; client_name?: unknown };
  if (
    typeof imported.id !== "string"
    || typeof imported.code !== "string"
    || typeof imported.client_name !== "string"
  ) {
    throw new Error("INVALID_IMPORTED_ORDER");
  }
  return { id: imported.id, code: imported.code, client_name: imported.client_name };
}

function normalizeItems(value: unknown, imageUrlsByCode: Map<string, string>): OrderItem[] {
  return parseItems(value).map((item) => ({
    ...item,
    imageUrl: imageUrlsByCode.get(normalizeProductCode(item.code)),
  }));
}

function parseItems(value: unknown): OrderItem[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((item): item is OrderItem => Boolean(
      item
      && typeof item === "object"
      && typeof (item as Partial<OrderItem>).id === "string"
      && typeof (item as Partial<OrderItem>).code === "string"
      && typeof (item as Partial<OrderItem>).name === "string"
      && typeof (item as Partial<OrderItem>).size === "string"
      && typeof (item as Partial<OrderItem>).price === "number"
    ));
}

function normalizeProductCode(value: string) {
  return value.trim().toLocaleUpperCase("es");
}

function storageFolderForCode(code: string) {
  const prefix = code.split("-")[0];
  return prefix === "TEXTURADO" ? "TEXTURADOS" : prefix;
}

function mapSourceStatus(value: string | null) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[\s-]+/g, "_");

  if (["en_produccion", "produccion", "procesando"].includes(normalized)) return "in_production";
  if (["terminado", "finalizado", "listo"].includes(normalized)) return "finished";
  if (["entregado", "completado"].includes(normalized)) return "delivered";
  return "pending";
}
