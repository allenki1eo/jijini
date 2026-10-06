"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowRight, Bike, Star } from "lucide-react";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { Button } from "@/components/ui";
import type { MissionResult } from "@/game/missions/types";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer, xpForLevel } from "@/stores/player";
import { useMissions } from "@/stores/missions";
import { Confetti } from "./Confetti";
import { MISSION_ACCENT, MissionIcon } from "./MissionIcon";
import { useCountUp } from "./useCountUp";

function Row({ label, value, delay, tone }: { label: string; value: number; delay: number; tone?: string }) {
  const v = useCountUp(Math.abs(value), 700, delay);
  if (!value) return null;
  return (
    <m.div className="flex items-center justify-between py-1.5" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: delay / 1000 }}>
      <dt className="text-cream/75">{label}</dt>
      <dd className={cn("font-display text-lg font-extrabold tabular", tone)}>
        {value < 0 ? "−" : "+"}
        {formatTzs(v)}
      </dd>
    </m.div>
  );
}

function Body({ result, onNext, onClose }: { result: MissionResult; onNext: () => void; onClose: () => void }) {
  const t = useT();
  const total = useCountUp(result.total, 1200, 900);
  const level = usePlayer((s) => s.level);
  const xp = usePlayer((s) => s.xp);
  return (
    <>
      {result.success && <Confetti />}
      <KitengeStrip className="h-3 w-full" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-14 place-items-center rounded-2xl", MISSION_ACCENT[result.type])}>
            <MissionIcon type={result.type} className="size-7" />
          </span>
          <div>
            <h2 className="sticker text-3xl leading-none">{result.success ? t.results.success : t.results.failed}</h2>
            <p className="mt-1 text-cream/70">
              {t.missions.types[result.type]} · {fmt(t.results.time, { s: result.seconds })}
            </p>
          </div>
        </div>

        {result.success ? (
          <div className="flex justify-center gap-1.5" aria-label={`${result.stars}/5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <m.span key={i} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.25 + i * 0.12, type: "spring", stiffness: 500, damping: 18 }}>
                <Star className={cn("size-10", i <= result.stars ? "fill-sun text-sun" : "text-night-500")} />
              </m.span>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-coral/15 p-4 text-center font-display font-bold text-coral">{result.reason ? t.results.reasons[result.reason] : t.results.failed}</p>
        )}

        {result.success && (
          <dl className="divide-y divide-white/6 rounded-2xl bg-night-700 px-4 py-2">
            <Row label={t.results.fare} value={result.fare} delay={200} />
            <Row label={t.results.tip} value={result.tip} delay={350} tone="text-sun-300" />
            <Row label={t.results.combo} value={result.combo} delay={500} tone="text-sky-300" />
            <Row label={t.results.clean} value={result.clean} delay={650} tone="text-forest-400" />
            <Row label={t.results.penalty} value={-result.penalty} delay={800} tone="text-coral" />
            <div className="flex items-center justify-between pt-2.5">
              <dt className="font-display text-lg font-extrabold">{t.results.total}</dt>
              <dd className="font-display text-3xl font-extrabold text-sun tabular">
                {formatTzs(total)} <span className="text-base text-cream/60">{t.common.tzs}</span>
              </dd>
            </div>
          </dl>
        )}

        <div>
          <div className="mb-1 flex justify-between font-display text-sm font-bold text-cream/70">
            <span>
              {t.common.level} {level}
            </span>
            <span className="text-forest-400">+{result.xp} {t.results.xp}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-night-600">
            <m.div className="h-full rounded-full bg-forest-400" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (xp / xpForLevel(level)) * 100)}%` }} transition={{ delay: 1.2, duration: 0.8 }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="night" size="lg" icon={<Bike />} onClick={onClose}>
            {t.results.close}
          </Button>
          <Button variant="sun" size="lg" iconRight={<ArrowRight />} onClick={onNext}>
            {t.results.next}
          </Button>
        </div>
      </div>
    </>
  );
}

/** Delivery result: stars, earnings breakdown with count-ups, XP and the next-job CTA. */
export function ResultsScreen({ onNext }: { onNext: () => void }) {
  const result = useMissions((s) => s.result);
  const set = useMissions((s) => s.set);
  return (
    <AnimatePresence>
      {result && (
        <m.div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-night/65 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <m.div
            role="dialog"
            aria-modal="true"
            className="relative max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-card)] bg-night-800 ring-1 ring-white/10"
            initial={{ scale: 0.85, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
          >
            <Body result={result} onNext={onNext} onClose={() => set({ result: null })} />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
