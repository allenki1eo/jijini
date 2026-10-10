"use client";

import { AnimatePresence, m } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { KitengeStrip } from "@/components/brand/Kitenge";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, closeLabel, children, className }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label={closeLabel} className="absolute inset-0 cursor-default bg-night/70 backdrop-blur-sm" onClick={onClose} />
          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn("relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[var(--radius-card)] bg-night-800 ring-1 ring-white/10", className)}
            initial={{ y: 40, scale: 0.94 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <KitengeStrip className="h-3 w-full" />
            <div className="flex items-center justify-between gap-4 px-6 pt-5">
              <h2 id={titleId} className="font-display text-2xl font-extrabold">
                {title}
              </h2>
              <button type="button" onClick={onClose} aria-label={closeLabel} className="grid size-12 place-items-center rounded-2xl text-cream/70 hover:bg-white/8 hover:text-cream">
                <X className="size-6" />
              </button>
            </div>
            <div className="px-6 pt-2 pb-6">{children}</div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
