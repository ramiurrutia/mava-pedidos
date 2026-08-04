import type { ReactNode } from "react";
import Link from "next/link";
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
  { label: "Inicio", href: "/", view: "resumen", icon: GridIcon },
  { label: "Pedidos", href: "/pedidos", view: "pedidos", icon: BoxIcon },
  { label: "Carpetas", href: "/carpetas", view: "carpetas", icon: FolderIcon },
] satisfies Array<{ label: string; href: string; view: WorkspaceView; icon: typeof GridIcon }>;

export function AppShell({ activeView, children }: { activeView: WorkspaceView; children: ReactNode }) {
  return (
    <div className={ui.appShell}>
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
        {navigation.map(({ label, href, view, icon: Icon }) => (
          <Link
            aria-current={activeView === view ? "page" : undefined}
            className={`${ui.navItem} ${activeView === view ? ui.navActive : ""}`}
            href={href}
            key={label}
          >
            <Icon /><span>{label}</span>
          </Link>
        ))}
      </nav>

      <main className={ui.main}>{children}</main>
    </div>
  );
}
