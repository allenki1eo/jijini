"use client";

import { m } from "motion/react";
import { Building2, Check, Coins, Lock, MapPin, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Chip } from "@/components/ui";
import { CITIES, CITY_ORDER, type CityId } from "@/data/cities/config";
import type { CityManifest } from "@/game/world/format";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer } from "@/stores/player";
import { ScreenHeader } from "./ScreenHeader";

type Preview = { c: number; p: number[] }[];

interface CityData {
  manifest: CityManifest | null;
  preview: Preview;
}

const ROAD_WIDTH = [11, 9, 7, 4.5];

/** Stylized map drawn from the city's real major roads. */
function CityMap({ preview, accent, locked }: { preview: Preview; accent: string; locked: boolean }) {
  return (
    <svg viewBox="0 0 1000 1000" className={cn("absolute inset-0 size-full", locked && "opacity-40 grayscale")} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1000" height="1000" fill="#1D1714" />
      {[...preview]
        .sort((a, b) => b.c - a.c)
        .map((road, i) => (
          <polyline
            key={i}
            points={road.p.join(" ")}
            fill="none"
            stroke={road.c <= 1 ? accent : road.c === 2 ? "#E8D9B0" : "#8A7766"}
            strokeWidth={ROAD_WIDTH[road.c] ?? 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={road.c <= 1 ? 1 : 0.8}
          />
        ))}
      <circle cx="500" cy="500" r="26" fill={accent} stroke="#10131A" strokeWidth="10" />
    </svg>
  );
}

export function CitySelectScreen() {
  const t = useT();
  const router = useRouter();
  const p = usePlayer();
  const [data, setData] = useState<Partial<Record<CityId, CityData>>>({});

  useEffect(() => {
    let cancelled = false;
    for (const id of CITY_ORDER) {
      Promise.all([
        fetch(`/cities/${id}/manifest.json`).then((r) => (r.ok ? (r.json() as Promise<CityManifest>) : null)),
        fetch(`/cities/${id}/preview.json`).then((r) => (r.ok ? (r.json() as Promise<Preview>) : [])),
      ])
        .then(([manifest, preview]) => !cancelled && setData((d) => ({ ...d, [id]: { manifest, preview } })))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const ride = (id: CityId) => {
    p.patch({ lastCity: id });
    router.push(`/play?city=${id}`);
  };

  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgb(0_163_221/0.15),transparent_60%)]" />
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-6xl flex-col gap-5 py-4">
        <ScreenHeader title={t.cities.title} />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CITY_ORDER.map((id, i) => {
            const city = CITIES[id];
            const d = data[id];
            const unlocked = p.cities.includes(id);
            const levelOk = p.level >= city.unlock.level;
            const canBuy = !unlocked && levelOk && p.wallet >= city.unlock.price;
            const earned = p.cityEarnings[id] ?? 0;
            return (
              <m.li
                key={id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={cn("flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-night-800 ring-1", p.lastCity === id ? "ring-sun" : "ring-white/8")}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {d && <CityMap preview={d.preview} accent={city.accent} locked={!unlocked} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-night-800 via-transparent to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <Chip size="sm" tone="night">
                      {t.cities.difficulty[city.difficulty - 1]}
                    </Chip>
                    {p.lastCity === id && (
                      <Chip size="sm" tone="sun" icon={<MapPin />}>
                        {t.cities.current}
                      </Chip>
                    )}
                  </div>
                  {!unlocked && <Lock className="absolute top-3 right-3 size-6 text-cream/70" />}
                  <div className="absolute bottom-3 left-4">
                    <h2 className="sticker text-4xl leading-none">{city.name}</h2>
                    <p className="text-sm text-cream/75">{t.cities.regions[id]}</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex gap-1" aria-label={t.cities.difficulty[city.difficulty - 1]}>
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className={cn("h-2 flex-1 rounded-full", n <= city.difficulty ? "bg-coral" : "bg-night-600")} />
                    ))}
                  </div>
                  <div className="grid gap-1 text-sm text-cream/70">
                    {d?.manifest && (
                      <p className="flex items-center gap-2">
                        <Building2 className="size-4" /> {fmt(t.cities.buildings, { n: formatTzs(d.manifest.stats.buildings) })}
                      </p>
                    )}
                    {earned > 0 && (
                      <p className="flex items-center gap-2 text-sun-300">
                        <Coins className="size-4" /> {fmt(t.cities.best, { amount: formatTzs(earned) })}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto">
                    {!d?.manifest ? (
                      <Button variant="night" disabled block>
                        {t.cities.soon}
                      </Button>
                    ) : unlocked ? (
                      <Button variant="sun" size="lg" block icon={<Play />} onClick={() => ride(id)}>
                        {t.cities.play}
                      </Button>
                    ) : !levelOk ? (
                      <Button variant="night" disabled block icon={<Lock />}>
                        {fmt(t.cities.needLevel, { level: city.unlock.level })}
                      </Button>
                    ) : (
                      <Button
                        variant="forest"
                        block
                        icon={<Check />}
                        disabled={!canBuy}
                        onClick={() => {
                          if (p.spend(city.unlock.price)) p.unlockCity(id);
                        }}
                      >
                        {fmt(t.cities.unlock, { price: formatTzs(city.unlock.price) })}
                      </Button>
                    )}
                  </div>
                </div>
              </m.li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
