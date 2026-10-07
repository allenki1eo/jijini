import { create } from "zustand";
import type { MissionDef, MissionResult } from "@/game/missions/types";
import type { PassengerKind } from "@/game/vehicles/BikeModel";

/** "Bei gani?": agreeing the fare with a passenger at the kerb. */
export interface Bargain {
  client: string;
  kind: Exclude<PassengerKind, "none">;
  /** Where they're going. */
  to: string;
  /** The going rate (TZS). */
  fare: number;
  /** Their counter-offer after turning down your price, if any. */
  counter: number | null;
}

interface MissionUiState {
  offers: MissionDef[];
  active: MissionDef | null;
  result: MissionResult | null;
  boardOpen: boolean;
  bargain: Bargain | null;
  set: (patch: Partial<Omit<MissionUiState, "set">>) => void;
}

/** Mission UI state (offers, active job, last result). Per-frame values live in `missionHud`. */
export const useMissions = create<MissionUiState>()((set) => ({
  offers: [],
  active: null,
  result: null,
  boardOpen: false,
  bargain: null,
  set: (patch) => set(patch),
}));
