"use client";

import type { ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxIcon,
  FolderIcon,
  GridIcon,
  PlusIcon,
  UploadIcon,
} from "../icons";
import { ui, type WorkspaceView } from "./shared";
import { PushNotificationsButton } from "../push-notifications-button";

const navigation = [
  { label: "Inicio", view: "resumen", icon: GridIcon },
  { label: "Pedidos", view: "pedidos", icon: BoxIcon },
  { label: "Carpetas", view: "carpetas", icon: FolderIcon },
] satisfies Array<{ label: string; view: WorkspaceView; icon: typeof GridIcon }>;

const navigationMemoryKey = "mava-last-navigation-routes";
const defaultRoutes: Record<WorkspaceView, string> = {
  resumen: "/",
  pedidos: "/pedidos",
  carpetas: "/carpetas",
};
let navigationSnapshot = defaultRoutes;
let navigationMemoryLoaded = false;
const navigationListeners = new Set<() => void>();

export type NavigationMemoryAction = "remember" | "ignore" | "reset";

export function AppShell({
  activeView,
  children,
  memoryAction = "remember",
}: {
  activeView: WorkspaceView;
  children: ReactNode;
  memoryAction?: NavigationMemoryAction;
}) {
  const isHome = activeView === "resumen";
  const pathname = usePathname();
  const rememberedRoutes = useSyncExternalStore(
    subscribeToNavigationMemory,
    getNavigationSnapshot,
    getServerNavigationSnapshot,
  );

  useEffect(() => {
    updateNavigationMemory(activeView, pathname, memoryAction);
  }, [activeView, memoryAction, pathname]);

  return (
    <div className={`${ui.appShell} ${isHome ? "h-dvh overflow-hidden [@media(max-height:650px)]:h-auto [@media(max-height:650px)]:min-h-dvh [@media(max-height:650px)]:overflow-visible" : ""}`}>
      <header className={ui.sidebar}>
        <Link className={ui.brand} href="/" aria-label="Ir al inicio">
          <div className={ui.brandMark}>M</div>
          <div className={ui.brandCopy}><strong>MAVA</strong><span>Pedidos</span></div>
        </Link>
        <div className={ui.sidebarFoot}>
          <PushNotificationsButton />
          <Link className={ui.secondaryButton} href="/subir">
            <UploadIcon /><span className="max-[560px]:sr-only">Subir imágenes</span>
          </Link>
          <Link className={ui.primaryButton} href="/pedidos/nuevo">
            <PlusIcon /><span className="max-[440px]:sr-only">Nuevo pedido</span>
          </Link>
        </div>
      </header>

      <nav className={ui.nav} aria-label="Navegación principal">
        {navigation.map(({ label, view, icon: Icon }) => (
          <Link
            aria-current={activeView === view ? "page" : undefined}
            className={`${ui.navItem} ${activeView === view ? ui.navActive : ""}`}
            href={rememberedRoutes[view]}
            key={label}
          >
            <Icon /><span>{label}</span>
          </Link>
        ))}
      </nav>

      <main className={`${ui.main} ${isHome ? "h-[calc(100dvh-68px)] overflow-hidden pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 max-[600px]:pt-4 [@media(max-height:650px)]:h-auto [@media(max-height:650px)]:overflow-visible" : ""}`}>{children}</main>
    </div>
  );
}

function isRestorableRoute(view: WorkspaceView, route: string) {
  if (!route.startsWith("/") || route.includes("//")) return false;
  if (view === "resumen") return route === "/";
  if (view === "carpetas") return route === "/carpetas" || /^\/carpetas\/[^/]+$/.test(route);
  return route === "/pedidos" || (/^\/pedidos\/[^/]+$/.test(route) && route !== "/pedidos/nuevo" && route !== "/pedidos/importar");
}

function subscribeToNavigationMemory(listener: () => void) {
  navigationListeners.add(listener);
  return () => navigationListeners.delete(listener);
}

function getNavigationSnapshot() {
  return navigationSnapshot;
}

function getServerNavigationSnapshot() {
  return defaultRoutes;
}

function updateNavigationMemory(activeView: WorkspaceView, pathname: string, action: NavigationMemoryAction) {
  const nextRoutes = navigationMemoryLoaded ? { ...navigationSnapshot } : readStoredRoutes();
  navigationMemoryLoaded = true;
  if (action === "reset") nextRoutes[activeView] = defaultRoutes[activeView];
  else if (action === "remember" && isRestorableRoute(activeView, pathname)) nextRoutes[activeView] = pathname;
  navigationSnapshot = nextRoutes;

  try {
    window.sessionStorage.setItem(navigationMemoryKey, JSON.stringify(nextRoutes));
  } catch {
    // La memoria en ejecución sigue funcionando aunque el navegador bloquee sessionStorage.
  }
  navigationListeners.forEach((listener) => listener());
}

function readStoredRoutes() {
  const nextRoutes = { ...defaultRoutes };
  try {
    const savedRoutes = window.sessionStorage.getItem(navigationMemoryKey);
    if (!savedRoutes) return nextRoutes;
    const parsedRoutes = JSON.parse(savedRoutes) as Partial<Record<WorkspaceView, unknown>>;
    for (const view of Object.keys(defaultRoutes) as WorkspaceView[]) {
      const route = parsedRoutes[view];
      if (typeof route === "string" && isRestorableRoute(view, route)) nextRoutes[view] = route;
    }
  } catch {
    return nextRoutes;
  }
  return nextRoutes;
}
