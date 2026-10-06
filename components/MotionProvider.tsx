"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useSettings } from "@/stores/settings";

/**
 * Motion is only loaded by screens that need rich animation (game HUD,
 * garage, challenges, cities). The menu uses CSS animations so its first
 * load stays small.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
