"use client";

import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type Ref } from "react";
import { ui } from "./shared";

export type OrderItemRow = {
  id: string; addedAt: string;
  content: ReactElement<HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> }>;
};
type VisibleRow = OrderItemRow & { exiting: boolean };

export function OrderItemPresence({ rows, onFocusFallback }: { rows: OrderItemRow[]; onFocusFallback: () => void }) {
  const [previousRows, setPreviousRows] = useState(rows);
  const [visibleRows, setVisibleRows] = useState<VisibleRow[]>(() => rows.map((row) => ({ ...row, exiting: false })));

  if (previousRows !== rows) {
    setPreviousRows(rows);
    const incomingIds = new Set(rows.map((row) => row.id));
    const next: VisibleRow[] = rows.map((row) => ({ ...row, exiting: false }));
    // Keep removed rows in their original positions until their exit finishes.
    visibleRows.forEach((row, index) => {
      if (!incomingIds.has(row.id)) next.splice(Math.min(index, next.length), 0, { ...row, exiting: true });
    });
    setVisibleRows(next);
  }

  const finishExit = useCallback((id: string) => {
    setVisibleRows((current) => current.filter((row) => row.id !== id || !row.exiting));
  }, []);

  return <>
    {visibleRows.map((row) => <PresenceRow key={row.id} row={row} onExit={finishExit} onFocusFallback={onFocusFallback} />)}
    {!visibleRows.length && <li className={ui.detailEmpty}>Todavía no hay ítems en este pedido.</li>}
  </>;
}

function PresenceRow({ row, onExit, onFocusFallback }: { row: VisibleRow; onExit: (id: string) => void; onFocusFallback: () => void }) {
  const element = useRef<HTMLLIElement>(null);
  const { id, exiting } = row;

  useLayoutEffect(() => {
    const node = element.current;
    if (!exiting || !node) return;
    if (node.contains(document.activeElement)) onFocusFallback();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onExit(id);
      return;
    }
    const style = getComputedStyle(node);
    const animation = node.animate([
      { height: `${node.getBoundingClientRect().height}px`, opacity: 1, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, borderTopWidth: style.borderTopWidth, transform: "translateX(0)" },
      { height: `${node.getBoundingClientRect().height}px`, opacity: 0, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, borderTopWidth: style.borderTopWidth, transform: "translateX(8px)", offset: 0.35 },
      { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px", transform: "translateX(8px)" },
    ], { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" });
    void animation.finished.then(() => onExit(id)).catch(() => {});
    return () => animation.cancel();
  }, [exiting, id, onExit, onFocusFallback]);

  return <li
    {...row.content.props}
    ref={element}
    inert={exiting || undefined}
    aria-hidden={exiting || undefined}
    data-exiting={exiting || undefined}
    style={{ ...row.content.props.style, ...(exiting ? { overflow: "hidden", minHeight: 0, pointerEvents: "none" } as const : {}) }}
  />;
}
