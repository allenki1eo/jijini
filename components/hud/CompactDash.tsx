"use client";

import { Fuel, Wrench, Zap } from "lucide-react";
import { hud } from "@/game/core/hud";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useHudTick } from "./useHudTick";

const LIGHTS = { red: "#FF2D2D", amber: "#FFB020", green: "#2EE27A" } as const;

function Bar({ value, icon, tone, warn, label }: { value: number; icon: React.ReactNode; tone: string; warn?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className={cn("[&_svg]:size-3", warn ? "animate-pulse text-coral" : "text-cream/60")}>{icon}</span>
      <span className="h-1.5 w-9 overflow-hidden rounded-full bg-white/12">
        <span className={cn("block h-full rounded-full", warn ? "bg-coral" : tone)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </span>
    </span>
  );
}

/**
 * The phone dash: one slim strip instead of the big dial, so it fits in the
 * top stack on a portrait screen. Speed and gear, the road's limit, the
 * signal ahead, and fuel/boost/damage bars.
 */
export function CompactDash() {
  useHudTick(12);
  const t = useT();
  const kmh = Math.round(hud.speedKmh);
  const over = hud.speedKmh > hud.limitKmh + 5;
  return (
    <div className="pointer-events-none flex items-center gap-2.5 rounded-2xl bg-night/80 py-1.5 pr-3 pl-2 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
      <span className="flex items-baseline gap-1">
        <span className={cn("min-w-[2.2ch] text-right font-display text-3xl leading-none font-extrabold tabular", over ? "text-coral" : hud.boosting ? "text-sky-300" : "text-cream")}>{kmh}</span>
        <span className="font-display text-[10px] font-bold text-cream/55">{t.ride.kmh}</span>
      </span>
      <span className="grid size-6 place-items-center rounded-md bg-night-600 font-display text-xs font-extrabold text-sun ring-1 ring-white/15" aria-label={`gear ${hud.gear}`}>
        {hud.gear === 0 ? "N" : hud.gear}
      </span>
      <span
        className={cn("grid size-8 shrink-0 place-items-center rounded-full border-[3px] border-[#D7261E] bg-white font-display text-xs font-extrabold text-night", over && "animate-pulse ring-2 ring-coral/70")}
        aria-label={`limit ${hud.limitKmh}`}
      >
        {hud.limitKmh}
      </span>
      {hud.light && <span className="size-3.5 shrink-0 rounded-full" style={{ background: LIGHTS[hud.light], boxShadow: `0 0 8px ${LIGHTS[hud.light]}` }} aria-label={hud.light} />}
      <span className="flex flex-col gap-0.5">
        <Bar value={hud.fuel} icon={<Fuel />} tone="bg-forest-400" warn={hud.fuel < 0.15} label={t.ride.fuel} />
        <Bar value={hud.boost} icon={<Zap />} tone="bg-sky" label={t.ride.boost} />
        <Bar value={1 - hud.damage / 100} icon={<Wrench />} tone="bg-sun" warn={hud.damage > 70} label={t.ride.damage} />
      </span>
    </div>
  );
}
