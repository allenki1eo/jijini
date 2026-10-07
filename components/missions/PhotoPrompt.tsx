"use client";

import { Camera, Check, Images } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHudTick } from "@/components/hud/useHudTick";
import type { Game } from "@/game/core/Game";
import { fmt, useT } from "@/i18n";

/**
 * Stopped by one of the city's landmarks (Mnara wa Saa, the Askari
 * Monument…): take its picture for your album. New places are worth more XP;
 * each one counts once a day. F on a keyboard.
 */
export function PhotoPrompt({ game }: { game: Game }) {
  useHudTick(4);
  const t = useT();
  const [flash, setFlash] = useState(0);
  const spot = game.photoSpot();

  const shoot = () => {
    if (game.takePhoto() > 0) setFlash((n) => n + 1);
  };

  useEffect(() => {
    if (!spot || spot.taken) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyF" && !e.repeat && game.takePhoto() > 0) setFlash((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spot, game]);

  const album = game.album;
  return (
    <>
      {spot && (
        <div className="pointer-events-auto flex w-64 flex-col gap-2 rounded-2xl bg-night-800/92 p-3 shadow-xl ring-1 ring-sky/40 backdrop-blur max-sm:w-full max-sm:max-w-[15rem] max-sm:p-2.5">
          <div className="flex items-start gap-2">
            <Camera className="mt-0.5 size-5 shrink-0 text-sky-300" />
            <div className="min-w-0">
              <p className="truncate font-display leading-tight font-extrabold text-sky-300">{spot.name}</p>
              <p className="flex items-center gap-1 text-xs text-cream/60">
                <Images className="size-3.5" /> {fmt(t.photo.album, album)}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={spot.taken}
            onClick={shoot}
            className="chunky flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky font-display font-extrabold text-night [--edge:var(--color-sky-700)] disabled:bg-night-600 disabled:text-cream/60 disabled:[--edge:var(--color-night)]"
          >
            {spot.taken ? <Check className="size-5" /> : <Camera className="size-5" />}
            {spot.taken ? t.photo.takenToday : t.photo.take}
            {!spot.taken && <kbd className="hidden rounded bg-night/15 px-1.5 text-xs sm:inline">F</kbd>}
          </button>
          {!spot.taken && <p className="text-center text-xs text-sky-300">{spot.first ? t.photo.newBonus : t.photo.againBonus}</p>}
        </div>
      )}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {flash > 0 && (
              <m.div
                key={flash}
                className="pointer-events-none fixed inset-0 z-50 bg-white"
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
