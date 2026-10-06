"use client";

import { useEffect, useState } from "react";

/** Re-render the calling component `hz` times per second (HUD reads mutable game state). */
export const useHudTick = (hz = 10) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);
  return tick;
};
