import { BackIcon, BoxIcon } from "../icons";
import { ui } from "./shared";

export function LoadingPage() {
  return (
    <div className={`${ui.pagePanel} ${ui.emptyState}`}>
      <BoxIcon />
      <strong>Cargando datos</strong>
      <span>Estamos preparando esta página.</span>
    </div>
  );
}

export function ConnectionErrorPage({ onRetry }: { onRetry: () => Promise<boolean> }) {
  return (
    <section className={`${ui.pagePanel} ${ui.pageCard} ${ui.emptyState}`}>
      <BoxIcon />
      <strong>Sin conexión con Supabase</strong>
      <span>No se guardará información en este dispositivo. Revisa la conexión antes de continuar.</span>
      <button className={`${ui.primaryButton} mt-2`} type="button" onClick={() => void onRetry()}>Reintentar conexión</button>
    </section>
  );
}

export function ResourceNotFound({ onClose }: { onClose: () => void }) {
  return (
    <section className={`${ui.pagePanel} ${ui.pageCard} ${ui.emptyState}`}>
      <BoxIcon />
      <strong>No encontramos este elemento</strong>
      <span>Puede haberse eliminado o la dirección ya no es válida.</span>
      <button className={`${ui.secondaryButton} mt-2`} type="button" onClick={onClose}><BackIcon /> Volver</button>
    </section>
  );
}
