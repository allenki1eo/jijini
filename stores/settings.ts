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
  /** Tuned live station (`live:<id>` from the radio catalog) or "off". */
  radio: string;
  /** Answer to "are you 18 or over?" (null = not asked yet). Gates alcohol adverts. */
  adult: boolean | null;
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
      radio: "live:tbc-taifa",
      adult: null,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: "bodago:settings",
      version: 3,
      // v2 added ride assists and HUD scale. v3 replaced the placeholder stations with the live catalog.
      migrate: (persisted, version) => {
        const next = persisted as SettingsState;
        if (version < 3 && (next.radio === "kijiweni" || next.radio === "bongo" || next.radio === "pwani")) next.radio = "live:tbc-taifa";
        return next;
      },
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ set, ...rest }) => rest,
    },
  ),
);
