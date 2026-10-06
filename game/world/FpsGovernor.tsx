"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { QualityPreset } from "@/game/core/quality";

const CHECK_EVERY = 1;

/**
 * Keeps the frame rate up by trading render resolution: drops the pixel
 * ratio when FPS sags, raises it again when there's headroom.
 */
export function FpsGovernor({ preset }: { preset: QualityPreset }) {
  const setDpr = useThree((s) => s.setDpr);
  const state = useRef({ dpr: preset.dpr[1], frames: 0, time: 0, slow: 0, fast: 0 });

  useEffect(() => {
    state.current.dpr = Math.min(preset.dpr[1], window.devicePixelRatio || 1);
    setDpr(state.current.dpr);
  }, [preset, setDpr]);

  useFrame((_, dt) => {
    const s = state.current;
    s.frames++;
    s.time += dt;
    if (s.time < CHECK_EVERY) return;
    const fps = s.frames / s.time;
    s.frames = 0;
    s.time = 0;
    if (fps < 42) {
      s.slow++;
      s.fast = 0;
    } else if (fps > 57) {
      s.fast++;
      s.slow = 0;
    } else {
      s.slow = 0;
      s.fast = 0;
    }
    const [min, max] = preset.dpr;
    const cap = Math.min(max, window.devicePixelRatio || 1);
    if (s.slow >= 3 && s.dpr > min) {
      s.dpr = Math.max(min, +(s.dpr - 0.15).toFixed(2));
      s.slow = 0;
      setDpr(s.dpr);
    } else if (s.fast >= 6 && s.dpr < cap) {
      s.dpr = Math.min(cap, +(s.dpr + 0.1).toFixed(2));
      s.fast = 0;
      setDpr(s.dpr);
    }
  });
  return null;
}
