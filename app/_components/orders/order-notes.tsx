import { ui } from "./shared";

export function OrderNotes({ notes, fromPdf }: { notes: string; fromPdf: boolean }) {
  // Old imports appended a generated section after the user's own notes.
  // Keep it accessible without rewriting or deleting existing database content.
  const marker = fromPdf ? /(?:^|\n\n)Importado de PDF: /.exec(notes) : null;
  const visibleNotes = marker ? notes.slice(0, marker.index).trim() : notes;
  const importedDetails = marker ? notes.slice(marker.index).trim() : "";
  return (
    <div className={`${ui.detailBlock} order-10`}>
      <span>Notas</span>
      <p className="whitespace-pre-wrap break-words">{visibleNotes || "Sin notas adicionales para este pedido."}</p>
      {importedDetails && (
        <details className="mt-3 rounded-lg border border-[#e4e7e3] bg-[#fafbf9] px-3 py-2 text-xs text-[#68726d]">
          <summary className="cursor-pointer py-1 font-medium focus-visible:outline-2 focus-visible:outline-[#235c4c]">Ver detalle de la importación anterior</summary>
          <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{importedDetails}</p>
        </details>
      )}
    </div>
  );
}
