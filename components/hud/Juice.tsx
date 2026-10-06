"use client";

import { useEffect } from "react";
import { events } from "@/game/core/events";
import { hud } from "@/game/core/hud";
import { cn } from "@/lib/cn";
import { vibrate } from "@/lib/device";
import { useSettings } from "@/stores/settings";
import { useHudTick } from "./useHudTick";

/** Radial speed lines at the screen edges while boosting. */
export function SpeedLines() {
  useHudTick(12);
  const reduced = useSettings((s) => s.reducedMotion);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 transition-opacity duration-300",
        hud.boosting && !reduced ? "opacity-100" : "opacity-0",
        "bg-[repeating-conic-gradient(from_0deg_at_50%_55%,rgb(255_255_255/0.0)_0deg_3deg,rgb(255_246_229/0.28)_3deg_3.6deg,rgb(255_255_255/0)_3.6deg_9deg)]",
        "[mask-image:radial-gradient(ellipse_at_50%_55%,transparent_38%,black_80%)]",
      )}
    />
  );
}

/** Phone vibration on crashes, near misses and payouts (respects the setting). */
export function useHaptics() {
  useEffect(() => {
    const on = () => useSettings.getState().haptics;
    const offs = [
      events.on("collision", ({ speed }) => vibrate(Math.min(120, 30 + speed * 8), on())),
      events.on("nearMiss", () => vibrate(15, on())),
      events.on("delivery", () => vibrate([30, 40, 30], on())),
      events.on("collectible", () => vibrate([20, 30, 20, 30, 40], on())),
      events.on("checkpoint", ({ passed }) => vibrate(passed ? 20 : 90, on())),
    ];
    return () => offs.forEach((off) => off());
  }, []);
}
