"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { events, type ToastTone } from "@/game/core/events";
import { formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  amount?: number;
}

const TONES: Record<ToastTone, string> = {
  sun: "bg-sun text-night",
  forest: "bg-forest text-cream",
  sky: "bg-sky text-night",
  coral: "bg-coral text-cream",
  cream: "bg-cream text-night",
};

const LIFETIME = 2400;
const MAX = 4;

/** Combo / event toasts stacked under the top bar. */
export function ToastStack() {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const push = (text: string, tone: ToastTone = "cream", amount?: number) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-(MAX - 1)), { id, text, tone, amount }]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), LIFETIME);
    };
    const offs = [
      events.on("toast", (e) => push(e.text, e.tone, e.amount)),
      events.on("stumble", () => push(tRef.current.ride.stumble, "coral")),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <m.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -14, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-base font-extrabold shadow-lg", TONES[toast.tone])}
          >
            <span className="pt-[0.1em]">{toast.text}</span>
            {toast.amount !== undefined && <span className="tabular opacity-80">+{formatTzs(toast.amount)}</span>}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
