import type { Quality } from "@/stores/settings";

export interface QualityPreset {
  /** Max device pixel ratio (render scale). */
  dpr: [number, number];
  antialias: boolean;
  /** Chunk streaming radius in meters. */
  loadRadius: number;
  fogNear: number;
  fogFar: number;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { dpr: [0.6, 0.75], antialias: false, loadRadius: 300, fogNear: 120, fogFar: 360 },
  medium: { dpr: [0.75, 1.25], antialias: true, loadRadius: 400, fogNear: 160, fogFar: 470 },
  high: { dpr: [1, 2], antialias: true, loadRadius: 520, fogNear: 220, fogFar: 620 },
};
