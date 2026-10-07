"use client";

import { useEffect, type ReactNode } from "react";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { startCloudSync, useAccount } from "@/lib/account";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";

/** Who is signed in (asked once per visit) and the cloud save kept fresh. */
function AccountSync() {
  useEffect(() => {
    void Promise.resolve(useAccount.persist.rehydrate()).then(() => useAccount.getState().refresh());
    return startCloudSync();
  }, []);
  return null;
}

function SettingsSync() {
  const locale = useSettings((s) => s.locale);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    // Settings are persisted with skipHydration so SSR and first paint agree.
    void Promise.resolve(useSettings.persist.rehydrate()).then(() => {
      const s = useSettings.getState();
      if (s.tierDetected) return;
      // First run: pick a graphics preset from the device tier.
      const nav = navigator as Navigator & { deviceMemory?: number };
      const memory = nav.deviceMemory ?? 4;
      const cores = nav.hardwareConcurrency ?? 4;
      const phone = window.matchMedia("(pointer: coarse)").matches;
      s.set("quality", phone && (memory <= 3 || cores <= 4) ? "low" : !phone && memory >= 8 && cores >= 8 ? "high" : "medium");
      s.set("tierDetected", true);
    });
    void usePlayer.persist.rehydrate();
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [locale, reducedMotion]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PwaProvider>
      <SettingsSync />
      <AccountSync />
      {children}
    </PwaProvider>
  );
}
