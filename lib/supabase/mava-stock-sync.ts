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
  const { data, error } = await source
    .from("orders")
    .select("id, customer_name, whatsapp, business_name, items, status, total, created_at, observations")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const sourceOrders = (data ?? []) as SourceOrder[];
  const importedOrders: NewOrderNotification[] = [];
  let synced = 0;
  let failed = 0;

  for (const order of sourceOrders) {
    const clientName = order.business_name?.trim() || order.customer_name?.trim();
    if (!clientName) {
      failed += 1;
      continue;
    }

    const result = await target.rpc("import_external_order", {
      requested_source_system: SOURCE_SYSTEM,
      requested_source_order_id: order.id,
      requested_client_name: clientName,
      requested_contact_name: order.customer_name?.trim() || null,
      requested_whatsapp: order.whatsapp?.trim() || null,
      requested_items: normalizeItems(order.items),
      requested_source_status: order.status?.trim() || "",
      requested_status: mapSourceStatus(order.status),
      requested_total: order.total,
      requested_created_at: order.created_at,
      requested_notes: order.observations?.trim() || "",
    });

    if (result.error) {
      failed += 1;
    } else {
      const imported = normalizeImportedOrder(result.data);
      importedOrders.push({
        id: imported.id,
        code: imported.code,
        clientName: imported.client_name,
        itemCount: normalizeItems(order.items).length,
        sourceSystem: SOURCE_SYSTEM,
      });
      synced += 1;
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

function normalizeItems(value: unknown): OrderItem[] {
  if (Array.isArray(value)) return value as OrderItem[];
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as OrderItem[] : [];
  } catch {
    return [];
  }
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
