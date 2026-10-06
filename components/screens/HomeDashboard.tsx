"use client";

import { ChevronRight, Flame, Gift, Lock, Map as MapIcon, Medal, Route, Sparkles, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CITIES, CITY_ORDER } from "@/data/cities/config";
import { ACHIEVEMENTS, CHALLENGE_BY_ID, STREAK_REWARDS, claimStreak, dayKey, ensureChallenges, streakReward, touchStreak } from "@/game/systems/progression";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer, xpForLevel } from "@/stores/player";

/** Rank title index for a level. */
const rankOf = (level: number) => (level >= 12 ? 4 : level >= 8 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0);

/** Level badge: the number inside a ring that fills with XP. */
export function LevelRing({ level, progress, className }: { level: number; progress: number; className?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative grid size-16 shrink-0 place-items-center short:size-12", className)}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="var(--color-night)" stroke="rgb(255 255 255 / 0.1)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="url(#xp-ring)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0.03, progress)))} className="transition-[stroke-dashoffset] duration-700" />
        <defs>
          <linearGradient id="xp-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-sun)" />
            <stop offset="100%" stopColor="var(--color-forest-400)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="relative font-display text-2xl leading-none font-extrabold text-sun tabular short:text-lg">{level}</span>
    </div>
  );
}

/** Who you are on the road: level, rank, XP to go and the day streak. */
export function RiderCard() {
  const t = useT();
  const level = usePlayer((s) => s.level);
  const xp = usePlayer((s) => s.xp);
  const streak = usePlayer((s) => s.streak.count);
  const need = xpForLevel(level);
  const frac = Math.min(1, xp / need);
  return (
    <div className="flex items-center gap-3 rounded-[1.4rem] bg-night-700/80 p-2.5 pr-4 ring-1 ring-white/10 backdrop-blur short:p-1.5 short:pr-3">
      <LevelRing level={level} progress={frac} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-tight font-extrabold short:text-base">{t.home.ranks[rankOf(level)]}</p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-night-500" aria-hidden="true">
          <div className="animate-fill h-full origin-left rounded-full bg-gradient-to-r from-sun to-forest-400" style={{ width: `${Math.max(4, frac * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs text-cream/60 tabular short:hidden">{fmt(t.home.toNext, { n: Math.max(0, need - xp), level: level + 1 })}</p>
      </div>
      {streak > 0 && (
        <span className="flex shrink-0 flex-col items-center rounded-2xl bg-coral/15 px-2.5 py-1 text-coral ring-1 ring-coral/30" title={fmt(t.home.streak, { n: streak })}>
          <Flame className="size-5 fill-coral/40" />
          <span className="font-display text-sm leading-none font-extrabold tabular">{streak}</span>
        </span>
      )}
    </div>
  );
}

function Panel({ title, icon, action, children, className }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[1.4rem] bg-night-800/85 p-3.5 ring-1 ring-white/10 backdrop-blur-md short:p-2.5", className)}>
      <header className="mb-2.5 flex items-center gap-2 short:mb-1.5">
        <span className="grid size-7 place-items-center rounded-xl bg-white/8 [&_svg]:size-4">{icon}</span>
        <h2 className="flex-1 font-display text-base leading-none font-extrabold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Seven days of rewards: come back every day and they grow. */
function DailyReward() {
  const t = useT();
  const streak = usePlayer((s) => s.streak);
  const [burst, setBurst] = useState<number | null>(null);
  const today = dayKey();
  const claimable = streak.lastDay === today && streak.claimedDay !== today;
  // Where today sits on the 7-day track (the track loops after a week).
  const slot = (Math.max(streak.count, 1) - 1) % STREAK_REWARDS.length;

  const claim = () => {
    const reward = claimStreak();
    if (reward) setBurst(reward);
  };

  return (
    <Panel
      title={t.home.reward}
      icon={<Gift className="text-sun" />}
      action={
        streak.count > 0 && (
          <span className="flex items-center gap-1 font-display text-xs font-bold text-coral">
            <Flame className="size-3.5 fill-coral/40" /> {fmt(t.home.streak, { n: streak.count })}
          </span>
        )
      }
    >
      <ol className="grid grid-cols-7 gap-1.5" aria-label={t.home.streakHint}>
        {STREAK_REWARDS.map((reward, i) => {
          const done = i < slot || (i === slot && !claimable);
          const now = i === slot && claimable;
          return (
            <li
              key={i}
              className={cn(
                "relative flex aspect-[4/5] flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold ring-1 transition-colors short:aspect-square",
                done ? "bg-sun/90 text-night ring-sun" : now ? "bg-sun/15 text-sun ring-2 ring-sun" : "bg-white/5 text-cream/45 ring-white/8",
              )}
            >
              {i === 6 ? <Gift className="size-4" /> : <span className={cn("size-3 rounded-full", done ? "bg-night/70" : now ? "animate-pulse bg-sun" : "bg-cream/20")} />}
              <span className="font-display leading-none tabular short:hidden">{reward >= 1000 ? `${reward / 1000}k` : reward}</span>
            </li>
          );
        })}
      </ol>
      <div className="relative mt-2.5 short:mt-1.5">
        <button
          type="button"
          onClick={claim}
          disabled={!claimable}
          className={cn(
            "chunky relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-2.5 font-display text-base font-extrabold short:py-1.5",
            claimable ? "bg-sun text-night [--edge:var(--color-sun-800)]" : "bg-night-600 text-cream/50 [--edge:var(--color-night)]",
          )}
        >
          {claimable && <span className="animate-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/40" aria-hidden="true" />}
          {claimable ? (
            <>
              <Sparkles className="size-4" /> {t.home.claim} +TSh {formatTzs(streakReward(streak.count))}
            </>
          ) : (
            t.home.claimed
          )}
        </button>
        {burst !== null && (
          <span key={burst} className="animate-fade-up pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 font-display text-xl font-extrabold text-sun drop-shadow-[0_2px_0_var(--color-night)]" onAnimationEnd={() => setBurst(null)}>
            +TSh {formatTzs(burst)}
          </span>
        )}
      </div>
    </Panel>
  );
}

/** Today's three challenges at a glance; tap through to claim. */
function TodayChallenges() {
  const t = useT();
  const daily = usePlayer((s) => s.daily);
  if (!daily) return null;
  const rows = daily.ids.map((id, i) => ({ id, def: CHALLENGE_BY_ID[id], progress: daily.progress[i]!, claimed: daily.claimed[i]! }));
  const allClaimed = rows.every((r) => r.claimed);
  const ready = rows.some((r) => !r.claimed && r.def && r.progress >= r.def.target);
  return (
    <Panel
      title={t.home.today}
      icon={<Target className="text-sky-300" />}
      action={
        <Link href="/daily" className="flex items-center gap-0.5 rounded-full px-2 py-1 font-display text-xs font-bold text-cream/60 hover:bg-white/5 hover:text-cream" aria-label={t.menu.daily}>
          {ready && <span className="mr-1 size-2 animate-pulse rounded-full bg-sun" />}
          <ChevronRight className="size-4" />
        </Link>
      }
    >
      {allClaimed ? (
        <p className="flex items-center gap-2 rounded-xl bg-forest/25 px-3 py-2 text-sm font-semibold text-forest-400">
          <Trophy className="size-4" /> {t.home.allDone}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 short:gap-1">
          {rows.map(({ id, def, progress, claimed }) => {
            if (!def) return null;
            const frac = Math.min(1, progress / def.target);
            const done = frac >= 1;
            return (
              <li key={id}>
                <Link href="/daily" className={cn("block rounded-xl px-2.5 py-1.5 ring-1 transition-colors", done && !claimed ? "bg-sun/10 ring-sun/50" : "ring-transparent hover:bg-white/5")}>
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className={cn("truncate font-semibold", claimed && "text-cream/40 line-through")}>{t.progress.challenges[id as keyof typeof t.progress.challenges]}</span>
                    <span className="shrink-0 font-display text-xs font-bold text-sun tabular">{done && !claimed ? t.home.ready : `+${formatTzs(def.reward)}`}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-night-500">
                    <span className={cn("block h-full rounded-full transition-[width] duration-700", done ? "bg-sun" : "bg-sky")} style={{ width: `${Math.max(3, frac * 100)}%` }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Cities, medals and trips: the collection so far, and the next city to open. */
function Journey() {
  const t = useT();
  const cities = usePlayer((s) => s.cities);
  const level = usePlayer((s) => s.level);
  const medals = usePlayer((s) => Object.keys(s.achievements).length);
  const trips = usePlayer((s) => s.stats.deliveries);
  const next = CITY_ORDER.map((id) => CITIES[id]).find((c) => !cities.includes(c.id));
  const stats = [
    { icon: <MapIcon className="text-forest-400" />, value: `${cities.length}/${CITY_ORDER.length}`, label: t.home.cities },
    { icon: <Medal className="text-sun" />, value: `${medals}/${ACHIEVEMENTS.length}`, label: t.home.medals },
    { icon: <Route className="text-sky-300" />, value: String(trips), label: t.home.trips },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 rounded-2xl bg-night-800/85 px-1 py-2 ring-1 ring-white/10 backdrop-blur-md short:py-1.5">
            <span className="[&_svg]:size-4">{s.icon}</span>
            <span className="font-display text-lg leading-none font-extrabold tabular">{s.value}</span>
            <span className="text-[11px] text-cream/55">{s.label}</span>
          </div>
        ))}
      </div>
      <Link
        href="/cities"
        className="group relative flex items-center gap-3 overflow-hidden rounded-[1.4rem] bg-night-800/85 p-3 ring-1 ring-white/10 backdrop-blur-md short:p-2"
        style={next ? { boxShadow: `inset 4px 0 0 ${next.accent}` } : undefined}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl" style={{ background: next ? `${next.accent}33` : "rgb(46 158 91 / 0.2)", color: next?.accent ?? "#2A9B74" }}>
          {next ? <Lock className="size-5" /> : <Trophy className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold tracking-wide text-cream/50 uppercase">{t.home.nextCity}</span>
          {next ? (
            <>
              <span className="block truncate font-display text-lg leading-tight font-extrabold">
                {next.name} <span className="text-sm font-semibold text-cream/50">· {next.region}</span>
              </span>
              <span className="mt-1 flex items-center gap-2 text-xs text-cream/60 tabular">
                <span className={cn(level >= next.unlock.level ? "text-forest-400" : "")}>{fmt(t.home.needLevel, { level: next.unlock.level })}</span>
                {next.unlock.price > 0 && <span>· TSh {formatTzs(next.unlock.price)}</span>}
              </span>
            </>
          ) : (
            <span className="block font-display text-lg leading-tight font-extrabold">{t.home.allCities}</span>
          )}
        </span>
        <ChevronRight className="size-5 text-cream/40 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/** The right-hand column of the home screen: daily reward, today's challenges and the journey so far. */
export function HomeDashboard() {
  const hydrated = usePlayer((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    touchStreak();
    ensureChallenges();
  }, [hydrated]);
  if (!hydrated) return null;
  return (
    <div className="flex flex-col gap-2.5 short:gap-1.5">
      <DailyReward />
      <TodayChallenges />
      <Journey />
    </div>
  );
}
