import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SubscriptionBody = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return NextResponse.json(
    { configured: Boolean(publicKey), publicKey: publicKey ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as SubscriptionBody;
    if (!isValidSubscription(body)) return invalidSubscription();

    const { error } = await createAdminClient()
      .from("push_subscriptions")
      .upsert({
        endpoint: body.endpoint,
        expiration_time: typeof body.expirationTime === "number" ? body.expirationTime : null,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: request.headers.get("user-agent"),
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });

    if (error) throw error;
    return NextResponse.json({ subscribed: true });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la suscripción." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string" || !isValidEndpoint(body.endpoint)) {
      return invalidSubscription();
    }

    const { error } = await createAdminClient()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.endpoint);

    if (error) throw error;
    return NextResponse.json({ subscribed: false });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar la suscripción." }, { status: 500 });
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

function isValidSubscription(body: SubscriptionBody): body is {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
} {
  return typeof body.endpoint === "string"
    && isValidEndpoint(body.endpoint)
    && typeof body.keys?.p256dh === "string"
    && body.keys.p256dh.length <= 512
    && typeof body.keys.auth === "string"
    && body.keys.auth.length <= 256
    && (body.expirationTime === null || body.expirationTime === undefined || typeof body.expirationTime === "number");
}

function isValidEndpoint(endpoint: string) {
  if (endpoint.length > 2048) return false;
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

function invalidSubscription() {
  return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
}
