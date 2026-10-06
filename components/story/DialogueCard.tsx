"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { useEffect } from "react";
import { playVoice } from "@/game/audio/voices";
import { Portrait, type CharacterId } from "./Portrait";

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  juma: "Mzee Juma",
  baraka: "Baraka",
  neema: "Mama Neema",
  salum: "Afande Salum",
};

interface DialogueCardProps {
  open: boolean;
  speaker: CharacterId;
  text: string;
  cta: string;
  onNext: () => void;
  secondary?: { label: string; onClick: () => void };
  /** Voice-bank key for this line (e.g. "story.ch1.0"); played when a recording exists. */
  voiceKey?: string;
}

/** Comic dialogue card used by the tutorial and story chapters. */
export function DialogueCard({ open, speaker, text, cta, onNext, secondary, voiceKey }: DialogueCardProps) {
  useEffect(() => {
    if (open && voiceKey) void playVoice(voiceKey, CHARACTER_NAMES[speaker]);
  }, [open, voiceKey, speaker]);
  return (
    <AnimatePresence mode="wait">
      {open && (
        <m.div
          key={text}
          role="dialog"
          aria-label={CHARACTER_NAMES[speaker]}
          className="pointer-events-auto w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] bg-night-800 shadow-2xl ring-1 ring-white/10"
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <KitengeStrip className="h-2.5 w-full" />
          <div className="flex gap-4 p-4">
            <Portrait id={speaker} className="size-20 shrink-0 rounded-2xl ring-2 ring-white/15 short:size-14" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="font-display text-sm font-extrabold tracking-wide text-sun uppercase">{CHARACTER_NAMES[speaker]}</p>
              <p className="-mt-2 text-base leading-snug text-cream/90">{text}</p>
              <div className="flex flex-wrap justify-end gap-2">
                {secondary && (
                  <Button variant="ghost" onClick={secondary.onClick}>
                    {secondary.label}
                  </Button>
                )}
                <Button variant="sun" iconRight={<ArrowRight />} onClick={onNext}>
                  {cta}
                </Button>
              </div>
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
