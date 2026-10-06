"use client";

import { Frown, Meh, Smile, Timer, X } from "lucide-react";
import { missionHud } from "@/game/missions/MissionRunner";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useMissions } from "@/stores/missions";
import { useHudTick } from "@/components/hud/useHudTick";
import { MISSION_ACCENT, MissionIcon } from "./MissionIcon";
import { formatClock, formatDistance, stopLabel } from "./stopLabel";

/** Top-center job card: where to go, how far, the clock and passenger mood (the direction arrow sits just below). */
export function MissionTracker({ onAbandon }: { onAbandon: () => void }) {
  useHudTick(10);
  const t = useT();
  const active = useMissions((s) => s.active);
  if (!active || !missionHud.active) return null;
  const m = missionHud;
  const urgent = m.limit !== null && m.timeLeft < 20;
  const MoodIcon = m.mood > 0.66 ? Smile : m.mood > 0.33 ? Meh : Frown;

  return (
    <div className="pointer-events-auto flex max-w-[min(30rem,calc(100vw-9rem))] items-stretch overflow-hidden rounded-2xl bg-night-800/90 shadow-xl ring-1 ring-white/10 backdrop-blur">
      <div className={cn("grid w-12 shrink-0 place-items-center", MISSION_ACCENT[active.type])}>
        <MissionIcon type={active.type} className="size-6" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xs font-bold tracking-wide text-cream/60 uppercase">
            {t.missions.phase[m.stopKind]} · {m.stopIndex + 1}/{m.totalStops}
          </p>
          <p className="truncate font-display text-base leading-tight font-extrabold">{m.stopKind === "checkpoint" ? m.stopName : stopLabel(t, { name: m.stopName, poi: m.stopPoi })}</p>
          {m.loading > 0 ? (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-night-500">
              <div className="h-full rounded-full bg-forest-400" style={{ width: `${m.loading * 100}%` }} />
            </div>
          ) : (
            <p className="font-display text-sm font-bold text-sun-300 tabular">{formatDistance(m.distance)}</p>
          )}
        </div>
        {m.carrying && active.passenger !== "none" && (
          <div className="flex flex-col items-center" aria-label={`${t.missions.mood} ${Math.round(m.mood * 100)}%`}>
            <MoodIcon className={cn("size-6", m.mood > 0.66 ? "text-forest-400" : m.mood > 0.33 ? "text-sun" : "text-coral")} />
            <div className="mt-0.5 h-1 w-8 overflow-hidden rounded-full bg-night-500">
              <div className="h-full bg-forest-400" style={{ width: `${m.mood * 100}%` }} />
            </div>
          </div>
        )}
        {m.carrying && active.type === "chai" && (
          <div className="flex flex-col items-center" aria-label={`${t.missions.spill} ${Math.round((1 - m.spill) * 100)}%`}>
            <span className="font-display text-[0.65rem] font-bold text-cream/60 uppercase">{t.missions.spill}</span>
            <div className="h-6 w-3 overflow-hidden rounded-full bg-night-500">
              <div className={cn("mt-auto w-full rounded-full", m.spill > 0.7 ? "bg-coral" : "bg-[#C8913A]")} style={{ height: `${(1 - m.spill) * 100}%`, marginTop: `${m.spill * 100}%` }} />
            </div>
          </div>
        )}
        {m.limit !== null && (
          <div className={cn("flex items-center gap-1 rounded-xl px-2 py-1 font-display text-lg font-extrabold tabular", m.late ? "bg-coral text-cream" : urgent ? "animate-pulse text-coral" : "text-cream")}>
            <Timer className="size-4" />
            {formatClock(m.timeLeft)}
          </div>
        )}
      </div>
      <button type="button" onClick={onAbandon} aria-label={t.missions.abandon} className="grid w-10 shrink-0 place-items-center text-cream/50 hover:bg-white/5 hover:text-coral">
        <X className="size-5" />
      </button>
    </div>
  );
}
