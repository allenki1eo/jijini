"use client";

import { AnimatePresence, m } from "motion/react";
import { Siren } from "lucide-react";
import { policeHud } from "@/game/traffic/Police";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useHudTick } from "./useHudTick";

/** Traffic police: the speed-gun wave-down, the chase with its escape meter, and the outcome. */
export function PoliceBanner() {
  useHudTick(10);
  const t = useT();
  const s = policeHud.state;
  const fine = policeHud.fine + policeHud.licenceFine;
  return (
    <>
      {/* Flashing red and blue at the screen edges during a chase. */}
      {s === "chase" && <div aria-hidden="true" className="pointer-events-none fixed inset-0 animate-police-flash" />}
      <AnimatePresence>
        {s !== "none" && (
          <m.div
            key={s}
            role="status"
            className={cn(
              "flex min-w-[min(22rem,calc(100vw-2rem))] flex-col gap-1.5 rounded-2xl px-4 py-2.5 text-cream shadow-xl ring-2",
              s === "chase" || s === "flagged" ? "bg-[#7A0F1C] ring-coral" : s === "escaped" ? "bg-forest ring-forest-400" : "bg-[#0D3B66] ring-white/25",
            )}
            initial={{ y: -16, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -12, opacity: 0 }}
          >
            <p className="flex items-center gap-2 font-display text-lg leading-tight font-extrabold">
              <Siren className={cn("size-6 shrink-0", (s === "chase" || s === "flagged") && "animate-pulse text-sun")} />
              {s === "flagged" && (policeHud.reason === "redLight" ? t.police.redLight : fmt(t.police.flagged, { speed: policeHud.measured, limit: policeHud.limit }))}
              {s === "chase" && t.police.chase}
              {s === "escaped" && t.police.escaped}
              {s === "caught" && fmt(t.police.caught, { fine: formatTzs(fine) })}
              {s === "paid" && fmt(t.police.paid, { fine: formatTzs(policeHud.fine) })}
            </p>
            {s === "flagged" && (
              <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                <div className="h-full bg-sun transition-[width]" style={{ width: `${Math.max(0, policeHud.timeLeft / 7) * 100}%` }} />
              </div>
            )}
            {s === "chase" && (
              <div className="flex items-center gap-3 text-sm">
                <span className="w-24 font-semibold tabular">{fmt(t.police.behind, { m: Math.round(policeHud.distance) })}</span>
                <span className="text-cream/70">{t.police.escape}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full bg-forest-400 transition-[width]" style={{ width: `${policeHud.escape * 100}%` }} />
                </div>
              </div>
            )}
            {(s === "caught" || s === "paid") && policeHud.licenceFine > 0 && (
              <p className="text-sm text-sun-300">{fmt(t.police.licence, { fine: formatTzs(policeHud.licenceFine) })}</p>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
