"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { imagesFromPaste, readClipboardImages } from "../../../lib/clipboard-images";
import { ClipboardIcon, SpinnerIcon } from "../icons";
import { ui } from "./shared";

export function ImagePasteArea({ children, onImages, disabled = false, className = "" }: {
  children: ReactNode; onImages: (files: File[]) => void; disabled?: boolean; className?: string;
}) {
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => () => { request.current?.abort(); }, [disabled]);

  async function pasteImage() {
    if (disabled || busy.current) return;
    if (!navigator.clipboard?.read) {
      setMessage("Para pegar la imagen, hacé clic en esta zona y presioná Ctrl+V.");
      return;
    }
    const controller = new AbortController(); request.current = controller;
    busy.current = true; setReading(true); setMessage("");
    try {
      const files = await readClipboardImages(navigator.clipboard);
      if (controller.signal.aborted) return;
      if (!files.length) {
        setMessage("No hay una imagen disponible para pegar. Copiá una imagen abierta o un recorte de Windows y volvé a intentar.");
        return;
      }
      onImages(files);
      setMessage(`${files.length === 1 ? "Imagen agregada" : `${files.length} imágenes agregadas`}. Revisá la vista previa antes de subir.`);
    } catch {
      if (!controller.signal.aborted) setMessage("No se pudo acceder al portapapeles. Permití el acceso en el navegador o hacé clic en esta zona y usá Ctrl+V.");
    } finally { busy.current = false; setReading(false); }
  }

  return (
    <ContextMenu.Root disabled={disabled}>
      <ContextMenu.Trigger
        aria-label="Zona para pegar imágenes"
        className={`rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#235c4c] ${className}`}
        tabIndex={disabled ? -1 : 0}
        onContextMenuCapture={(event) => {
          // Text fields keep the browser's native Copy/Paste menu.
          if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) event.stopPropagation();
        }}
        onPaste={(event) => {
          if (disabled || reading) return;
          const files = imagesFromPaste(event.clipboardData);
          if (!files.length) return; // Ordinary pasted text keeps its normal behavior.
          event.preventDefault(); event.stopPropagation();
          onImages(files);
          setMessage(`${files.length === 1 ? "Imagen agregada" : `${files.length} imágenes agregadas`}. Revisá la vista previa antes de subir.`);
        }}
      >
        {children}
        {!disabled && <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <button className={ui.secondaryButton} disabled={reading} onClick={() => void pasteImage()} type="button">
            {reading ? <SpinnerIcon className="animate-spin" /> : <ClipboardIcon />}{reading ? "Leyendo imagen..." : "Pegar imagen"}
          </button>
          <p className="text-[11px] leading-relaxed text-[#68726d]">También podés hacer clic derecho en esta zona o pegar con Ctrl+V.</p>
          <p className="text-xs leading-relaxed text-[#68726d]" role="status" aria-live="polite">{message}</p>
        </div>}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50" sideOffset={4}>
          <ContextMenu.Popup className="min-w-48 rounded-xl border border-[#dfe3df] bg-white p-1 text-[#34413c] shadow-lg outline-none">
            <ContextMenu.Item disabled={disabled || reading} onClick={() => void pasteImage()} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-xs font-semibold outline-none data-[highlighted]:bg-[#edf3ef] data-[disabled]:opacity-50 [&_svg]:size-4">
              <ClipboardIcon />Pegar imagen
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
