"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { useSettings } from "@/stores/settings";

function SettingsSync() {
  const locale = useSettings((s) => s.locale);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    // Settings are persisted with skipHydration so SSR and first paint agree.
    void useSettings.persist.rehydrate();
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [locale, reducedMotion]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  return (
    <PwaProvider>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
        <LazyMotion features={domAnimation} strict>
          <SettingsSync />
          {children}
        </LazyMotion>
      </MotionConfig>
    </PwaProvider>
  );
}
