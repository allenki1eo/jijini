"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "@/i18n";
import { LoadingScreen } from "./LoadingScreen";
import { MainMenu } from "./MainMenu";

const BOOT_KEY = "bodago:booted";
const MIN_SPLASH_MS = 1600;

const subscribe = () => () => undefined;
const alreadyBooted = () => {
  try {
    return sessionStorage.getItem(BOOT_KEY) === "1";
  } catch {
    return false;
  }
};

type Step = "fonts" | "data" | "ready";

/** Shows the splash once per session while fonts and the starter city manifest warm up. */
export function BootGate() {
  const t = useT();
  const booted = useSyncExternalStore(subscribe, alreadyBooted, () => false);
  const [step, setStep] = useState<Step>("fonts");
  const [progress, setProgress] = useState(0.12);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (booted) return;
    let cancelled = false;
    const started = performance.now();
    (async () => {
      await document.fonts.ready;
      if (cancelled) return;
      setProgress(0.45);
      setStep("data");
      // Warm the HTTP / service-worker cache with the starter city.
      await fetch("/cities/shinyanga/manifest.json").catch(() => undefined);
      if (cancelled) return;
      setProgress(1);
      setStep("ready");
      const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - started));
      await new Promise((r) => setTimeout(r, wait + 350));
      if (cancelled) return;
      try {
        sessionStorage.setItem(BOOT_KEY, "1");
      } catch {
        // Ignore: the splash simply shows again.
      }
      setDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [booted]);

  const showSplash = !booted && !done;
  return (
    <>
      <MainMenu />
      <AnimatePresence>
        {showSplash && (
          <m.div key="splash" className="fixed inset-0 z-50" exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.45 }}>
            <LoadingScreen progress={progress} status={t.splash.steps[step]} />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
