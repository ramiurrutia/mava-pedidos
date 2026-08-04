"use client";

import { useEffect, useState } from "react";
import { sileo } from "sileo";
import { BellIcon, BellOffIcon } from "./icons";

type PushState = "checking" | "available" | "subscribed" | "denied" | "unsupported" | "saving";

export function PushNotificationsButton() {
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    if (!supportsPush() || process.env.NODE_ENV !== "production") {
      const frame = window.requestAnimationFrame(() => setState("unsupported"));
      return () => window.cancelAnimationFrame(frame);
    }

    let cancelled = false;
    void navigator.serviceWorker.ready.then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      if (cancelled) return;

      if (subscription) {
        await saveSubscription(subscription).catch(() => undefined);
        setState("subscribed");
      } else {
        setState(Notification.permission === "denied" ? "denied" : "available");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unsupported") return null;

  async function toggleNotifications() {
    if (state === "checking" || state === "saving") return;
    if (state === "denied") {
      sileo.warning({
        title: "Notificaciones bloqueadas",
        description: "Habilítalas desde los permisos del navegador o de la aplicación.",
      });
      return;
    }

    setState("saving");
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();

      if (current) {
        await removeSubscription(current.endpoint);
        await current.unsubscribe();
        setState("available");
        sileo.success({
          title: "Notificaciones desactivadas",
          description: "Este dispositivo dejará de recibir avisos de pedidos nuevos.",
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "available");
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("VAPID_NOT_CONFIGURED");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await saveSubscription(subscription);
      setState("subscribed");
      sileo.success({
        title: "Notificaciones activadas",
        description: "Te avisaremos cuando llegue cualquier pedido nuevo.",
      });
    } catch {
      setState("available");
      sileo.error({
        title: "No se pudieron activar",
        description: "Revisa los permisos del dispositivo e intenta nuevamente.",
      });
    }
  }

  const enabled = state === "subscribed";
  return (
    <button
      aria-label={enabled ? "Desactivar notificaciones" : "Activar notificaciones"}
      className={`${enabled ? "border-[#b9d2c2] bg-[#edf5f0] text-[#235c4c]" : "border-[#dfe3df] bg-white text-[#68726d]"} inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors hover:bg-[#f3f6f3] disabled:cursor-wait disabled:opacity-60 [&_svg]:size-4`}
      disabled={state === "checking" || state === "saving"}
      onClick={() => void toggleNotifications()}
      title={enabled ? "Notificaciones activadas" : "Activar notificaciones"}
      type="button"
    >
      {state === "denied" ? <BellOffIcon /> : <BellIcon />}
      <span className="max-[680px]:sr-only">{enabled ? "Activadas" : "Notificaciones"}</span>
    </button>
  );
}

function supportsPush() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscriptions", {
    body: JSON.stringify(subscription.toJSON()),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("PUSH_SUBSCRIPTION_FAILED");
}

async function removeSubscription(endpoint: string) {
  const response = await fetch("/api/push/subscriptions", {
    body: JSON.stringify({ endpoint }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });
  if (!response.ok) throw new Error("PUSH_UNSUBSCRIBE_FAILED");
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
