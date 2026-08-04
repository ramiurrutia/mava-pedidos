import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyNewOrdersOnce } from "../../../../../lib/push-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrderRow = {
  id: string;
  code: string;
  client_name: string;
  source_system: string | null;
  items: unknown;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const { data, error } = await createAdminClient()
      .from("orders")
      .select("id, code, client_name, source_system, items")
      .eq("id", orderId)
      .is("deleted_at", null)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
    }

    const order = data as OrderRow;
    const notified = await notifyNewOrdersOnce([{
      id: order.id,
      code: order.code,
      clientName: order.client_name,
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
      sourceSystem: order.source_system ?? undefined,
    }]);
    return NextResponse.json({ notified });
  } catch {
    return NextResponse.json({ error: "No se pudo enviar la notificación." }, { status: 500 });
  }
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
