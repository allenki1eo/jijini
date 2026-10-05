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
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: "bodago:settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ set, ...rest }) => rest,
    },
  ),
);
