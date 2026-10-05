"use client";

import { Gauge, Hand, Info, Languages, Maximize, Sparkles, Vibrate, Volume2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Card, Segmented, Slider, Toggle } from "@/components/ui";
import { useT } from "@/i18n";
import { enterFullscreen, vibrate } from "@/lib/device";
import { useSettings, type Quality } from "@/stores/settings";
import { ScreenHeader } from "./ScreenHeader";

function Row({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/6 px-5 py-4 first:border-t-0">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-night-600 text-sun [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg leading-tight font-bold">{title}</p>
        {hint && <p className="text-sm text-cream/60">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

export function SettingsScreen() {
  const t = useT();
  const s = useSettings();

  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_100%_0%,rgb(11_110_79/0.35),transparent_60%)]" />
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-5xl flex-col gap-5 py-4">
        <ScreenHeader title={t.settings.title} />

        <div className="grid gap-5 lg:grid-cols-2">
          <Card pattern>
            <Row icon={<Languages />} title={t.settings.language} hint={t.settings.languageHint}>
              <Segmented
                label={t.settings.language}
                value={s.locale}
                onChange={(v) => s.set("locale", v)}
                options={[
                  { value: "sw", label: "Kiswahili" },
                  { value: "en", label: "English" },
                ]}
              />
            </Row>
            <Row icon={<Gauge />} title={t.settings.graphics} hint={t.settings.graphicsHint}>
              <Segmented<Quality>
                label={t.settings.graphics}
                value={s.quality}
                onChange={(v) => s.set("quality", v)}
                options={(["low", "medium", "high"] as const).map((q) => ({ value: q, label: t.settings.quality[q] }))}
              />
            </Row>
            <Row icon={<Vibrate />} title={t.settings.haptics} hint={t.settings.hapticsHint}>
              <Toggle
                label={t.settings.haptics}
                checked={s.haptics}
                onChange={(v) => {
                  s.set("haptics", v);
                  vibrate(40, v);
                }}
              />
            </Row>
            <Row icon={<Hand />} title={t.settings.leftHanded} hint={t.settings.leftHandedHint}>
              <Toggle label={t.settings.leftHanded} checked={s.leftHanded} onChange={(v) => s.set("leftHanded", v)} />
            </Row>
            <Row icon={<Sparkles />} title={t.settings.reducedMotion} hint={t.settings.reducedMotionHint}>
              <Toggle label={t.settings.reducedMotion} checked={s.reducedMotion} onChange={(v) => s.set("reducedMotion", v)} />
            </Row>
          </Card>

          <div className="flex flex-col gap-5">
            <Card pattern>
              <div className="flex items-center gap-3 px-5 pt-4">
                <span className="grid size-11 place-items-center rounded-2xl bg-night-600 text-sun">
                  <Volume2 className="size-5" />
                </span>
                <p className="font-display text-lg font-bold">{t.settings.sound}</p>
              </div>
              <div className="grid gap-1 px-5 pt-2 pb-4">
                {(
                  [
                    ["masterVolume", t.settings.master],
                    ["musicVolume", t.settings.music],
                    ["sfxVolume", t.settings.sfx],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="grid grid-cols-[6rem_1fr] items-center gap-3 font-display font-semibold text-cream/80">
                    {label}
                    <Slider label={label} value={s[key]} onChange={(v) => s.set(key, v)} />
                  </label>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="night" size="lg" icon={<Maximize />} onClick={() => void enterFullscreen()}>
                {t.settings.fullscreen}
              </Button>
              <Link
                href="/credits"
                className="chunky inline-flex min-h-14 items-center justify-center gap-2.5 rounded-[1.15rem] bg-night-600 px-6 font-display text-lg font-bold ring-1 ring-white/10 [--edge:var(--color-night)]"
              >
                <Info className="size-5" />
                <span className="pt-[0.12em]">{t.menu.credits}</span>
              </Link>
            </div>
            <p className="text-center text-sm text-cream/45">
              {t.settings.version} {process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
