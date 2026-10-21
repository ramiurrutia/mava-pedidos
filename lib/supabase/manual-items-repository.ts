import { createClient } from "./client";
import type { ManualItemDetails, ManualOrderItem } from "../orders";

type ManualItemRow = {
  id: string; order_id: string; title: string; description: string; quantity: number;
  status: "pending" | "ready"; created_at: string;
};
const missingMigration = "Falta aplicar la migración 20261021_order_manual_items.sql en Supabase.";
const missingSchema = (code?: string) => ["PGRST202", "PGRST205", "42P01", "42883"].includes(code ?? "");
const fromRow = (row: ManualItemRow): ManualOrderItem => ({
  id: row.id, title: row.title, description: row.description, quantity: row.quantity,
  preparationStatus: row.status === "ready" ? "Listo" : "Pendiente", addedAt: row.created_at,
});

export async function loadManualItems(): Promise<Map<string, ManualOrderItem[]>> {
  const { data, error } = await createClient().from("order_manual_items").select("*").is("deleted_at", null).order("created_at", { ascending: false }).order("id");
  // Existing orders remain usable while the database migration is being applied.
  if (error && !missingSchema(error.code)) throw error;
  const result = new Map<string, ManualOrderItem[]>();
  for (const row of (data ?? []) as ManualItemRow[]) result.set(row.order_id, [...result.get(row.order_id) ?? [], fromRow(row)]);
  return result;
}

export async function mutateManualItem(orderId: string, itemId: string, action: "create" | "update" | "delete" | "status", details?: ManualItemDetails, ready = false): Promise<ManualOrderItem> {
  const { data, error } = await createClient().rpc("mutate_order_manual_item", {
    requested_order_id: orderId, requested_item_id: itemId, requested_action: action,
    requested_title: details?.title ?? "", requested_description: details?.description ?? "",
    requested_quantity: details?.quantity ?? 1, requested_status: ready ? "ready" : "pending",
  });
  if (error) {
    if (missingSchema(error.code)) throw new Error(missingMigration);
    if (error.message?.includes("ORDER_ARCHIVED")) throw new Error("Desarchivá el pedido antes de agregar o editar ítems.");
    throw new Error("No se pudo guardar el ítem. Revisá la conexión e intentá nuevamente.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("El ítem ya no está disponible.");
  return fromRow(row as ManualItemRow);
}
