"use client";

import { Hand, ListOrdered, LogOut, UserCheck, UserRoundX } from "lucide-react";
import { useHudTick } from "@/components/hud/useHudTick";
import type { Game } from "@/game/core/Game";
import { hud } from "@/game/core/hud";
import { stageHud } from "@/game/world/KijiweStage";
import { fmt, useT } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * The kijiwe stage, while the rider is parked there without a job: join the
 * line and wait your turn, or jump it and take the customer (the other
 * riders won't like that).
 */
export function StagePanel({ game }: { game: Game }) {
  useHudTick(5);
  const t = useT();
  const h = stageHud;
  if (!h.inZone || hud.speedKmh >= 6) return null;
  const yourTurn = h.joined && h.position <= 1 && h.customer;
  const canSteal = h.customer && !yourTurn;

  return (
    <div className="pointer-events-auto flex w-64 flex-col gap-2 rounded-2xl bg-night-800/92 p-3 shadow-xl ring-1 ring-sun/40 backdrop-blur max-sm:w-full max-sm:max-w-[15rem] max-sm:gap-1.5 max-sm:p-2.5">
      <div className="flex items-start gap-2">
        <ListOrdered className="mt-0.5 size-5 shrink-0 text-sun" />
        <div className="min-w-0">
          <p className="font-display leading-tight font-extrabold text-sun">{t.stage.title}</p>
          <p className={cn("text-xs text-cream/60", h.banned <= 0 && "max-sm:hidden")}>{h.banned > 0 ? fmt(t.stage.bannedFor, { min: Math.ceil(h.banned / 60) }) : t.stage.hint}</p>
        </div>
      </div>

      {/* The line: parked riders, then you. */}
      <div className="flex items-center gap-1 rounded-xl bg-white/5 px-2 py-1.5" aria-label={fmt(t.stage.riders, { n: h.riders })}>
        {Array.from({ length: h.riders }, (_, i) => (
          <span key={i} className="grid size-6 place-items-center rounded-full bg-night-500 text-[10px] font-bold text-cream/70">
            {i + 1}
          </span>
        ))}
        {h.joined && <span className="grid size-6 place-items-center rounded-full bg-sun text-[10px] font-extrabold text-night">{h.position}</span>}
        {h.customer && <Hand className="ml-auto size-4 animate-pulse text-forest-400" aria-label={t.stage.waiting} />}
      </div>
      <p className={cn("text-sm font-semibold", yourTurn ? "text-forest-400" : "text-cream/75")}>
        {yourTurn ? t.stage.yourTurn : h.joined ? fmt(t.stage.position, { n: h.position }) : h.customer ? t.stage.waiting : fmt(t.stage.riders, { n: h.riders })}
      </p>

      {yourTurn ? (
        <button type="button" onClick={() => game.stageTake(false)} className="chunky flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest font-display font-extrabold text-cream [--edge:var(--color-forest-800)]">
          <UserCheck className="size-5" /> {t.stage.take}
        </button>
      ) : h.joined ? (
        <button type="button" onClick={() => game.stageLeave()} className="chunky flex min-h-10 items-center justify-center gap-2 rounded-xl bg-night-600 font-display text-sm font-bold text-cream ring-1 ring-white/10 [--edge:var(--color-night)]">
          <LogOut className="size-4" /> {t.stage.leave}
        </button>
      ) : (
        <button
          type="button"
          disabled={h.banned > 0}
          onClick={() => game.stageJoin()}
          className="chunky flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sun font-display font-extrabold text-night [--edge:var(--color-sun-800)] disabled:opacity-45"
        >
          <ListOrdered className="size-5" /> {t.stage.join}
        </button>
      )}
      {canSteal && (
        <button type="button" onClick={() => game.stageTake(true)} className="flex items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold text-coral ring-1 ring-coral/40 transition-colors hover:bg-coral/15">
          <UserRoundX className="size-4" /> {t.stage.steal}
          <span className="sr-only">— {t.stage.stealHint}</span>
        </button>
      )}
    </div>
  );
}
