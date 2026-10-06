"use client";

import { Download, RefreshCw, Share, WifiOff } from "lucide-react";
import { useSyncExternalStore, useState } from "react";
import { Button, Chip } from "@/components/ui";
import { useT } from "@/i18n";
import { isIos, isStandalone } from "@/lib/device";
import { usePwa } from "@/stores/pwa";
import { applyUpdate } from "./PwaProvider";

const DISMISS_KEY = "bodago:install-dismissed";
const DISMISS_DAYS = 3;

const recentlyDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
};

const noop = () => () => undefined;

/** Friendly install banner (Android: native prompt; iOS: Add to Home Screen instructions). */
export function InstallBanner() {
  const t = useT();
  const installEvent = usePwa((s) => s.installEvent);
  const setPwa = usePwa((s) => s.set);
  const [dismissed, setDismissed] = useState(false);
  // Client-only facts, read without a hydration mismatch.
  const eligible = useSyncExternalStore(noop, () => !isStandalone() && !recentlyDismissed(), () => false);
  const ios = useSyncExternalStore(noop, isIos, () => false);
  const show = eligible && !dismissed && (installEvent !== null || ios);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage blocked: the banner just comes back next visit.
    }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setPwa({ installEvent: null });
  };

  return (
    <>
      {show && (
        <aside className="animate-pop-in pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-3xl bg-night-800/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur [animation-delay:1.2s]">
          <div className="flex items-start gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest text-sun">
              {ios ? <Share className="size-6" /> : <Download className="size-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight font-bold">{t.menu.install}</p>
              <p className="mt-0.5 text-sm text-cream/70">{ios && !installEvent ? t.menu.installIosHint : t.menu.installHint}</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={dismiss}>
              {t.menu.later}
            </Button>
            {installEvent && (
              <Button variant="sun" icon={<Download />} onClick={install}>
                {t.menu.installCta}
              </Button>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

/** "New version, tap to refresh" toast. */
export function UpdateToast() {
  const t = useT();
  const updateReady = usePwa((s) => s.updateReady);
  return (
    <>
      {updateReady && (
        <div role="status" className="animate-pop-in pointer-events-auto flex items-center gap-3 rounded-2xl bg-sky py-2 pr-2 pl-4 text-night shadow-2xl">
          <RefreshCw className="size-5" />
          <span className="font-display font-bold">{t.menu.update}</span>
          <Button variant="night" onClick={applyUpdate}>
            {t.menu.updateCta}
          </Button>
        </div>
      )}
    </>
  );
}

export function OfflineChip() {
  const t = useT();
  const offline = usePwa((s) => s.offline);
  if (!offline) return null;
  return (
    <Chip tone="coral" size="md" icon={<WifiOff />}>
      {t.menu.offline}
    </Chip>
  );
}
