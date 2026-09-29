"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ui } from "./shared";

export function OrderStepCard({ step, children }: { step: number; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element || previousStep.current === step) return;

    element.style.setProperty("--order-step-offset", step > previousStep.current ? "18px" : "-18px");
    previousStep.current = step;

    // Keep the next step's heading visible after continuing from a long form.
    element.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    const { top } = element.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight / 2) {
      element.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
    }
  }, [step]);

  return (
    <div className={`${ui.pageCard} scroll-mt-6`} ref={card}>
      <div className="order-step-enter" key={step}>{children}</div>
    </div>
  );
}
