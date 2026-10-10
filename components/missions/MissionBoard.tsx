"use client";

import { AnimatePresence, m } from "motion/react";
import { Clock, Coins, MapPinned, RefreshCw, Route, Smartphone, X } from "lucide-react";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { Button } from "@/components/ui";
import type { MissionDef } from "@/game/missions/types";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useMissions } from "@/stores/missions";
import { MISSION_ACCENT, MissionIcon } from "./MissionIcon";
import { ShoppingList } from "./ShoppingList";
import { formatClock, formatDistance, stopLabel } from "./stopLabel";

function RoutePreview({ preview, stops }: { preview: number[]; stops: number }) {
  const d = preview.reduce((acc, v, i) => acc + (i % 2 === 0 ? `${i === 0 ? "M" : "L"}${(v * 100).toFixed(1)} ` : `${(v * 100).toFixed(1)} `), "");
  const sx = (preview[0] ?? 0) * 100, sy = (preview[1] ?? 0) * 100;
  const ex = (preview[preview.length - 2] ?? 0) * 100, ey = (preview[preview.length - 1] ?? 0) * 100;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-full shrink-0 rounded-xl bg-[#2A1F1C] short:h-14" aria-hidden="true">
      <path d={d} fill="none" stroke="#FFC72C" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx} cy={sy} r="4.2" fill="#FFF6E5" stroke="#10131A" strokeWidth="1.5" />
      <circle cx={ex} cy={ey} r="5" fill="#2ED47A" stroke="#10131A" strokeWidth="1.5" />
      {stops > 2 && <text x="96" y="12" textAnchor="end" fontSize="10" fill="#FFF6E5" opacity="0.7">{stops}</text>}
    </svg>
  );
}

function OfferCard({ mission, onAccept }: { mission: MissionDef; onAccept: () => void }) {
  const t = useT();
  const first = mission.stops[0]!;
  const last = mission.stops[mission.stops.length - 1]!;
  return (
    <article className="flex w-[17.5rem] shrink-0 snap-center flex-col overflow-hidden rounded-[1.5rem] bg-night-700 ring-1 ring-white/10 short:max-h-full">
      <header className={cn("flex shrink-0 items-center gap-3 px-4 py-3 short:py-2", MISSION_ACCENT[mission.type])}>
        <MissionIcon type={mission.type} className="size-6" />
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg leading-tight font-extrabold">{t.missions.types[mission.type]}</h3>
          <p className="truncate text-sm font-semibold opacity-80">{mission.client}</p>
        </div>
      </header>
      {/* On short landscape screens the details scroll and the accept button stays pinned below them. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 short:gap-2 short:px-3 short:pt-2.5 short:pb-2">
        <p className="min-h-10 text-sm leading-snug text-cream/80 short:hidden">{fmt(t.missions.blurbs[mission.type], { client: mission.client })}</p>
        {mission.errand ? (
          <div className="rounded-xl bg-night-800 px-3 py-1.5">
            <ShoppingList items={mission.errand.items} compact />
            <p className="flex items-center gap-1.5 border-t border-cream/10 pt-1.5 pb-0.5 text-xs font-semibold text-forest-400">
              <Smartphone className="size-3.5" /> {fmt(t.shop.sent, { amount: formatTzs(mission.errand.advance) })}
            </p>
          </div>
        ) : (
          <RoutePreview preview={mission.preview} stops={mission.stops.length} />
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-cream/50">{t.missions.from}</dt>
            <dd className="truncate font-semibold">{first.kind === "checkpoint" ? t.missions.phase.checkpoint : stopLabel(t, first)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-cream/50">{t.missions.to}</dt>
            <dd className="truncate font-semibold">{last.kind === "checkpoint" ? fmt(t.missions.stops, { n: mission.stops.length }) : stopLabel(t, last)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-night-800 px-1 py-2">
            <Coins className="mx-auto size-4 text-sun" />
            <p className="mt-1 font-display text-base leading-none font-extrabold tabular">{formatTzs(mission.fare)}</p>
          </div>
          <div className="rounded-xl bg-night-800 px-1 py-2">
            <Route className="mx-auto size-4 text-sky-300" />
            <p className="mt-1 font-display text-base leading-none font-extrabold tabular">{formatDistance(mission.distance)}</p>
          </div>
          <div className="rounded-xl bg-night-800 px-1 py-2">
            <Clock className="mx-auto size-4 text-coral" />
            <p className="mt-1 font-display text-base leading-none font-extrabold tabular">{mission.timeLimit ? formatClock(mission.timeLimit) : "∞"}</p>
          </div>
        </div>
        {mission.risks.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="risks">
            {mission.risks.map((r) => (
              <li key={r} className="rounded-full bg-night-500 px-2 py-0.5 font-display text-xs font-bold text-cream/85">
                {t.missions.risks[r]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 px-4 pb-4 short:px-3 short:pb-3">
        <Button variant="sun" size="lg" block onClick={onAccept}>
          {t.missions.accept}
        </Button>
      </div>
    </article>
  );
}

/** The BodaGo app on the rider's phone: swipe through job offers. */
export function MissionBoard({ onAccept, onRefresh }: { onAccept: (m: MissionDef) => void; onRefresh: () => void }) {
  const t = useT();
  const { offers, boardOpen, set } = useMissions();
  return (
    <AnimatePresence>
      {boardOpen && (
        <m.div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-night/60 backdrop-blur-sm sm:items-center short:items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label={t.common.close} className="absolute inset-0 cursor-default" onClick={() => set({ boardOpen: false })} />
          <m.section
            role="dialog"
            aria-modal="true"
            aria-label={t.missions.board}
            className="relative flex max-h-[calc(100dvh-0.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] bg-night-800 ring-1 ring-white/10 sm:rounded-[2rem] short:rounded-t-[1.5rem] short:rounded-b-none"
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <KitengeStrip className="h-3 w-full shrink-0 short:h-2" />
            <header className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-2 short:pt-1.5 short:pb-0">
              <MapPinned className="size-7 text-sun short:size-6" />
              <div className="flex-1">
                <h2 className="font-display text-2xl leading-none font-extrabold short:text-xl">{t.missions.board}</h2>
                <p className="text-sm text-cream/60 short:hidden">{t.missions.boardHint}</p>
              </div>
              <Button variant="night" icon={<RefreshCw />} onClick={onRefresh}>
                <span className="hidden sm:inline">{t.missions.refresh}</span>
              </Button>
              <button type="button" onClick={() => set({ boardOpen: false })} aria-label={t.common.close} className="grid size-12 place-items-center rounded-2xl text-cream/70 hover:bg-white/8">
                <X className="size-6" />
              </button>
            </header>
            <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto px-5 pt-2 pb-5 [scrollbar-width:thin] short:gap-3 short:pt-1.5 short:pb-2">
              {offers.length === 0 && <p className="py-10 text-cream/60">{t.missions.none}</p>}
              {offers.map((offer) => (
                <OfferCard key={offer.id} mission={offer} onAccept={() => onAccept(offer)} />
              ))}
            </div>
          </m.section>
        </m.div>
      )}
    </AnimatePresence>
  );
}
