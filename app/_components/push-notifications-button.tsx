"use client";

import { useEffect, useState } from "react";
import { sileo } from "sileo";
import { BellIcon, BellOffIcon, SpinnerIcon } from "./icons";

type PushState =
  | "checking"
  | "available"
  | "subscribed"
  | "denied"
  | "unsupported"
  | "insecure"
  | "needs-install"
  | "development"
  | "misconfigured"
  | "saving";

export function PushNotificationsButton() {
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    const unavailableState = detectUnavailableState();
    if (unavailableState) {
      const frame = window.requestAnimationFrame(() => setState(unavailableState));
      return () => window.cancelAnimationFrame(frame);
    }

    let cancelled = false;
    void getPushRegistration()
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (subscription) {
          await saveSubscription(subscription).catch(() => undefined);
          setState("subscribed");
        } else {
          setState(Notification.permission === "denied" ? "denied" : "available");
        }
      })
      .catch(() => {
        if (!cancelled) setState("available");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleNotifications() {
    if (state === "checking" || state === "saving") return;
    if (isUnavailableState(state)) {
      explainUnavailableState(state);
      return;
    }

    setState("saving");
    try {
      if (state === "subscribed") {
        const registration = await getPushRegistration();
        const current = await registration.pushManager.getSubscription();
        if (!current) {
          setState("available");
          return;
        }
        await removeSubscription(current.endpoint);
        await current.unsubscribe();
        setState("available");
        sileo.success({
          title: "Notificaciones desactivadas",
          description: "Este dispositivo dejará de recibir avisos de pedidos nuevos.",
        });
        return;
      }

      // En iOS debe invocarse directamente desde el gesto, antes de otros awaits.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "available");
        if (permission === "denied") explainUnavailableState("denied");
        return;
      }

      const publicKey = await loadPublicVapidKey();
      if (!publicKey) {
        setState("misconfigured");
        explainUnavailableState("misconfigured");
        return;
      }

      const registration = await getPushRegistration();
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
    } catch (error) {
      setState("available");
      sileo.error({
        title: "No se pudieron activar",
        description: pushErrorMessage(error),
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
      {state === "checking" || state === "saving"
        ? <SpinnerIcon className="animate-spin" />
        : isUnavailableState(state) ? <BellOffIcon /> : <BellIcon />}
      <span className="max-[680px]:sr-only">{enabled ? "Activadas" : "Notificaciones"}</span>
    </button>
  );
}

function supportsPush() {
  return "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function detectUnavailableState(): PushState | null {
  if (process.env.NODE_ENV !== "production") return "development";
  if (!window.isSecureContext) return "insecure";
  if (isIosDevice() && !isStandalone()) return "needs-install";
  if (!supportsPush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return null;
}

function isUnavailableState(state: PushState) {
  return ["denied", "unsupported", "insecure", "needs-install", "development", "misconfigured"].includes(state);
}

function explainUnavailableState(state: PushState) {
  const messages: Partial<Record<PushState, { title: string; description: string }>> = {
    denied: {
      title: "Notificaciones bloqueadas",
      description: "Habilítalas desde Ajustes > Notificaciones o desde los permisos del navegador.",
    },
    unsupported: {
      title: "Navegador no compatible",
      description: "Actualiza el navegador o instala la aplicación para recibir notificaciones.",
    },
    insecure: {
      title: "Se necesita una conexión segura",
      description: "Abre la aplicación desde su dirección HTTPS; no funciona mediante una IP local HTTP.",
    },
    "needs-install": {
      title: "Instala MAVA en el iPhone",
      description: "En Safari toca Compartir > Agregar a inicio. Luego abre MAVA desde el icono y activa la campana.",
    },
    development: {
      title: "Disponible en producción",
      description: "Las notificaciones se activan desde la versión publicada con HTTPS.",
    },
    misconfigured: {
      title: "Falta configurar el servidor",
      description: "Las claves de notificaciones todavía no están disponibles en esta publicación.",
    },
  };
  const message = messages[state];
  if (message) sileo.warning(message);
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

async function getPushRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }
  return withTimeout(navigator.serviceWorker.ready, 10000);
}

async function loadPublicVapidKey() {
  const response = await fetch("/api/push/subscriptions", { cache: "no-store" });
  if (!response.ok) throw new Error("PUSH_CONFIGURATION_FAILED");
  const body = await response.json() as { configured?: boolean; publicKey?: string | null };
  return body.configured && typeof body.publicKey === "string" ? body.publicKey : null;
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("SERVICE_WORKER_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

function pushErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "SERVICE_WORKER_TIMEOUT") {
    return "La aplicación no pudo preparar las notificaciones. Ciérrala, vuelve a abrirla e intenta nuevamente.";
  }
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return "Instala o vuelve a abrir la PWA antes de activar las notificaciones.";
  }
  return "Revisa los permisos y la conexión del dispositivo e intenta nuevamente.";
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
