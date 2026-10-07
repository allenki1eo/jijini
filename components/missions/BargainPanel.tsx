"use client";

import { Baby, Briefcase, Camera, GraduationCap, HandCoins, ShoppingBasket, User, Users } from "lucide-react";
import { m } from "motion/react";
import { useEffect } from "react";
import { QUOTES } from "@/data/passengers";
import type { Game } from "@/game/core/Game";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useMissions } from "@/stores/missions";

const KIND_ICON = { mama: ShoppingBasket, student: GraduationCap, business: Briefcase, elder: User, kid: Baby, tourist: Camera } as const;
const TONES = ["ring-forest-400/50 hover:bg-forest/25", "ring-sun/50 hover:bg-sun/15", "ring-coral/50 hover:bg-coral/20"];
const AMOUNT_TONES = ["text-forest-400", "text-sun", "text-coral"];

/**
 * "Bei gani?": the passenger at the kerb asks the price before getting on.
 * Quote a discount (they're pleased, sifa up), the going rate, or a high
 * price (they may walk, and charging too much gets talked about). If they
 * turn you down they make an offer of their own. Keys 1–3 on a keyboard.
 */
export function BargainPanel({ game }: { game: Game }) {
  const t = useT();
  const bargain = useMissions((s) => s.bargain);

  useEffect(() => {
    if (!bargain) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (bargain.counter === null) {
        const i = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        if (i >= 0) game.quoteFare(i);
      } else if (e.code === "Digit1" || e.code === "KeyY") game.answerCounter(true);
      else if (e.code === "Digit2" || e.code === "KeyN") game.answerCounter(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bargain, game]);

  if (!bargain) return null;
  const Icon = KIND_ICON[bargain.kind] ?? Users;
  const amounts = QUOTES.map((q) => Math.round((bargain.fare * q) / 100) * 100);

  return (
    <m.div
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="pointer-events-auto flex w-72 flex-col gap-2.5 rounded-2xl bg-night-800/95 p-3 shadow-xl ring-1 ring-sun/40 backdrop-blur"
      role="dialog"
      aria-label={t.bargain.title}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun text-night">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display leading-tight font-extrabold">{bargain.client}</p>
          <p className="truncate text-xs text-cream/55">
            {t.bargain.title} {bargain.to && `→ ${bargain.to}`}
          </p>
        </div>
        <HandCoins className="ml-auto size-5 shrink-0 text-sun" />
      </div>
      <p className="flex items-baseline justify-between rounded-xl bg-white/5 px-2.5 py-1.5 text-xs text-cream/60">
        {t.bargain.going}
        <b className="font-display text-sm text-cream tabular">TSh {formatTzs(bargain.fare)}</b>
      </p>

      {bargain.counter === null ? (
        <div className="flex flex-col gap-1.5">
          {QUOTES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => game.quoteFare(i)}
              className={cn("flex items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-2 text-left ring-1 transition-colors", TONES[i])}
            >
              <kbd className="grid size-6 shrink-0 place-items-center rounded-md bg-night-500 font-display text-xs font-bold">{i + 1}</kbd>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm leading-tight font-extrabold">{t.bargain.quotes[i]}</span>
                <span className="block truncate text-[11px] text-cream/55">{t.bargain.hints[i]}</span>
              </span>
              <b className={cn("font-display text-base tabular", AMOUNT_TONES[i])}>{formatTzs(amounts[i]!)}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-center font-display text-lg font-extrabold text-sun">{fmt(t.bargain.counter, { amount: `TSh ${formatTzs(bargain.counter)}` })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => game.answerCounter(true)} className="chunky min-h-11 rounded-xl bg-forest font-display text-sm font-extrabold text-cream [--edge:var(--color-forest-800)]">
              {fmt(t.bargain.accept, { amount: formatTzs(bargain.counter) })}
            </button>
            <button type="button" onClick={() => game.answerCounter(false)} className="chunky min-h-11 rounded-xl bg-night-600 font-display text-sm font-extrabold text-cream ring-1 ring-white/10 [--edge:var(--color-night)]">
              {t.bargain.decline}
            </button>
          </div>
        </div>
      )}
    </m.div>
  );
}
