import { create } from "zustand";

/** Chrome's install prompt event (not in lib.dom yet). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  updateReady: boolean;
  offline: boolean;
  set: (patch: Partial<Omit<PwaState, "set">>) => void;
}

export const usePwa = create<PwaState>()((set) => ({
  installEvent: null,
  updateReady: false,
  offline: false,
  set: (patch) => set(patch),
}));
