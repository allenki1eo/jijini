"use client";

import { Fuel, Zap } from "lucide-react";
import { hud } from "@/game/core/hud";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useHudTick } from "./useHudTick";

const MAX_KMH = 100;
const R = 78;
const SWEEP = 270;
const CIRC = 2 * Math.PI * R;
const ARC = (CIRC * SWEEP) / 360;

function Bar({ value, icon, tone, label, warn }: { value: number; icon: React.ReactNode; tone: string; label: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${label} ${Math.round(value * 100)}%`}>
      <span className={cn("grid size-5 place-items-center [&_svg]:size-4", warn ? "animate-pulse text-coral" : "text-cream/80")}>{icon}</span>
      <div className="h-2 w-16 overflow-hidden rounded-full bg-night/70 ring-1 ring-white/10">
        <div className={cn("h-full rounded-full transition-[width] duration-200", warn ? "bg-coral" : tone)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
    </div>
  );
}

/** Dial speedometer with fuel and boost bars. */
export function Speedometer() {
  useHudTick(15);
  const t = useT();
  const kmh = hud.speedKmh;
  const frac = Math.min(1, kmh / MAX_KMH);
  return (
    <div className="pointer-events-none flex flex-col items-center">
      <div className="relative size-36 short:size-28">
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-[225deg]" aria-hidden="true">
          <circle cx="100" cy="100" r={R + 14} fill="rgb(16 19 26 / 0.72)" />
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${ARC} ${CIRC}`} />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={hud.boosting ? "var(--color-sky)" : frac > 0.8 ? "var(--color-coral)" : "var(--color-sun)"}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${ARC * frac} ${CIRC}`}
            className="transition-[stroke-dasharray] duration-100"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-5xl leading-none font-extrabold tabular text-cream short:text-4xl">{Math.round(kmh)}</span>
          <span className="font-display text-xs font-bold tracking-wide text-cream/60">{t.ride.kmh}</span>
        </div>
      </div>
      <div className="-mt-3 flex gap-3 rounded-full bg-night/72 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur">
        <Bar value={hud.fuel} icon={<Fuel />} tone="bg-forest-400" label={t.ride.fuel} warn={hud.fuel < 0.15} />
        <Bar value={hud.boost} icon={<Zap />} tone="bg-sky" label={t.ride.boost} />
      </div>
    </div>
  );
}
