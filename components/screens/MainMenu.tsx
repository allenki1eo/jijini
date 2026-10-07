"use client";

import { CalendarCheck, Coins, Map as MapIcon, MapPin, Maximize, PackageOpen, Play, Radio, Settings, Star, Trophy, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Skyline } from "@/components/brand/Skyline";
import { Logo } from "@/components/brand/Logo";
import { InstallBanner, OfflineChip, UpdateToast } from "@/components/pwa/PwaPrompts";
import { Chip, IconButton, Segmented } from "@/components/ui";
import { CHALLENGE_BY_ID } from "@/game/systems/progression";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { enterFullscreen } from "@/lib/device";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { CITIES } from "@/data/cities/config";
import { HomeDashboard, RiderCard } from "./HomeDashboard";

interface TileProps {
  icon: LucideIcon;
  label: string;
  accent: string;
  href: string;
  /** A glowing dot: something is waiting there (a challenge to claim). */
  badge?: boolean;
}

function MenuTile({ icon: Icon, label, accent, href, badge }: TileProps) {
  return (
    <Link
      href={href}
      className="chunky group relative flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-[1.25rem] bg-night-700/90 px-1 py-2.5 ring-1 ring-white/10 backdrop-blur [--edge:var(--color-night)] short:min-h-16 short:gap-1 short:py-1.5"
    >
      {badge && <span className="absolute top-2 right-2 size-2.5 animate-pulse rounded-full bg-sun ring-2 ring-night-700" aria-hidden="true" />}
      <span className={cn("grid size-10 place-items-center rounded-2xl transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-0.5 group-hover:rotate-[-6deg] short:size-8", accent)}>
        <Icon className="size-5 short:size-4" strokeWidth={2.4} />
      </span>
      <span className="max-w-full truncate font-display text-sm leading-none font-bold short:text-xs">{label}</span>
    </Link>
  );
}

export function MainMenu() {
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  // A challenge finished but not yet claimed lights up the Changamoto tile.
  const dailyReady = usePlayer((s) => Boolean(s.daily?.ids.some((id, i) => !s.daily!.claimed[i] && s.daily!.progress[i]! >= (CHALLENGE_BY_ID[id]?.target ?? Infinity))));
  const reputation = usePlayer((s) => s.reputation);
  const lastCity = usePlayer((s) => s.lastCity);
  const locale = useSettings((s) => s.locale);
  const setSetting = useSettings((s) => s.set);

  return (
    <main className="grain relative h-dvh overflow-hidden bg-night">
      <Skyline />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(16_19_26/0.92)_0%,rgb(16_19_26/0.65)_38%,rgb(16_19_26/0)_70%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[30rem] bg-gradient-to-l from-night/80 to-transparent md:block" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-night/70 to-transparent" />

      {/* Top bar: wallet, reputation, language, fullscreen */}
      <header className="safe-top safe-x absolute inset-x-0 top-0 z-20 flex items-center justify-end gap-2">
        <div className="mr-auto">
          <OfflineChip />
        </div>
        <Chip tone="night" icon={<Coins className="text-sun" />} className="tabular">
          <span className="sr-only">{t.menu.wallet}: </span>
          {formatTzs(wallet)} <span className="text-cream/60">{t.common.tzs}</span>
        </Chip>
        <Chip tone="night" icon={<Star className="fill-sun text-sun" />} className="tabular">
          <span className="sr-only">Sifa</span>
          {reputation.toFixed(1)}
        </Chip>
        <div className="hidden sm:block">
          <Segmented
            size="sm"
            label={t.settings.language}
            value={locale}
            onChange={(v) => setSetting("locale", v)}
            options={[
              { value: "sw", label: "SW" },
              { value: "en", label: "EN" },
            ]}
          />
        </div>
        <Link
          href="/settings"
          aria-label={t.menu.settings}
          className="chunky grid size-12 shrink-0 place-items-center rounded-2xl bg-night-600/95 text-cream ring-1 ring-white/10 [--edge:var(--color-night)]"
        >
          <Settings className="size-5" />
        </Link>
        <IconButton label={t.settings.fullscreen} icon={<Maximize />} onClick={() => void enterFullscreen()} />
      </header>

      <div className="safe-x relative z-10 mx-auto flex h-full max-w-6xl items-center gap-6 pt-16 pb-12 short:gap-4 short:pt-14 short:pb-10">
        <section className="flex w-full max-w-[32rem] flex-col justify-center gap-4 short:gap-2">
          <div className="animate-rise [animation-delay:80ms]">
            <Logo size="xl" className="short:text-5xl" />
            <p className="mt-2 font-display text-xl font-semibold text-cream/85 short:mt-0 short:text-sm">{t.app.tagline}</p>
          </div>

          <div className="animate-rise [animation-delay:140ms]">
            <RiderCard />
          </div>

          <div className="animate-rise [animation-delay:200ms]">
            <Link
              href={`/play?city=${lastCity}`}
              className="chunky animate-pulse-ring group relative flex w-full items-center gap-4 overflow-hidden rounded-[1.5rem] bg-sun px-5 py-4 text-night [--edge:var(--color-sun-800)] short:py-2.5"
            >
              <span className="animate-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/35" aria-hidden="true" />
              <span className="relative grid size-14 place-items-center rounded-2xl bg-night text-sun transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110 short:size-11">
                <Play className="size-7 translate-x-0.5 fill-sun" />
              </span>
              <span className="relative flex flex-col">
                <span className="font-display text-4xl leading-none font-extrabold short:text-3xl">{t.menu.play}</span>
                <span className="flex items-center gap-1 font-display text-base font-semibold opacity-75">
                  <MapPin className="size-4" /> {fmt(t.home.continueIn, { city: CITIES[lastCity].name })}
                </span>
              </span>
            </Link>
          </div>

          <nav className="animate-rise grid grid-cols-6 gap-2.5 max-sm:grid-cols-3 [animation-delay:260ms] short:gap-2" aria-label="Menu">
            <MenuTile icon={Wrench} label={t.menu.garage} accent="bg-coral text-cream" href="/garage" />
            <MenuTile icon={PackageOpen} label={t.menu.missions} accent="bg-sky text-night" href="/play?board=1" />
            <MenuTile icon={CalendarCheck} label={t.menu.daily} accent="bg-forest text-sun" href="/daily" badge={dailyReady} />
            <MenuTile icon={MapIcon} label={t.cities.title} accent="bg-cream text-night" href="/cities" />
            <MenuTile icon={Trophy} label={t.league.title} accent="bg-sun text-night" href="/ligi" />
            <MenuTile icon={Radio} label={t.menu.radio} accent="bg-[#7C3AED] text-cream" href="/radio" />
          </nav>
        </section>

        <aside className="ml-auto hidden max-h-full w-[22rem] shrink-0 animate-rise overflow-y-auto overscroll-contain [animation-delay:320ms] [scrollbar-width:none] md:block short:w-[19rem]">
          <HomeDashboard />
        </aside>
      </div>

      <footer className="safe-x safe-bottom absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 text-xs text-cream/60">
        <Link href="/credits" className="inline-flex min-h-12 items-center underline-offset-4 hover:text-cream hover:underline">
          {t.menu.credits} · © OpenStreetMap
        </Link>
      </footer>

      <div className="safe-x safe-bottom pointer-events-none absolute right-0 bottom-0 z-30 flex flex-col items-end gap-3">
        <InstallBanner />
      </div>
      <div className="safe-top pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center">
        <UpdateToast />
      </div>
    </main>
  );
}
