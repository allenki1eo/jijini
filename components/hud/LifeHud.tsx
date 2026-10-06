"use client";

import { AnimatePresence, m } from "motion/react";
import { CloudFog, CloudRain, IdCard, Moon, ShieldAlert, Sun } from "lucide-react";
import { useEffect } from "react";
import { Chip } from "@/components/ui";
import { events } from "@/game/core/events";
import { clockText, env } from "@/game/systems/environment";
import { CHECKPOINT_FINE, checkpointState } from "@/game/traffic/Checkpoints";
import { fmt, formatTzs, useT } from "@/i18n";
import { useHudTick } from "./useHudTick";

/** Clock and weather chip. */
export function ClockChip() {
  useHudTick(2);
  const t = useT();
  const icon = env.weather === "rain" ? <CloudRain className="text-sky-300" /> : env.weather === "haze" ? <CloudFog className="text-sun-300" /> : env.night > 0.5 ? <Moon className="text-sun-300" /> : <Sun className="text-sun" />;
  const label = env.night > 0.5 && env.weather === "sunny" ? t.life.night : t.life.weather[env.weather];
  return (
    <Chip icon={icon} className="tabular">
      {clockText()} <span className="hidden text-cream/60 sm:inline">· {label}</span>
    </Chip>
  );
}

/** Afande Salum's checkpoint prompt. */
export function CheckpointPrompt() {
  useHudTick(8);
  const t = useT();
  const phase = checkpointState.phase;
  const text =
    phase === "approach"
      ? t.life.checkpointAhead
      : phase === "passed"
        ? t.life.checkpointPassed
        : phase === "fined"
          ? fmt(t.life.checkpointFined, { fine: formatTzs(CHECKPOINT_FINE) })
          : null;
  return (
    <AnimatePresence>
      {phase !== "none" && (
        <m.div
          key={phase}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-[#0D3B66] py-2 pr-2 pl-4 text-cream shadow-xl ring-2 ring-white/20"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
        >
          <ShieldAlert className="size-6 shrink-0 text-sun" />
          {text && <span className="font-display font-bold">{text}</span>}
          {phase === "show" && (
            <button
              type="button"
              onClick={() => (checkpointState.showRequested = true)}
              className="chunky flex min-h-12 items-center gap-2 rounded-xl bg-sun px-4 font-display font-extrabold text-night [--edge:var(--color-sun-800)]"
            >
              <IdCard className="size-5" /> {t.life.checkpointShow} <kbd className="hidden rounded bg-night/15 px-1.5 text-xs sm:inline">E</kbd>
            </button>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Turns skill events into toasts. */
export function useSkillToasts() {
  const t = useT();
  useEffect(() => {
    const offs = [
      events.on("nearMiss", ({ combo }) => events.emit("toast", { text: fmt(t.life.nearMiss, { combo }), tone: "sky" })),
      events.on("wheelie", ({ meters }) => events.emit("toast", { text: fmt(t.life.wheelie, { m: Math.round(meters) }), tone: "sun" })),
      events.on("drift", () => events.emit("toast", { text: t.life.drift, tone: "forest" })),
    ];
    return () => offs.forEach((off) => off());
  }, [t]);
}
