"use client";

import { Fuel, Lightbulb, Wrench, Zap } from "lucide-react";
import { hud } from "@/game/core/hud";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useHudTick } from "./useHudTick";

const MAX_KMH = 120;
const START = -120;
const SWEEP = 240;
const R = 80;

/** Point on the dial at `deg` (0 = straight up), radius r, around (100, 100). */
const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r] as const;
};

const arc = (from: number, to: number, r: number) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

const TICKS = Array.from({ length: MAX_KMH / 10 + 1 }, (_, i) => i * 10);

function Gauge({ value, icon, tone, label, warn, text }: { value: number; icon: React.ReactNode; tone: string; label: string; warn?: boolean; text?: string }) {
  return (
    <div className="flex items-center gap-1.5" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className={cn("grid size-5 place-items-center [&_svg]:size-4", warn ? "animate-pulse text-coral" : "text-cream/80")}>{icon}</span>
      <div className="flex h-2.5 w-14 gap-[2px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-full flex-1 rounded-[2px]", value > i / 5 + 0.02 ? (warn ? "bg-coral" : tone) : "bg-white/12")} />
        ))}
      </div>
      {text && <span className="w-7 font-display text-xs font-bold text-cream/70 tabular">{text}</span>}
    </div>
  );
}

/** The boda's instrument cluster: dial with needle and gear, the road's limit, the signal ahead, and fuel/boost/damage. */
export function Speedometer() {
  useHudTick(15);
  const t = useT();
  const kmh = hud.speedKmh;
  const frac = Math.min(1, kmh / MAX_KMH);
  const needle = START + SWEEP * frac;
  const over = kmh > hud.limitKmh + 5;
  const limitDeg = START + SWEEP * Math.min(1, hud.limitKmh / MAX_KMH);
  const lights = { red: "#FF2D2D", amber: "#FFB020", green: "#2EE27A" } as const;

  return (
    <div className="pointer-events-none flex flex-col items-center">
      <div className="relative flex items-end gap-2">
        {/* The traffic light coming up, if any. */}
        <div className={cn("mb-6 flex w-9 flex-col items-center gap-1 rounded-xl bg-night/80 py-1.5 ring-1 ring-white/10 transition-opacity", hud.light ? "opacity-100" : "opacity-0")} aria-hidden={!hud.light}>
          {(["red", "amber", "green"] as const).map((c) => (
            <span key={c} className="size-4 rounded-full" style={{ background: hud.light === c ? lights[c] : "rgb(255 255 255 / 0.1)", boxShadow: hud.light === c ? `0 0 10px ${lights[c]}` : undefined }} />
          ))}
          <span className="font-display text-[10px] font-bold text-cream/70 tabular">{Math.round(hud.lightDistance)}m</span>
        </div>

        <div className="relative size-40 short:size-32">
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden="true">
            <defs>
              <radialGradient id="dial-face" cx="50%" cy="45%" r="60%">
                <stop offset="0%" stopColor="#252B38" />
                <stop offset="100%" stopColor="#10131A" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="96" fill="url(#dial-face)" opacity="0.92" />
            <circle cx="100" cy="100" r="96" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="2" />
            <path d={arc(START, START + SWEEP, R)} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="10" strokeLinecap="round" />
            {/* Past the limit, the arc runs red. */}
            <path d={arc(limitDeg, START + SWEEP, R)} fill="none" stroke="rgb(255 90 79 / 0.28)" strokeWidth="10" strokeLinecap="round" />
            {frac > 0.005 && (
              <path d={arc(START, needle, R)} fill="none" stroke={hud.boosting ? "var(--color-sky)" : over ? "var(--color-coral)" : "var(--color-sun)"} strokeWidth="10" strokeLinecap="round" />
            )}
            {TICKS.map((v) => {
              const deg = START + (SWEEP * v) / MAX_KMH;
              const major = v % 20 === 0;
              const [x1, y1] = polar(deg, major ? 66 : 69);
              const [x2, y2] = polar(deg, 73);
              const [lx, ly] = polar(deg, 55);
              return (
                <g key={v}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(255 246 229 / 0.6)" strokeWidth={major ? 2.4 : 1.2} />
                  {major && (
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="rgb(255 246 229 / 0.55)" className="font-display">
                      {v}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Needle. */}
            <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: "100px 100px", transition: "transform 90ms linear" }}>
              <path d="M 97.5 104 L 100 26 L 102.5 104 Z" fill="var(--color-coral)" />
            </g>
            <circle cx="100" cy="100" r="7" fill="#2A3040" stroke="rgb(255 255 255 / 0.25)" />
          </svg>
          <div className="absolute inset-x-0 top-[58%] flex flex-col items-center">
            <span className="font-display text-3xl leading-none font-extrabold tabular text-cream short:text-2xl">{Math.round(kmh)}</span>
            <span className="font-display text-[10px] font-bold tracking-wide text-cream/55">{t.ride.kmh}</span>
          </div>
          <span
            className="absolute top-[34%] left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-lg bg-night font-display text-sm font-extrabold text-sun ring-1 ring-white/15"
            aria-label={`gear ${hud.gear}`}
          >
            {hud.gear === 0 ? "N" : hud.gear}
          </span>
        </div>

        {/* The road's speed limit, as on the signs. */}
        <div
          className={cn("mb-6 grid size-11 place-items-center rounded-full border-[5px] border-[#D7261E] bg-white font-display text-base font-extrabold text-night shadow-lg", over && "animate-pulse ring-4 ring-coral/60")}
          aria-label={`limit ${hud.limitKmh}`}
        >
          {hud.limitKmh}
        </div>
      </div>

      <div className="-mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-night/80 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur">
        <Gauge value={hud.fuel} icon={<Fuel />} tone="bg-forest-400" label={t.ride.fuel} warn={hud.fuel < 0.15} text={`${hud.fuelLiters.toFixed(1)}L`} />
        <Gauge value={hud.boost} icon={<Zap />} tone="bg-sky" label={t.ride.boost} />
        <Gauge value={1 - hud.damage / 100} icon={<Wrench />} tone="bg-sun" label={t.ride.damage} warn={hud.damage > 70} />
        <Lightbulb className={cn("size-4", hud.headlight ? "text-sky-300 drop-shadow-[0_0_4px_rgb(0_163_221)]" : "text-cream/25")} aria-label={hud.headlight ? "headlight on" : "headlight off"} />
      </div>
    </div>
  );
}
