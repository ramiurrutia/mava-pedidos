import { NextResponse } from "next/server";
import { syncMavaStockOrders } from "../../../../../lib/supabase/mava-stock-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncMavaStockOrders();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
      status: result.failed ? 207 : 200,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo sincronizar MAVA STOCK." },
      { headers: { "Cache-Control": "no-store" }, status: 500 },
    );
  }
}
