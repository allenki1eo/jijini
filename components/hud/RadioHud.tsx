"use client";

import { AnimatePresence, m } from "motion/react";
import { Radio as RadioIcon, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { liveStations } from "@/game/audio/LiveRadio";
import { Radio, STATIONS } from "@/game/audio/Radio";
import { events } from "@/game/core/events";
import { useT } from "@/i18n";
import { useSettings } from "@/stores/settings";

const SHOW_FOR = 9000;

/** The boda's radio: tap (or press R) to change station; the DJ's words scroll in underneath. */
export function RadioChip() {
  const t = useT();
  const station = useSettings((s) => s.radio);
  const live = liveStations.find((s) => s.id === station);
  const info = STATIONS.find((s) => s.id === station) ?? live;
  const [line, setLine] = useState<{ id: number; text: string; color: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyR" && !e.repeat && !(e.target instanceof HTMLInputElement)) Radio.cycle();
    };
    window.addEventListener("keydown", onKey);
    const off = events.on("radio", ({ station: id, text }) => {
      const color = STATIONS.find((s) => s.id === id)?.color ?? "#FFC72C";
      const entry = { id: performance.now(), text, color };
      setLine(entry);
      window.setTimeout(() => setLine((cur) => (cur?.id === entry.id ? null : cur)), SHOW_FOR);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => Radio.cycle()}
        title={t.radio.change}
        aria-label={info ? `${info.name} ${info.freq} · ${t.radio.change}` : t.radio.off}
        className="flex min-h-12 items-center gap-2 rounded-2xl bg-night-600/95 px-3 font-display text-sm font-bold text-cream ring-1 ring-white/10 backdrop-blur"
      >
        {info ? <RadioIcon className="size-5" style={{ color: info.color }} /> : <VolumeX className="size-5 text-cream/50" />}
        {info ? (
          <span className="flex items-baseline gap-1.5 tabular">
            {live && <span className="animate-pulse rounded bg-coral px-1 text-[10px] leading-4 font-extrabold text-cream">LIVE</span>}
            {info.freq}
            <span className="hidden text-cream/60 xl:inline">{info.name}</span>
          </span>
        ) : (
          <span className="hidden text-cream/60 sm:inline">{t.radio.off}</span>
        )}
      </button>
      <AnimatePresence>
        {line && info && (
          <m.p
            key={line.id}
            className="absolute top-14 left-0 w-[min(20rem,calc(100vw-2rem))] rounded-2xl rounded-tl-sm border-l-4 bg-night/85 px-3 py-2 text-sm leading-snug text-cream/90 shadow-lg backdrop-blur"
            style={{ borderColor: line.color }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <span className="mr-1.5 font-display font-extrabold" style={{ color: line.color }}>
              {info.freq}
            </span>
            {line.text}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
