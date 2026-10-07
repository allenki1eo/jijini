import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Locale } from "@/i18n";

export type Quality = "low" | "medium" | "high";

export interface SettingsState {
  locale: Locale;
  quality: Quality;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  leftHanded: boolean;
  reducedMotion: boolean;
  /** Throttle held automatically (beginner assist). */
  autoThrottle: boolean;
  /** Steer by tilting the phone. */
  tiltSteer: boolean;
  cameraView: "chase" | "fpv";
  /** HUD size multiplier (accessibility). */
  hudScale: number;
  /** Set once the graphics preset was picked from the device tier. */
  tierDetected: boolean;
  /** Radio station playing while you ride (or "off"). */
  /** "kijiweni" | "bongo" | "pwani", a live station "live:<n>", or "off". */
  radio: string;
  /** Answer to "are you 18 or over?" (null = not asked yet). Gates alcohol adverts. */
  adult: boolean | null;
  /** Follow the device's real local time (morning is morning), or run the fast game clock. */
  realClock: boolean;
  /** Send anonymous play counts (city, jobs, km) for the public /stats page. */
  shareStats: boolean;
  /** Name on the city leaderboards (empty = a "Dereva 1234" default). */
  riderName: string;
  set: <K extends keyof Omit<SettingsState, "set">>(key: K, value: SettingsState[K]) => void;
}

/** User preferences. Settings live in localStorage; game saves go to IndexedDB. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "sw",
      quality: "medium",
      masterVolume: 0.8,
      musicVolume: 0.6,
      sfxVolume: 0.9,
      haptics: true,
      leftHanded: false,
      reducedMotion: false,
      autoThrottle: false,
      tiltSteer: false,
      cameraView: "chase",
      hudScale: 1,
      tierDetected: false,
      radio: "kijiweni",
      adult: null,
      realClock: true,
      shareStats: true,
      riderName: "",
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: "bodago:settings",
      version: 2,
      // v2 added ride assists and HUD scale; persisted fields merge over the defaults.
      migrate: (persisted) => persisted as SettingsState,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ set, ...rest }) => rest,
    },
  ),
);
