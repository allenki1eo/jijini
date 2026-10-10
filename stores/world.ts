import { create } from "zustand";
import type { CityManifest } from "@/game/world/format";

export type CameraMode = "ride" | "map" | "fly";
export type WorldStatus = "loading" | "ready" | "error";

interface WorldState {
  manifest: CityManifest | null;
  status: WorldStatus;
  error: string | null;
  progress: { loaded: number; total: number };
  loadedKeys: string[];
  cameraMode: CameraMode;
  showStats: boolean;
  showNavGraph: boolean;
  showChunkGrid: boolean;
  /** This city has 18+ sponsors (the age question appears). */
  adultAdsHere: boolean;
  /** A character dialogue card (tutorial or story) is on screen. */
  dialogue: boolean;
  set: (patch: Partial<Omit<WorldState, "set" | "reset">>) => void;
  reset: () => void;
}

const initial = {
  manifest: null,
  status: "loading" as WorldStatus,
  error: null,
  progress: { loaded: 0, total: 0 },
  loadedKeys: [],
  cameraMode: "ride" as CameraMode,
  showStats: false,
  showNavGraph: false,
  showChunkGrid: false,
  adultAdsHere: false,
  dialogue: false,
};

/** Session state for the world explorer (not persisted). */
export const useWorld = create<WorldState>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
