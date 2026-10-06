"use client";

import { m } from "motion/react";
import { CalendarCheck, Coins, Maximize, PackageOpen, Play, Settings, Star, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Skyline } from "@/components/brand/Skyline";
import { Logo } from "@/components/brand/Logo";
import { InstallBanner, OfflineChip, UpdateToast } from "@/components/pwa/PwaPrompts";
import { Chip, IconButton, Segmented } from "@/components/ui";
import { formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { enterFullscreen } from "@/lib/device";
import { usePlayer, xpForLevel } from "@/stores/player";
import { useSettings } from "@/stores/settings";

interface TileProps {
  icon: LucideIcon;
  label: string;
  accent: string;
  href?: string;
  soon?: string;
}

function MenuTile({ icon: Icon, label, accent, href, soon }: TileProps) {
  const body: ReactNode = (
    <>
      <span className={cn("grid size-11 place-items-center rounded-2xl short:size-9", accent)}>
        <Icon className="size-6 short:size-5" strokeWidth={2.4} />
      </span>
      <span className="font-display text-base leading-none font-bold short:text-sm">{label}</span>
      {soon && (
        <span className="absolute -top-2 -right-2 rotate-6 rounded-full bg-coral px-2 py-1 font-display text-[0.7rem] leading-none font-extrabold tracking-wide text-cream uppercase shadow-md">
          {soon}
        </span>
      )}
    </>
  );
  const cls =
    "chunky relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-[1.25rem] bg-night-700/90 px-2 py-3 ring-1 ring-white/10 backdrop-blur [--edge:var(--color-night)] short:min-h-[4.5rem] short:gap-1.5 short:py-2";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" disabled aria-disabled="true" className={cn(cls, "cursor-not-allowed text-cream/55 disabled:opacity-100 [&>span:first-child]:opacity-60")}>
      {body}
    </button>
  );
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function MainMenu() {
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  const level = usePlayer((s) => s.level);
  const xp = usePlayer((s) => s.xp / xpForLevel(s.level));
  const reputation = usePlayer((s) => s.reputation);
  const locale = useSettings((s) => s.locale);
  const setSetting = useSettings((s) => s.set);

  return (
    <main className="grain relative h-dvh overflow-hidden bg-night">
      <Skyline />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(16_19_26/0.92)_0%,rgb(16_19_26/0.65)_38%,rgb(16_19_26/0)_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-night/70 to-transparent" />

      {/* Top bar: wallet, level, language, fullscreen */}
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
        <Chip tone="night" className="hidden sm:inline-flex">
          {t.common.level} {level}
          <span className="ml-1 inline-block h-1.5 w-10 overflow-hidden rounded-full bg-night-500 align-middle" aria-hidden="true">
            <span className="block h-full rounded-full bg-forest-400" style={{ width: `${Math.max(xp * 100, 6)}%` }} />
          </span>
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
        <IconButton label={t.settings.fullscreen} icon={<Maximize />} onClick={() => void enterFullscreen()} />
      </header>

      <m.section
        className="safe-x relative z-10 flex h-full max-w-[34rem] flex-col justify-center gap-5 pt-14 pb-12 short:gap-2.5 short:pt-12 short:pb-11"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <m.div variants={rise}>
          <Logo size="xl" className="short:text-5xl" />
          <p className="mt-3 font-display text-xl font-semibold text-cream/85 short:mt-0.5 short:text-sm">{t.app.tagline}</p>
        </m.div>

        <m.div variants={rise}>
          <Link
            href="/play?city=shinyanga"
            className="chunky animate-pulse-ring group flex w-full items-center gap-4 rounded-[1.5rem] bg-sun px-5 py-4 text-night [--edge:var(--color-sun-800)] short:py-2.5"
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-night text-sun transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110 short:size-11">
              <Play className="size-7 translate-x-0.5 fill-sun" />
            </span>
            <span className="flex flex-col">
              <span className="font-display text-4xl leading-none font-extrabold short:text-3xl">{t.menu.play}</span>
              <span className="font-display text-base font-semibold opacity-75">{t.menu.playHint}</span>
            </span>
            <span className="ml-auto hidden rounded-full bg-night/10 px-3 py-1 font-display text-sm font-bold whitespace-nowrap sm:inline">{t.menu.explore}</span>
          </Link>
        </m.div>

        <m.nav variants={rise} className="grid grid-cols-2 gap-3 sm:grid-cols-4 short:gap-2" aria-label="Menu">
          <MenuTile icon={Wrench} label={t.menu.garage} accent="bg-coral text-cream" href="/garage" />
          <MenuTile icon={PackageOpen} label={t.menu.missions} accent="bg-sky text-night" href="/play?board=1" />
          <MenuTile icon={CalendarCheck} label={t.menu.daily} accent="bg-forest text-sun" href="/daily" />
          <MenuTile icon={Settings} label={t.menu.settings} accent="bg-cream text-night" href="/settings" />
        </m.nav>
      </m.section>

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
