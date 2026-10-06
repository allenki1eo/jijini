"use client";

import { m } from "motion/react";
import {
  Bike,
  CalendarCheck,
  Camera,
  CheckCircle2,
  CloudRain,
  Compass,
  Coins,
  Crown,
  Gem,
  Gift,
  HardHat,
  Heart,
  Lock,
  Map as MapIcon,
  Medal,
  Moon,
  Route,
  ShieldCheck,
  Siren,
  Star,
  TrendingUp,
  Trophy,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Chip, Segmented } from "@/components/ui";
import { ACHIEVEMENTS, CHALLENGE_BY_ID, claimChallenge, ensureChallenges } from "@/game/systems/progression";
import { formatClock } from "@/components/missions/stopLabel";
import { CITIES, CITY_ORDER, isCityId } from "@/data/cities/config";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer, type ChallengeState } from "@/stores/player";
import { ScreenHeader } from "./ScreenHeader";

const ICONS: Record<string, LucideIcon> = {
  bike: Bike,
  route: Route,
  medal: Medal,
  crown: Crown,
  zap: Zap,
  "trending-up": TrendingUp,
  siren: Siren,
  "cloud-rain": CloudRain,
  moon: Moon,
  star: Star,
  heart: Heart,
  coins: Coins,
  gem: Gem,
  wind: Wind,
  trophy: Trophy,
  map: MapIcon,
  compass: Compass,
  "hard-hat": HardHat,
  camera: Camera,
  "shield-check": ShieldCheck,
};

const TONE: Record<string, string> = {
  sun: "from-sun to-sun-600 text-night",
  forest: "from-forest-400 to-forest text-cream",
  sky: "from-sky-300 to-sky text-night",
  coral: "from-coral to-coral-700 text-cream",
};

function ChallengeList({ which, state }: { which: "daily" | "weekly"; state: ChallengeState | null }) {
  const t = useT();
  if (!state) return null;
  return (
    <ul className="flex flex-col gap-3">
      {state.ids.map((id, i) => {
        const def = CHALLENGE_BY_ID[id];
        if (!def) return null;
        const progress = Math.min(state.progress[i]!, def.target);
        const done = progress >= def.target;
        const claimed = state.claimed[i]!;
        return (
          <li key={id} className="flex items-center gap-4 rounded-2xl bg-night-700 p-4 ring-1 ring-white/6">
            <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", done ? "bg-forest text-sun" : "bg-night-600 text-cream/70")}>
              {done ? <CheckCircle2 className="size-6" /> : <CalendarCheck className="size-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight font-bold">{t.progress.challenges[id as keyof typeof t.progress.challenges]}</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-night-500">
                  <div className="h-full rounded-full bg-sun transition-[width] duration-500" style={{ width: `${(progress / def.target) * 100}%` }} />
                </div>
                <span className="font-display text-sm font-bold text-cream/70 tabular">
                  {formatTzs(Math.floor(progress))}/{formatTzs(def.target)}
                </span>
              </div>
            </div>
            <Button variant={claimed ? "ghost" : done ? "sun" : "night"} disabled={!done || claimed} icon={<Gift />} onClick={() => claimChallenge(which, i)} className="shrink-0">
              {claimed ? t.progress.claimed : `+${formatTzs(def.reward)}`}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function ProgressScreen() {
  const t = useT();
  const [tab, setTab] = useState<"challenges" | "achievements" | "records">("challenges");
  const bests = usePlayer((s) => s.bests);
  const cityEarnings = usePlayer((s) => s.cityEarnings);
  const daily = usePlayer((s) => s.daily);
  const weekly = usePlayer((s) => s.weekly);
  const unlocked = usePlayer((s) => s.achievements);
  const hydrated = usePlayer((s) => s.hydrated);

  useEffect(() => {
    if (hydrated) ensureChallenges();
  }, [hydrated]);

  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;

  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_0%_0%,rgb(255_199_44/0.18),transparent_60%)]" />
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-4xl flex-col gap-5 py-4">
        <ScreenHeader
          title={t.progress.title}
          action={
            <Segmented
              label={t.progress.title}
              value={tab}
              onChange={setTab}
              options={[
                { value: "challenges", label: t.progress.daily, icon: <CalendarCheck /> },
                { value: "achievements", label: t.progress.achievements, icon: <Trophy /> },
                { value: "records", label: t.progress.records, icon: <Medal /> },
              ]}
            />
          }
        />

        {tab === "records" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card pattern className="p-5">
              <h2 className="mb-3 font-display text-2xl font-extrabold">{t.progress.records}</h2>
              {Object.keys(bests).length === 0 ? (
                <p className="text-cream/60">{t.progress.noRecords}</p>
              ) : (
                <ul className="grid gap-2">
                  {Object.entries(bests)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([course, best]) => {
                      const [city, , n] = course.split("-");
                      return (
                        <li key={course} className="flex items-center justify-between rounded-2xl bg-night-700 px-4 py-3">
                          <span className="font-display font-bold">{fmt(t.progress.course, { city: city && isCityId(city) ? CITIES[city].name : city ?? "", n: Number(n ?? 0) + 1 })}</span>
                          <span className="font-display text-xl font-extrabold text-sun tabular">{formatClock(best.time)}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Card>
            <Card pattern className="p-5">
              <h2 className="mb-3 font-display text-2xl font-extrabold">{t.progress.earnings}</h2>
              <ul className="grid gap-2">
                {CITY_ORDER.map((id) => (
                  <li key={id} className="flex items-center justify-between rounded-2xl bg-night-700 px-4 py-3">
                    <span className="font-display font-bold">{CITIES[id].name}</span>
                    <span className="font-display text-xl font-extrabold tabular">
                      {formatTzs(cityEarnings[id] ?? 0)} <span className="text-sm text-cream/50">{t.common.tzs}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : tab === "challenges" ? (
          <div className="grid gap-5">
            <Card pattern className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-2xl font-extrabold">{t.progress.daily}</h2>
                <Chip size="sm">{t.progress.resets}</Chip>
              </div>
              <ChallengeList which="daily" state={daily} />
            </Card>
            <Card pattern className="p-5">
              <h2 className="mb-3 font-display text-2xl font-extrabold">{t.progress.weekly}</h2>
              <ChallengeList which="weekly" state={weekly} />
            </Card>
          </div>
        ) : (
          <Card pattern className="p-5">
            <p className="mb-4 font-display text-lg font-bold text-cream/70">{fmt(t.progress.unlocked, { n: count, total: ACHIEVEMENTS.length })}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ACHIEVEMENTS.map((a, i) => {
                const Icon = ICONS[a.icon] ?? Trophy;
                const got = Boolean(unlocked[a.id]);
                return (
                  <m.li
                    key={a.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn("flex flex-col items-center gap-2 rounded-2xl p-4 text-center ring-1", got ? "bg-night-700 ring-sun/30" : "bg-night-800 ring-white/6")}
                  >
                    <span className={cn("relative grid size-16 place-items-center rounded-full bg-gradient-to-br shadow-lg", got ? TONE[a.tone] : "from-night-500 to-night-600 text-cream/30")}>
                      <span className="absolute inset-1 rounded-full ring-2 ring-white/25" />
                      {got ? <Icon className="size-7" /> : <Lock className="size-6" />}
                    </span>
                    <p className={cn("font-display leading-tight font-bold", !got && "text-cream/60")}>{t.progress.achievementTitles[a.id as keyof typeof t.progress.achievementTitles]}</p>
                    <p className="text-xs text-cream/55">{t.progress.achievementHints[a.id as keyof typeof t.progress.achievementHints]}</p>
                  </m.li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </main>
  );
}
