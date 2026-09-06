import { BackIcon, BoxIcon } from "../icons";
import { ui } from "./shared";

export function LoadingPage() {
  return (
    <section aria-busy="true" aria-label="Cargando página" className={ui.pagePanel}>
      <span className="loading-skeleton mb-4 block h-9 w-24 rounded-lg" />
      <div className={`${ui.pageCard} grid gap-6`}>
        <div className="flex items-start justify-between gap-5">
          <div className="grid flex-1 gap-2">
            <span className="loading-skeleton h-2.5 w-36 rounded-full" />
            <span className="loading-skeleton h-7 w-3/5 max-w-64 rounded-lg" />
          </div>
          <span className="loading-skeleton size-10 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <span className="loading-skeleton h-11 rounded-lg" key={index} />)}
        </div>
        <span className="loading-skeleton h-20 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <span className="loading-skeleton aspect-[1.35] rounded-lg" />
          <span className="loading-skeleton aspect-[1.35] rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Estamos preparando esta página.</span>
    </section>
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
