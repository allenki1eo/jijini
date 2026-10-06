"use client";

import { AnimatePresence, m } from "motion/react";
import { Home, Play, RotateCcw, Settings2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Segmented, Toggle } from "@/components/ui";
import { KitengeStrip } from "@/components/brand/Kitenge";
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
  return (
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-50 grid place-items-center bg-night/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label={t.ride.paused}
            className="w-full max-w-md overflow-hidden rounded-[var(--radius-card)] bg-night-800 ring-1 ring-white/10"
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <KitengeStrip className="h-3 w-full" />
            <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-5">
              <h2 className="sticker text-4xl">{t.ride.paused}</h2>
              {extra}
              <Button variant="sun" size="lg" icon={<Play />} onClick={onResume} block>
                {t.ride.resume}
              </Button>
              {onRestart && (
                <Button variant="night" size="lg" icon={<RotateCcw />} onClick={onRestart} block>
                  {t.ride.restart}
                </Button>
              )}
              <div className="grid gap-3 rounded-2xl bg-night-700 p-4">
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
              <div className="grid grid-cols-2 gap-3">
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
