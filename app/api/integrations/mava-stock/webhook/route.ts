import { NextResponse } from "next/server";
import { syncMavaStockOrders } from "../../../../../lib/supabase/mava-stock-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const expectedSecret = process.env.MAVA_SYNC_SECRET;
  const receivedSecret = request.headers.get("x-mava-sync-secret");
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await syncMavaStockOrders();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
      status: result.failed ? 207 : 200,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar el pedido de MAVA STOCK." },
      { headers: { "Cache-Control": "no-store" }, status: 500 },
    );
  }
}
