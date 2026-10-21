"use client";

import type { ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowIcon } from "../icons";

export function AnimatedDisclosure({ title, children, className = "", triggerClassName = "", defaultOpen = false }: {
  title: string; children: ReactNode; className?: string; triggerClassName?: string; defaultOpen?: boolean;
}) {
  return <Collapsible.Root className={className} defaultOpen={defaultOpen}>
    <Collapsible.Trigger className={`order-disclosure-trigger flex min-h-9 cursor-pointer items-center gap-2 rounded-sm py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] ${triggerClassName}`}>
      <ArrowIcon aria-hidden="true" className="size-3.5 shrink-0" /><span>{title}</span>
    </Collapsible.Trigger>
    <Collapsible.Panel keepMounted className="order-disclosure-panel">{children}</Collapsible.Panel>
  </Collapsible.Root>;
}
