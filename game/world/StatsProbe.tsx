"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { renderStats } from "@/game/core/stats";

const SAMPLE_SECONDS = 0.5;

/** Samples FPS and renderer counters into the shared stats object. */
export function StatsProbe() {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame(({ gl, camera }, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    if (a.time < SAMPLE_SECONDS) return;
    renderStats.fps = Math.round(a.frames / a.time);
    renderStats.drawCalls = gl.info.render.calls;
    renderStats.triangles = gl.info.render.triangles;
    renderStats.x = camera.position.x;
    renderStats.z = camera.position.z;
    a.frames = 0;
    a.time = 0;
  });
  return null;
}
