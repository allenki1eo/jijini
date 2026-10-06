"use client";

import { AnimatePresence, m } from "motion/react";
import { Radio as RadioIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { liveStations } from "@/game/audio/LiveRadio";
import { STATIONS } from "@/game/audio/Radio";
import { events, type ToastTone } from "@/game/core/events";
import { formatTzs, useT } from "@/i18n";

interface Note {
  id: number;
  text: string;
  /** Accent colour of the side bar and dot. */
  color: string;
  amount?: number;
  /** Radio lines carry the station's frequency. */
  radio?: string;
}

const TONES: Record<ToastTone, string> = {
  sun: "#FFC72C",
  forest: "#2A9B74",
  sky: "#00A3DD",
  coral: "#FF5A4F",
  cream: "#FFF6E5",
};

const LIFETIME = 3600;
const RADIO_LIFETIME = 7000;
const MAX = 3;

/**
 * The notification feed: combos, earnings, phone and radio lines slide in at
 * the left edge under the top bar, small and translucent, so they can be
 * read at a glance without covering the road ahead. Warnings that need the
 * rider to act (police, checkpoints, fuel) stay centre-screen.
 */
export function ToastStack() {
  const t = useT();
  const [notes, setNotes] = useState<Note[]>([]);
  const nextId = useRef(1);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const push = (note: Omit<Note, "id">, lifetime = LIFETIME) => {
      const id = nextId.current++;
      setNotes((list) => [...list.filter((n) => n.text !== note.text).slice(-(MAX - 1)), { id, ...note }]);
      window.setTimeout(() => setNotes((list) => list.filter((x) => x.id !== id)), lifetime);
    };
    const offs = [
      events.on("toast", (e) => push({ text: e.text, color: TONES[e.tone ?? "cream"], amount: e.amount })),
      events.on("stumble", () => push({ text: tRef.current.ride.stumble, color: TONES.coral })),
      events.on("radio", ({ station, text }) => {
        const info = STATIONS.find((s) => s.id === station) ?? liveStations.find((s) => s.id === station);
        push({ text, color: info?.color ?? TONES.sun, radio: info?.freq ?? "FM" }, RADIO_LIFETIME);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <ol className="pointer-events-none flex w-full max-w-[17.5rem] flex-col items-start gap-1.5" aria-live="polite">
      <AnimatePresence initial={false}>
        {notes.map((note) => (
          <m.li
            key={note.id}
            layout
            initial={{ opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20, transition: { duration: 0.22 } }}
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
            className="relative flex max-w-full items-start gap-2 overflow-hidden rounded-xl rounded-l-md bg-night/70 py-1.5 pr-3 pl-3 text-[13px] leading-snug text-cream/90 shadow-md ring-1 ring-white/8 backdrop-blur-md"
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: note.color }} aria-hidden="true" />
            {note.radio ? (
              <span className="mt-px flex shrink-0 items-center gap-1 font-display text-[11px] font-extrabold" style={{ color: note.color }}>
                <RadioIcon className="size-3.5" /> {note.radio}
              </span>
            ) : (
              <span className="mt-[0.45em] size-1.5 shrink-0 rounded-full" style={{ background: note.color }} aria-hidden="true" />
            )}
            <span className="line-clamp-2 min-w-0 font-semibold">{note.text}</span>
            {note.amount !== undefined && <span className="shrink-0 font-display font-extrabold text-sun tabular">+{formatTzs(note.amount)}</span>}
          </m.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
