"use client";

import { AnimatePresence, m } from "motion/react";
import { Home, Keyboard, Play, RotateCcw, Settings2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Segmented, Toggle } from "@/components/ui";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { useTouchDevice } from "@/components/hud/RideHud";
import { useT } from "@/i18n";
import { useSettings, type Quality } from "@/stores/settings";

interface PauseMenuProps {
  open: boolean;
  onResume: () => void;
  onRestart?: () => void;
  extra?: ReactNode;
}

/** Pause overlay with quick settings, so players rarely need to leave the ride. */
export function PauseMenu({ open, onResume, onRestart, extra }: PauseMenuProps) {
  const t = useT();
  const s = useSettings();
  const touch = useTouchDevice();
  return (
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-50 grid place-items-center bg-night/70 p-4 backdrop-blur-sm short:p-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label={t.ride.paused}
            className="w-full max-w-md overflow-hidden rounded-[var(--radius-card)] bg-night-800 ring-1 ring-white/10 short:max-w-3xl"
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <KitengeStrip className="h-3 w-full short:h-2" />
            {/* Landscape phones: two columns (resume and exits left, quick settings right) so nothing hides below the fold. */}
            <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-5 short:grid short:max-h-[calc(100dvh-1.5rem)] short:grid-flow-row-dense short:grid-cols-2 short:content-start short:p-4">
              <h2 className="sticker text-4xl short:col-start-1 short:text-3xl">{t.ride.paused}</h2>
              {extra}
              <Button variant="sun" size="lg" icon={<Play />} onClick={onResume} block className="short:col-start-1">
                {t.ride.resume}
              </Button>
              {onRestart && (
                <Button variant="night" size="lg" icon={<RotateCcw />} onClick={onRestart} block className="short:col-start-1">
                  {t.ride.restart}
                </Button>
              )}
              <div className="grid gap-3 rounded-2xl bg-night-700 p-4 short:col-start-2 short:row-span-4 short:row-start-1 short:self-start">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display font-bold">{t.settings.cameraView}</span>
                  <Segmented
                    size="sm"
                    label={t.settings.cameraView}
                    value={s.cameraView}
                    onChange={(v) => s.set("cameraView", v)}
                    options={[
                      { value: "chase", label: t.settings.cameraChase },
                      { value: "fpv", label: t.settings.cameraFpv },
                    ]}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display font-bold">{t.settings.graphics}</span>
                  <Segmented<Quality>
                    size="sm"
                    label={t.settings.graphics}
                    value={s.quality}
                    onChange={(v) => s.set("quality", v)}
                    options={(["low", "medium", "high"] as const).map((q) => ({ value: q, label: t.settings.quality[q] }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display font-bold">{t.settings.autoThrottle}</span>
                  <Toggle label={t.settings.autoThrottle} checked={s.autoThrottle} onChange={(v) => s.set("autoThrottle", v)} />
                </div>
              </div>
              {/* Laptop riders: every key in one place (the on-screen hint fades after a few seconds). */}
              {!touch && (
                <div className="rounded-2xl bg-night-700 p-4 short:col-start-2">
                  <p className="mb-2.5 flex items-center gap-2 font-display font-bold">
                    <Keyboard className="size-5 text-sun" /> {t.ride.keysTitle}
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
                    {t.ride.keys.map(([k = "", what]) => (
                      <div key={k} className="contents">
                        <dt className="flex flex-wrap gap-1">
                          {k.split(" ").map((key) => (
                            <kbd key={key} className="min-w-7 rounded-md bg-night-500 px-1.5 py-0.5 text-center font-display text-xs font-bold text-cream shadow-[inset_0_-2px_0_rgb(0_0_0/0.35)]">
                              {key}
                            </kbd>
                          ))}
                        </dt>
                        <dd className="text-cream/75">{what}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 short:col-start-1">
                <Link href="/settings" className="chunky flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-night-600 font-display font-bold ring-1 ring-white/10 [--edge:var(--color-night)]">
                  <Settings2 className="size-5" />
                  {t.settings.title}
                </Link>
                <Link href="/" className="chunky flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-night-600 font-display font-bold ring-1 ring-white/10 [--edge:var(--color-night)]">
                  <Home className="size-5" />
                  {t.ride.quit}
                </Link>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
