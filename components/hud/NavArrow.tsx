"use client";

import { ArrowUp, CornerUpLeft, CornerUpRight, Fuel, MapPin, Undo2 } from "lucide-react";
import { formatDistance } from "@/components/missions/stopLabel";
import { navHud, type NavTurn } from "@/game/core/hud";
import { fmt, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useHudTick } from "./useHudTick";

const TURN_ICON: Record<NavTurn, typeof ArrowUp> = { straight: ArrowUp, left: CornerUpLeft, right: CornerUpRight, uturn: Undo2, arrive: MapPin };

/**
 * The direction arrow at the top of the screen: a big arrow that swings to
 * where the road goes next, the next turn and how far it is, and the distance
 * left. Follows the rider's own destination (picked on the map), the job
 * route, or the drive to the nearest sheli when the rider asks for one or
 * the tank is nearly dry.
 */
export function NavArrow() {
  useHudTick(12);
  const t = useT();
  if (!navHud.mode) return null;
  // navHud.angle is kept continuous by the game, so the CSS transition never spins the long way round.
  const angle = (navHud.angle * 180) / Math.PI;

  const fuel = navHud.mode === "fuel";
  const pin = navHud.mode === "pin";
  const TurnIcon = TURN_ICON[navHud.turn];
  const instruction = t.nav[navHud.turn];
  const togo = navHud.turn === "straight" || navHud.turn === "arrive" ? fmt(t.nav.toGo, { d: formatDistance(navHud.distance) }) : `${fmt(t.nav.in, { d: formatDistance(navHud.turnIn) })} · ${fmt(t.nav.toGo, { d: formatDistance(navHud.distance) })}`;
  // To a sheli the card names the station; when the tank ran low on its own it says why first.
  const sub = fuel ? `${navHud.asked ? navHud.label || t.nav.fuelShort : t.nav.fuel} · ${togo}` : pin ? `${navHud.label} · ${togo}` : togo;

  return (
    <div
      className={cn(
        "pointer-events-none flex max-w-full items-center gap-3 rounded-[1.4rem] bg-night/75 py-1.5 pr-4 pl-1.5 shadow-xl ring-1 backdrop-blur-md",
        fuel ? "ring-coral/50" : pin ? "ring-sky/50" : "ring-white/10",
        navHud.turn === "arrive" && "animate-pulse",
      )}
      role="status"
      aria-label={`${instruction}. ${sub}`}
    >
      <div className={cn("relative grid size-14 shrink-0 place-items-center rounded-2xl short:size-11", fuel ? "bg-gradient-to-b from-coral to-coral-700" : pin ? "bg-gradient-to-b from-sky-300 to-sky-700" : "bg-gradient-to-b from-sun-300 to-sun-600")}>
        <svg
          viewBox="0 0 48 48"
          className="size-10 drop-shadow-[0_2px_0_rgb(16_19_26/0.45)] transition-transform duration-150 ease-out short:size-8"
          style={{ transform: `rotate(${angle}deg)` }}
          aria-hidden="true"
        >
          <path d="M24 3 L42 27 L30.5 27 L30.5 44 L17.5 44 L17.5 27 L6 27 Z" fill="#10131A" stroke="#10131A" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M24 7.5 L37.5 25 L28 25 L28 41.5 L20 41.5 L20 25 L10.5 25 Z" fill="#FFF6E5" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-display text-lg leading-tight font-extrabold text-cream short:text-base">
          {fuel && <Fuel className="size-5 shrink-0 text-coral" strokeWidth={2.6} />}
          <TurnIcon className={cn("size-5 shrink-0", fuel ? "text-coral" : pin ? "text-sky" : "text-sun")} strokeWidth={2.6} />
          <span className="truncate">{instruction}</span>
        </p>
        <p className="truncate font-display text-sm font-bold text-cream/65 tabular">{sub}</p>
      </div>
    </div>
  );
}
