"use client";

import { Activity, Bike, Building2, Landmark, Church, Clock, Coins, Fuel, Gauge, Map as MapIcon, MapPin, Medal, Megaphone, Play, Radio, Route, School, ShoppingBasket, Store, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveStats } from "@/app/api/stats/route";
import { Logo } from "@/components/brand/Logo";
import { Segmented } from "@/components/ui";
import { BUSINESSES } from "@/data/ads";
import { CITIES, CITY_ORDER, type CityId } from "@/data/cities/config";
import { ACHIEVEMENTS } from "@/game/systems/progression";
import { MISSION_TYPES } from "@/game/missions/types";
import { BIKES } from "@/game/vehicles/bikes";
import type { CityManifest } from "@/game/world/format";
import { fmt, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSettings } from "@/stores/settings";

const REFRESH_MS = 30_000;
const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function Tile({ icon: Icon, label, value, accent = "text-sun", big }: { icon: LucideIcon; label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-[1.4rem] bg-night-800/90 p-4 ring-1 ring-white/10">
      <span className="flex items-center gap-2 text-xs font-bold tracking-wide text-cream/55 uppercase">
        <Icon className={cn("size-4", accent)} /> {label}
      </span>
      <span className={cn("font-display leading-none font-extrabold text-cream tabular", big ? "text-5xl" : "text-3xl")}>{value}</span>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="font-display text-2xl font-extrabold">{title}</h2>
        {hint && <p className="text-sm text-cream/55">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** Rides per day: one series, so one colour and no legend; the card title names it. Hover a day for its numbers. */
function DailyBars({ days }: { days: LiveStats["sessions"]["days"] }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.sessions));
  const W = 560, H = 180, PAD_L = 34, PAD_B = 22, GAP = 2;
  const bw = (W - PAD_L) / days.length;
  const ticks = [0, Math.ceil(max / 2), max];
  const label = (day: string) => `${day.slice(6, 8)}/${day.slice(4, 6)}`;
  return (
    <figure className="relative rounded-[1.4rem] bg-night-800/90 p-4 ring-1 ring-white/10">
      <figcaption className="mb-2 font-display text-base font-extrabold">{t.stats.daily}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.stats.daily} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => {
          const y = H - PAD_B - (v / max) * (H - PAD_B - 8);
          return (
            <g key={v}>
              <line x1={PAD_L} x2={W} y1={y} y2={y} stroke="rgb(255 246 229 / 0.08)" />
              <text x={PAD_L - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="rgb(255 246 229 / 0.5)">
                {compact.format(v)}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const h = (d.sessions / max) * (H - PAD_B - 8);
          const x = PAD_L + i * bw + GAP / 2;
          const w = bw - GAP;
          const y = H - PAD_B - h;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${label(d.day)}: ${fmt(t.stats.tip, { n: nf.format(d.sessions), p: nf.format(d.players) })}`}>
              {/* A full-height hit target, bigger than the bar. */}
              <rect x={x} y={8} width={w} height={H - PAD_B - 8} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - PAD_B} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, w / 2)},${y} H${x + w - Math.min(4, w / 2)} Q${x + w},${y} ${x + w},${y + Math.min(4, h)} V${H - PAD_B} Z`} fill={hover === null || hover === i ? "#FFC72C" : "rgb(255 199 44 / 0.45)"} />}
              {(i % 2 === days.length % 2 || i === days.length - 1) && (
                <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="rgb(255 246 229 / 0.5)">
                  {label(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && days[hover] && (
        <div
          className="pointer-events-none absolute top-12 -translate-x-1/2 rounded-xl bg-night px-3 py-2 text-xs shadow-xl ring-1 ring-white/15"
          style={{ left: `calc(${((PAD_L + (hover + 0.5) * bw) / W) * 100}% )` }}
        >
          <p className="font-display font-extrabold text-cream">{label(days[hover]!.day)}</p>
          <p className="text-cream/75 tabular">{fmt(t.stats.tip, { n: nf.format(days[hover]!.sessions), p: nf.format(days[hover]!.players) })}</p>
        </div>
      )}
    </figure>
  );
}

/** Rides by city: horizontal bars, one colour, the value printed beside each bar in text ink. */
function CityBars({ rows }: { rows: { id: CityId; sessions: number }[] }) {
  const t = useT();
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <figure className="rounded-[1.4rem] bg-night-800/90 p-4 ring-1 ring-white/10">
      <figcaption className="mb-3 font-display text-base font-extrabold">{t.stats.byCity}</figcaption>
      <ul className="flex flex-col gap-2">
        {[...rows].sort((a, b) => b.sessions - a.sessions).map((r) => (
          <li key={r.id} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm" title={`${CITIES[r.id].name}: ${nf.format(r.sessions)}`}>
            <span className="truncate font-semibold text-cream/80">{CITIES[r.id].name}</span>
            <span className="h-3 overflow-hidden rounded-r-[4px] bg-white/5">
              <span className="block h-full rounded-r-[4px] bg-sun" style={{ width: `${(r.sessions / max) * 100}%` }} />
            </span>
            <span className="text-right font-display font-bold text-cream tabular">{compact.format(r.sessions)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The public game dashboard: live (anonymous) player numbers, what's been mapped, and what's in the game. */
export function StatsScreen() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const setSetting = useSettings((s) => s.set);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [manifests, setManifests] = useState<Partial<Record<CityId, CityManifest>>>({});
  const [radioCount, setRadioCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/stats", { cache: "no-store" })
        .then((r) => r.json() as Promise<LiveStats>)
        .then((s) => {
          if (!alive) return;
          setLive(s);
          setUpdated(new Date());
        })
        .catch(() => {});
    void load();
    const id = window.setInterval(load, REFRESH_MS);
    for (const city of CITY_ORDER) {
      fetch(`/cities/${city}/manifest.json`)
        .then((r) => r.json() as Promise<CityManifest>)
        .then((m) => alive && setManifests((all) => ({ ...all, [city]: m })))
        .catch(() => {});
    }
    fetch("/radio/stations.json")
      .then((r) => r.json() as Promise<{ live?: unknown[] }>)
      .then((s) => alive && setRadioCount(s.live?.length ?? 0))
      .catch(() => {});
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const loaded = CITY_ORDER.map((id) => ({ id, m: manifests[id] })).filter((x): x is { id: CityId; m: CityManifest } => Boolean(x.m));
  const sum = (f: (m: CityManifest) => number) => loaded.reduce((n, { m }) => n + f(m), 0);
  const place = (k: string) => (m: CityManifest) => (m.stats.places as Record<string, number> | undefined)?.[k] ?? 0;
  const devices = live?.devices ?? {};
  const deviceTotal = Object.values(devices).reduce((a, b) => a + b, 0);

  return (
    <main className="grain h-dvh overflow-y-auto bg-night">
      <div className="safe-x mx-auto flex max-w-6xl flex-col gap-10 py-8">
        <header className="flex flex-wrap items-center gap-4">
          <Link href="/" aria-label="BodaGo" className="mr-auto sm:mr-0">
            <Logo size="lg" className="max-sm:text-4xl" />
          </Link>
          <div className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
            <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-4xl">{t.stats.title}</h1>
            <p className="text-cream/65">{t.stats.tagline}</p>
          </div>
          <Segmented
            size="sm"
            label="Language"
            value={locale}
            onChange={(v) => setSetting("locale", v)}
            options={[
              { value: "sw", label: "SW" },
              { value: "en", label: "EN" },
            ]}
          />
          <Link href="/" aria-label={t.stats.play} className="chunky flex min-h-12 items-center gap-2 rounded-2xl bg-sun px-4 font-display font-extrabold text-night [--edge:var(--color-sun-800)]">
            <Play className="size-5 fill-night" /> <span className="max-sm:hidden">{t.stats.play}</span>
          </Link>
        </header>

        <Section title={t.stats.live} hint={live?.configured ? t.stats.liveHint : undefined}>
          {!live ? (
            <p className="text-cream/60">{t.stats.loading}</p>
          ) : !live.configured ? (
            <div className="flex flex-col gap-3 rounded-[1.4rem] bg-night-800/90 p-5 ring-1 ring-sun/30">
              <p className="flex items-center gap-2 font-display text-lg font-extrabold">
                <Activity className="size-5 text-sun" /> {t.stats.offTitle}
              </p>
              <p className="max-w-2xl text-sm text-cream/70">{t.stats.offBody}</p>
              <ol className="flex flex-col gap-1.5 text-sm text-cream/80">
                {t.stats.offSteps.map((step, i) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sun font-display text-xs font-extrabold text-night">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile icon={Users} label={t.stats.playersTotal} value={nf.format(live.players.total)} big />
                <Tile icon={Users} label={t.stats.playersToday} value={nf.format(live.players.today)} big accent="text-forest-400" />
                <Tile icon={Users} label={t.stats.playersWeek} value={nf.format(live.players.week)} big accent="text-sky-300" />
                <Tile icon={Bike} label={t.stats.sessions} value={nf.format(live.sessions.total)} big accent="text-coral" />
                <Tile icon={Route} label={t.stats.deliveries} value={nf.format(live.deliveries)} />
                <Tile icon={Gauge} label={t.stats.km} value={nf.format(Math.round(live.km))} />
                <Tile icon={Clock} label={t.stats.hours} value={nf.format(Math.round(live.minutes / 60))} />
                <Tile icon={Coins} label={t.stats.fares} value={`TSh ${compact.format(live.fares)}`} />
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-[1.6fr_1fr]">
                <DailyBars days={live.sessions.days} />
                <div className="flex flex-col gap-3">
                  <CityBars rows={live.cities as { id: CityId; sessions: number }[]} />
                  {deviceTotal > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-[1.4rem] bg-night-800/90 p-4 ring-1 ring-white/10">
                      <span className="w-full font-display text-base font-extrabold">{t.stats.devices}</span>
                      {(["phone", "tablet", "desktop"] as const).map((d) => (
                        <span key={d} className="rounded-full bg-white/8 px-3 py-1 text-sm">
                          {t.stats.device[d]} <b className="font-display tabular">{Math.round(((devices[d] ?? 0) / deviceTotal) * 100)}%</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {updated && live?.configured && <p className="text-xs text-cream/40">{fmt(t.stats.updated, { time: updated.toLocaleTimeString() })}</p>}
        </Section>

        <Section title={t.stats.world} hint={t.stats.worldHint}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Tile icon={MapIcon} label={t.stats.cities} value={String(CITY_ORDER.length)} big />
            <Tile icon={Route} label={t.stats.roadKm} value={nf.format(Math.round(sum((m) => m.stats.roadKm ?? 0)))} big accent="text-sky-300" />
            <Tile icon={Building2} label={t.stats.buildings} value={compact.format(sum((m) => m.stats.buildings))} big accent="text-cream" />
            <Tile icon={Store} label={t.stats.shopfronts} value={compact.format(sum((m) => m.stats.shopfronts ?? 0))} big accent="text-coral" />
            <Tile icon={MapPin} label={t.stats.places} value={compact.format(sum((m) => m.stats.pois))} big accent="text-forest-400" />
            <Tile icon={Fuel} label={t.stats.fuel} value={nf.format(sum(place("fuel")))} accent="text-sky-300" />
            <Tile icon={School} label={t.stats.schools} value={nf.format(sum(place("school")))} accent="text-sky-300" />
            <Tile icon={Church} label={t.stats.worship} value={nf.format(sum(place("place_of_worship")))} accent="text-[#B39DDB]" />
            <Tile icon={ShoppingBasket} label={t.stats.markets} value={nf.format(sum(place("market")))} />
            <Tile icon={Landmark} label={t.stats.banks} value={nf.format(sum(place("bank")))} accent="text-forest-400" />
            <Tile icon={Medal} label={t.stats.achievements} value={String(ACHIEVEMENTS.length)} />
          </div>
          <div className="overflow-x-auto rounded-[1.4rem] bg-night-800/90 ring-1 ring-white/10">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-cream/50 uppercase">
                  <th className="px-4 py-3 font-bold">{t.stats.city}</th>
                  <th className="px-4 py-3 text-right font-bold">{t.stats.roadKm}</th>
                  <th className="px-4 py-3 text-right font-bold">{t.stats.buildings}</th>
                  <th className="px-4 py-3 text-right font-bold">{t.stats.places}</th>
                  <th className="px-4 py-3 text-right font-bold">{t.stats.shopfronts}</th>
                  <th className="px-4 py-3 text-right font-bold">{t.stats.fuel}</th>
                </tr>
              </thead>
              <tbody>
                {loaded.map(({ id, m }) => (
                  <tr key={id} className="border-t border-white/6">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="size-2.5 rounded-full" style={{ background: CITIES[id].accent }} aria-hidden="true" />
                        {CITIES[id].name}
                        <span className="text-cream/45">· {CITIES[id].region}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{nf.format(Math.round(m.stats.roadKm ?? 0))}</td>
                    <td className="px-4 py-2.5 text-right tabular">{nf.format(m.stats.buildings)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{nf.format(m.stats.pois)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{nf.format(m.stats.shopfronts ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{nf.format(place("fuel")(m))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t.stats.game}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile icon={Route} label={t.stats.missions} value={String(MISSION_TYPES.length)} />
            <Tile icon={Radio} label={t.stats.radio} value={String(radioCount)} accent="text-coral" />
            <Tile icon={Megaphone} label={t.stats.sponsors} value={String(BUSINESSES.length)} />
            <Tile icon={Bike} label={t.stats.bikes} value={String(Object.keys(BIKES).length)} />
          </div>
        </Section>

        <footer className="pb-6 text-xs text-cream/40">
          BodaGo · © OpenStreetMap contributors
        </footer>
      </div>
    </main>
  );
}
