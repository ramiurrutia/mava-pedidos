"use client";

import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import type { ArtworkPreparationStatus, OrderImage } from "../../../lib/orders";
import { EditIcon, SaveIcon, SpinnerIcon } from "../icons";

export type ArtworkViewerEntry = {
  editable: boolean;
  image: OrderImage;
};

export function ArtworkLightbox({
  entries,
  initialIndex,
  orderCode,
  onClose,
  onEditDescription,
  onPreparationChange,
}: {
  entries: ArtworkViewerEntry[];
  initialIndex: number;
  orderCode: string;
  onClose: () => void;
  onEditDescription: (imageId: string, description: string) => Promise<string | null>;
  onPreparationChange: (artworkKey: string, status: ArtworkPreparationStatus) => Promise<boolean>;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(entries[initialIndex]?.image.description ?? "");
  const [savingDescription, setSavingDescription] = useState(false);
  const [savingPreparation, setSavingPreparation] = useState(false);
  const entry = entries[currentIndex] ?? entries[0];
  const slides = useMemo(
    () => entries.map(({ image }) => ({ alt: image.name, src: image.previewUrl ?? "" })),
    [entries],
  );

  if (!entry) return null;

  function showImage(index: number) {
    const nextEntry = entries[index];
    if (!nextEntry) return;
    setCurrentIndex(index);
    setDescriptionDraft(nextEntry.image.description);
    setEditingDescription(false);
  }

  async function saveDescription(event: React.FormEvent) {
    event.preventDefault();
    if (!entry.editable || savingDescription) return;
    setSavingDescription(true);
    const saved = await onEditDescription(entry.image.id, descriptionDraft);
    setSavingDescription(false);
    if (saved === null) return;
    setDescriptionDraft(saved);
    setEditingDescription(false);
  }

  async function changePreparation(status: ArtworkPreparationStatus) {
    if (savingPreparation || status === entry.image.preparationStatus) return;
    setSavingPreparation(true);
    await onPreparationChange(entry.image.preparationKey, status);
    setSavingPreparation(false);
  }

  return (
    <Lightbox
      carousel={{ finite: true, imageFit: "contain", padding: 0, spacing: "12%" }}
      className="mava-artwork-lightbox"
      close={onClose}
      controller={{ closeOnPullDown: true }}
      index={currentIndex}
      labels={{
        Carousel: "Galería de cuadros",
        Close: "Cerrar imagen",
        Lightbox: "Visor de imágenes del pedido",
        Next: "Imagen siguiente",
        Previous: "Imagen anterior",
        Slide: "Imagen",
        "{index} of {total}": "{index} de {total}",
      }}
      on={{ view: ({ index }) => showImage(index) }}
      open
      plugins={[Zoom]}
      render={{
        controls: () => (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 min-h-16 border-b border-white/10 bg-[#111715]/90 px-4 pb-3 pr-16 pt-[calc(.75rem+env(safe-area-inset-top))] text-white backdrop-blur-md">
              <strong className="block max-w-[70vw] truncate text-sm font-semibold">{entry.image.name}</strong>
              <span className="mt-1 block text-[10px] text-white/55">{orderCode} · {currentIndex + 1} de {entries.length}</span>
            </div>

            <div
              className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 max-h-[40dvh] overflow-y-auto border-t border-white/10 bg-[#171e1b]/95 px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 text-white backdrop-blur-md"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="mx-auto max-w-2xl">
                <div className="mb-3">
                  <span className="mb-2 block text-[9px] font-bold uppercase tracking-[.12em] text-white/45">Preparación</span>
                  <div className="grid grid-cols-2 gap-2">
                    {preparationStatuses.map((status) => {
                      const active = entry.image.preparationStatus === status;
                      return (
                        <button
                          aria-pressed={active}
                          className={`${active ? "border-white/55 bg-white text-[#1e2a25]" : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"} min-h-9 rounded-lg border px-2 text-[9px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-50`}
                          disabled={savingPreparation}
                          key={status}
                          onClick={() => void changePreparation(status)}
                          type="button"
                        >
                          {savingPreparation && active && <SpinnerIcon className="mr-1 inline animate-spin" />}
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3">
                  {editingDescription ? (
                    <form className="grid gap-3" onSubmit={saveDescription}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-[9px] font-bold uppercase tracking-[.12em] text-white/45" htmlFor="lightbox-image-description">Descripción</label>
                        <small className="text-[9px] text-white/45">{descriptionDraft.length}/1000</small>
                      </div>
                      <textarea
                        autoFocus
                        className="min-h-20 w-full resize-y rounded-lg border border-white/15 bg-white/10 p-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/35 focus:border-white/40"
                        id="lightbox-image-description"
                        maxLength={1000}
                        onChange={(event) => setDescriptionDraft(event.target.value)}
                        placeholder="Editar descripción"
                        value={descriptionDraft}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          className="min-h-10 rounded-lg border border-white/15 px-4 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                          disabled={savingDescription}
                          onClick={() => {
                            setDescriptionDraft(entry.image.description);
                            setEditingDescription(false);
                          }}
                          type="button"
                        >
                          Cancelar
                        </button>
                        <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-[#1e2a25] transition hover:bg-[#eef2ef] disabled:opacity-50" disabled={savingDescription} type="submit">
                          {savingDescription ? <SpinnerIcon className="animate-spin" /> : <SaveIcon />}{savingDescription ? "Guardando..." : "Guardar"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-[.12em] text-white/45">{entry.editable ? "Descripción" : "Detalles del cuadro"}</span>
                        {entry.editable && (
                          <button className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-[10px] font-semibold text-white transition hover:bg-white/20" onClick={() => setEditingDescription(true)} type="button">
                            <EditIcon /> Editar
                          </button>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{entry.image.description || "Sin descripción para esta imagen."}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ),
      }}
      slides={slides}
      styles={{ container: { backgroundColor: "#111715" } }}
      toolbar={{ buttons: ["close"] }}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
    />
  );
}

const preparationStatuses: ArtworkPreparationStatus[] = ["Pendiente", "Listo"];
