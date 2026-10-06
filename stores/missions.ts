import { create } from "zustand";
import type { MissionDef, MissionResult } from "@/game/missions/types";

interface MissionUiState {
  offers: MissionDef[];
  active: MissionDef | null;
  result: MissionResult | null;
  boardOpen: boolean;
  set: (patch: Partial<Omit<MissionUiState, "set">>) => void;
}

/** Mission UI state (offers, active job, last result). Per-frame values live in `missionHud`. */
export const useMissions = create<MissionUiState>()((set) => ({
  offers: [],
  active: null,
  result: null,
  boardOpen: false,
  set: (patch) => set(patch),
}));
