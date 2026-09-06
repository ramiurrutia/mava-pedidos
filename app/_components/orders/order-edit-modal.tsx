"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import type { Order } from "../../../lib/orders";
import type { OrderDetailsInput } from "../../../lib/supabase/orders-repository";
import { CloseIcon, EditIcon, SaveIcon, SpinnerIcon } from "../icons";
import { ui } from "./shared";

export function OrderEditModal({
  onClose,
  onSave,
  order,
}: {
  onClose: () => void;
  onSave: (input: OrderDetailsInput) => Promise<boolean>;
  order: Order;
}) {
  const [clientName, setClientName] = useState(order.clientName);
  const [contactName, setContactName] = useState(order.contactName ?? "");
  const [whatsapp, setWhatsapp] = useState(order.whatsapp ?? "");
  const [notes, setNotes] = useState(order.notes);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 719px)").matches);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSnapPoint, setMobileSnapPoint] = useState<number | string | null>(0.68);
  const [closing, setClosing] = useState(false);
  const closeStarted = useRef(false);
  const closeTimer = useRef<number | null>(null);

  const requestClose = useCallback((force = false) => {
    if (closeStarted.current || (saving && !force)) return;
    closeStarted.current = true;
    setClosing(true);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(onClose, reduceMotion ? 0 : 180);
  }, [onClose, saving]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 719px)");
    const updateMode = () => setIsMobile(media.matches);
    updateMode();
    media.addEventListener("change", updateMode);
    return () => media.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const animationFrame = window.requestAnimationFrame(() => setMobileOpen(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile]);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [requestClose]);

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!clientName.trim() || saving) return;

    setSaving(true);
    const saved = await onSave({
      clientName: clientName.trim(),
      contactName: contactName.trim(),
      whatsapp: whatsapp.trim(),
      notes: notes.trim(),
    });
    setSaving(false);
    if (saved) {
      if (isMobile) setMobileOpen(false);
      else requestClose(true);
    }
  }

  if (isMobile) {
    return (
      <MobileOrderEditSheet
        clientName={clientName}
        contactName={contactName}
        mobileOpen={mobileOpen}
        mobileSnapPoint={mobileSnapPoint}
        notes={notes}
        onClientNameChange={setClientName}
        onContactNameChange={setContactName}
        onNotesChange={setNotes}
        onOpenChange={(open, cancel) => {
          if (!open && saving) {
            cancel();
            return;
          }
          setMobileOpen(open);
        }}
        onOpenChangeComplete={(open) => {
          if (!open) onClose();
        }}
        onSave={saveDetails}
        onRequestClose={() => setMobileOpen(false)}
        onSnapPointChange={setMobileSnapPoint}
        onWhatsappChange={setWhatsapp}
        order={order}
        saving={saving}
        whatsapp={whatsapp}
      />
    );
  }

  return (
    <div
      className={`${closing ? "modal-backdrop-exit" : "modal-backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-[#101713]/50 backdrop-blur-[3px] min-[560px]:items-center min-[560px]:p-6`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <section
        aria-labelledby="edit-order-modal-title"
        aria-modal="true"
        className={`${closing ? "modal-dialog-exit" : "modal-dialog-enter"} flex max-h-[calc(100dvh-env(safe-area-inset-top)-8px)] w-full max-w-[860px] flex-col overflow-hidden rounded-t-[22px] border border-[#dfe4e0] bg-white shadow-[0_28px_90px_rgb(12_24_18/30%)] min-[560px]:max-h-[calc(100dvh-48px)] min-[560px]:rounded-[22px] min-[720px]:grid min-[720px]:h-[min(540px,calc(100dvh-48px))] min-[720px]:grid-cols-[250px_minmax(0,1fr)]`}
        role="dialog"
      >
        <aside className="hidden flex-col justify-between overflow-hidden bg-[#173d34] p-7 text-white min-[720px]:flex">
          <div>
            <span className="grid size-11 place-items-center rounded-xl bg-white/12 text-white [&_svg]:size-[18px]"><EditIcon /></span>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.14em] text-white/55">Gestión del pedido</p>
            <h2 className="mt-2 text-[27px] font-semibold leading-tight tracking-[-.035em]">Editar información</h2>
            <p className="mt-3 text-xs leading-relaxed text-white/68">Actualizá los datos del cliente y las indicaciones sin alterar los cuadros ni su preparación.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.07] p-4">
            <span className="block text-[9px] font-semibold uppercase tracking-[.12em] text-white/50">Pedido</span>
            <strong className="mt-1.5 block truncate text-xs font-semibold">{order.code}</strong>
            <span className="mt-2 block truncate text-[11px] text-white/65">{order.clientName}</span>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#d6dbd7] min-[560px]:hidden" />
          <header className="flex shrink-0 items-center justify-between gap-5 border-b border-[#e7e9e6] px-5 pb-4 pt-3 min-[560px]:px-7 min-[560px]:py-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f1eb] text-[#235c4c] min-[720px]:hidden [&_svg]:size-[17px]"><EditIcon /></span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-[-.025em] min-[720px]:text-lg" id="edit-order-modal-title">Datos del pedido</h2>
                <p className="mt-1 truncate text-[11px] font-medium text-[#77817c]">{order.code}<span className="min-[720px]:hidden"> · Cambiá la información general</span></p>
              </div>
            </div>
            <button
              aria-label="Cerrar edición"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-[#66716c] transition-colors hover:bg-[#f1f4f1] focus-visible:outline-2 focus-visible:outline-[#235c4c] disabled:opacity-45 [&_svg]:size-4"
              disabled={saving || closing}
              onClick={() => requestClose()}
              type="button"
            >
              <CloseIcon />
            </button>
          </header>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={saveDetails}>
            <div className="modal-scroll-area min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-5 min-[560px]:px-7 min-[560px]:py-6">
              <p className="mb-5 rounded-xl bg-[#f4f7f4] px-3.5 py-3 text-[11px] leading-relaxed text-[#65706a] min-[720px]:hidden">Solo se actualizarán estos datos. El código, las imágenes y el avance de preparación se mantienen igual.</p>
              <label className={ui.field}>
                <span>Cliente / carpeta</span>
                <input autoComplete="organization" autoFocus maxLength={80} onChange={(event) => setClientName(event.target.value)} required value={clientName} />
              </label>
              <div className="grid grid-cols-2 gap-4 max-[520px]:grid-cols-1 max-[520px]:gap-0">
                <label className={ui.field}>
                  <span>Contacto</span>
                  <input autoComplete="name" maxLength={120} onChange={(event) => setContactName(event.target.value)} placeholder="Nombre del contacto" value={contactName} />
                </label>
                <label className={ui.field}>
                  <span>WhatsApp</span>
                  <input autoComplete="tel" inputMode="tel" maxLength={40} onChange={(event) => setWhatsapp(event.target.value)} placeholder="Número de WhatsApp" value={whatsapp} />
                </label>
              </div>
              <label className={`${ui.field} mb-0`}>
                <span>Notas</span>
                <textarea className="min-h-32 min-[720px]:min-h-40" maxLength={5000} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones generales del pedido" rows={5} value={notes} />
              </label>
            </div>

            <footer className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-[#e7e9e6] bg-[#fafbf9] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4 min-[560px]:flex min-[560px]:justify-end min-[560px]:px-7 min-[560px]:pb-5 min-[560px]:pt-5">
              <button className={`${ui.secondaryButton} min-[560px]:min-w-28`} disabled={saving || closing} onClick={() => requestClose()} type="button">Cancelar</button>
              <button className={`${ui.primaryButton} min-[560px]:min-w-40`} disabled={saving || closing || !clientName.trim()} type="submit">
                {saving ? <SpinnerIcon className="animate-spin" /> : <SaveIcon />}
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  );
}

function MobileOrderEditSheet({
  clientName,
  contactName,
  mobileOpen,
  mobileSnapPoint,
  notes,
  onClientNameChange,
  onContactNameChange,
  onNotesChange,
  onOpenChange,
  onOpenChangeComplete,
  onRequestClose,
  onSave,
  onSnapPointChange,
  onWhatsappChange,
  order,
  saving,
  whatsapp,
}: {
  clientName: string;
  contactName: string;
  mobileOpen: boolean;
  mobileSnapPoint: number | string | null;
  notes: string;
  onClientNameChange: (value: string) => void;
  onContactNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onOpenChange: (open: boolean, cancel: () => void) => void;
  onOpenChangeComplete: (open: boolean) => void;
  onRequestClose: () => void;
  onSave: (event: React.FormEvent) => void;
  onSnapPointChange: (value: number | string | null) => void;
  onWhatsappChange: (value: string) => void;
  order: Order;
  saving: boolean;
  whatsapp: string;
}) {
  return (
    <Drawer.Root
      onOpenChange={(open, eventDetails) => onOpenChange(open, () => eventDetails.cancel())}
      onOpenChangeComplete={onOpenChangeComplete}
      onSnapPointChange={onSnapPointChange}
      open={mobileOpen}
      snapPoint={mobileSnapPoint}
      snapPoints={[0.68, 1]}
      snapToSequentialPoints
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="mobile-order-sheet-backdrop fixed inset-0 z-50 bg-[#101713] backdrop-blur-[2px]" />
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
            <Drawer.Popup className="mobile-order-sheet-popup flex w-full flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-[#dfe4e0] bg-white shadow-[0_-20px_60px_rgb(12_24_18/24%)]">
              <div className="shrink-0 touch-none px-5 pb-3 pt-2.5">
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#c7cec9]" />
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Drawer.Title className="text-xl font-semibold tracking-[-.025em]">Editar pedido</Drawer.Title>
                    <Drawer.Description className="mt-1 truncate text-[11px] font-medium text-[#77817c]">{order.code} · Deslizá hacia arriba para ampliar</Drawer.Description>
                  </div>
                  <button
                    aria-label="Cerrar edición"
                    className="grid size-11 shrink-0 place-items-center rounded-xl text-[#66716c] transition-colors active:bg-[#eef2ef] disabled:opacity-45 [&_svg]:size-4"
                    disabled={saving}
                    onClick={onRequestClose}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSave}>
                <Drawer.Content className="modal-scroll-area min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain border-t border-[#e7e9e6] px-5 py-5">
                  <label className={ui.field}>
                    <span>Cliente / carpeta</span>
                    <input autoComplete="organization" maxLength={80} onChange={(event) => onClientNameChange(event.target.value)} required value={clientName} />
                  </label>
                  <label className={ui.field}>
                    <span>Contacto</span>
                    <input autoComplete="name" maxLength={120} onChange={(event) => onContactNameChange(event.target.value)} placeholder="Nombre del contacto" value={contactName} />
                  </label>
                  <label className={ui.field}>
                    <span>WhatsApp</span>
                    <input autoComplete="tel" inputMode="tel" maxLength={40} onChange={(event) => onWhatsappChange(event.target.value)} placeholder="Número de WhatsApp" value={whatsapp} />
                  </label>
                  <label className={`${ui.field} mb-0`}>
                    <span>Notas</span>
                    <textarea className="min-h-36" maxLength={5000} onChange={(event) => onNotesChange(event.target.value)} placeholder="Indicaciones generales del pedido" rows={5} value={notes} />
                  </label>
                </Drawer.Content>

                <footer className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-[#e7e9e6] bg-[#fafbf9] px-5 pb-[calc(16px+env(safe-area-inset-bottom)+var(--drawer-keyboard-inset,0px))] pt-4">
                  <button className={ui.secondaryButton} disabled={saving} onClick={onRequestClose} type="button">Cancelar</button>
                  <button className={ui.primaryButton} disabled={saving || !clientName.trim()} type="submit">
                    {saving ? <SpinnerIcon className="animate-spin" /> : <SaveIcon />}
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                </footer>
              </form>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
