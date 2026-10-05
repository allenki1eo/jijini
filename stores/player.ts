import { create } from "zustand";

export interface PlayerState {
  wallet: number;
  level: number;
  xp: number;
  /** XP needed to reach the next level. */
  xpToNext: number;
}

/**
 * Player progression. Starts every rider with pocket money for the first
 * tank of mafuta. IndexedDB persistence arrives with the save system (Phase 6).
 */
export const usePlayer = create<PlayerState>()(() => ({
  wallet: 5000,
  level: 1,
  xp: 0,
  xpToNext: 100,
}));
