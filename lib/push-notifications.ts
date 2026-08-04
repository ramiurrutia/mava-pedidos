import "server-only";

import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

export type NewOrderNotification = {
  id: string;
  code: string;
  clientName: string;
  itemCount: number;
  sourceSystem?: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  expiration_time: number | null;
  p256dh: string;
  auth: string;
};

export async function notifyNewOrdersOnce(orders: NewOrderNotification[]) {
  if (!orders.length) return 0;

  const supabase = createAdminClient();
  const uniqueOrders = [...new Map(orders.map((order) => [order.id, order])).values()];
  const { error: queueError } = await supabase
    .from("push_notification_events")
    .upsert(
      uniqueOrders.map((order) => ({ order_id: order.id })),
      { ignoreDuplicates: true, onConflict: "order_id" },
    );
  if (queueError) throw queueError;

  const { data: claimed, error: claimError } = await supabase.rpc("claim_pending_order_notifications", {
    requested_order_ids: uniqueOrders.map((order) => order.id),
  });
  if (claimError) throw claimError;

  const claimedIds = new Set(
    ((claimed ?? []) as Array<{ order_id: string }>).map((row) => row.order_id),
  );
  const claimedOrders = uniqueOrders.filter((order) => claimedIds.has(order.id));
  if (!claimedOrders.length) return 0;

  await sendNewOrderNotifications(claimedOrders, supabase);
  const { error: completedError } = await supabase
    .from("push_notification_events")
    .update({ sent_at: new Date().toISOString() })
    .in("order_id", claimedOrders.map((order) => order.id));
  if (completedError) throw completedError;

  return claimedOrders.length;
}

async function sendNewOrderNotifications(
  orders: NewOrderNotification[],
  supabase: ReturnType<typeof createAdminClient>,
) {
  if (!orders.length) return { devices: 0, sent: 0 };

  configureWebPush();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, expiration_time, p256dh, auth");
  if (error) throw error;

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  const expiredEndpoints = new Set<string>();
  let sent = 0;

  await Promise.all(orders.flatMap((order) => subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expiration_time,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: "Nuevo pedido",
        body: notificationBody(order),
        tag: `mava-order-${order.id}`,
        url: `/pedidos/${encodeURIComponent(order.id)}`,
      }), {
        TTL: 60 * 60 * 24,
        urgency: "high",
      });
      sent += 1;
    } catch (pushError) {
      const statusCode = typeof pushError === "object" && pushError !== null && "statusCode" in pushError
        ? Number(pushError.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) expiredEndpoints.add(subscription.endpoint);
    }
  })));

  if (expiredEndpoints.size) {
    await supabase.from("push_subscriptions").delete().in("endpoint", [...expiredEndpoints]);
  }

  return { devices: subscriptions.length, sent };
}

function notificationBody(order: NewOrderNotification) {
  const parts = [order.clientName, order.sourceSystem, order.code].filter(Boolean);
  if (order.itemCount > 0) {
    parts.push(`${order.itemCount} artículo${order.itemCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) throw new Error("VAPID_NOT_CONFIGURED");
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
