import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CityId } from "@/data/cities/config";
import { events } from "@/game/core/events";
import { idbStorage } from "@/game/save/storage";
import { BIKES, MAX_UPGRADE, rideStats, upgradeCost, type BikeId, type UpgradeId } from "@/game/vehicles/bikes";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "bodago:profile";

export interface Customization {
  body: string;
  helmet: string;
  jacket: string;
  plate: string;
  sticker: "none" | "reds" | "yellows" | "blues" | "kitenge";
  vest: boolean;
  cushion: string;
  mudflaps: boolean;
  led: boolean;
}

export interface PlayerStats {
  deliveries: number;
  distanceKm: number;
  nearMisses: number;
  bestCombo: number;
  wheelieMeters: number;
  bestWheelie: number;
  topSpeedKmh: number;
  earnings: number;
  crashes: number;
  cleanDeliveries: number;
  rainDeliveries: number;
  nightDeliveries: number;
  emergencies: number;
  fiveStars: number;
  photos: number;
  politeCheckpoints: number;
}

export interface ChallengeState {
  /** Period key: "2026-10-06" for daily, "2026-W41" for weekly. */
  period: string;
  ids: string[];
  progress: number[];
  claimed: boolean[];
}

export interface Profile {
  wallet: number;
  xp: number;
  level: number;
  /** Sifa: 0..5 stars. */
  reputation: number;
  owned: BikeId[];
  equipped: BikeId;
  upgrades: Partial<Record<BikeId, Partial<Record<UpgradeId, number>>>>;
  custom: Customization;
  /** Liters in the tank. */
  fuel: number;
  /** 0 = pristine, 100 = wrecked. */
  damage: number;
  cities: CityId[];
  storyChapter: number;
  seenDialogues: string[];
  stats: PlayerStats;
  achievements: Record<string, number>;
  daily: ChallengeState | null;
  weekly: ChallengeState | null;
  tutorialDone: boolean;
  collectibles: string[];
  photos: string[];
  /** Best race times (s) and ghost paths per course id. */
  bests: Record<string, { time: number; ghost: number[] }>;
  lastCity: CityId;
  /** Purchased accessories (stickers, LED, mud flaps). */
  cosmetics: string[];
  /** Lifetime earnings per city (TZS), shown on the city cards. */
  cityEarnings: Record<string, number>;
  /** Regular customers (name → rides together). They phone you for work. */
  regulars: Record<string, number>;
  /** Game hours left on the riding licence (leseni). */
  licenceHours: number;
  /** Hesabu not yet paid to the owner of the Mkopo Ride. */
  hesabuOwed: number;
}

const EMPTY_STATS: PlayerStats = {
  deliveries: 0,
  distanceKm: 0,
  nearMisses: 0,
  bestCombo: 0,
  wheelieMeters: 0,
  bestWheelie: 0,
  topSpeedKmh: 0,
  earnings: 0,
  crashes: 0,
  cleanDeliveries: 0,
  rainDeliveries: 0,
  nightDeliveries: 0,
  emergencies: 0,
  fiveStars: 0,
  photos: 0,
  politeCheckpoints: 0,
};

export const NEW_PROFILE: Profile = {
  wallet: 5000,
  xp: 0,
  level: 1,
  reputation: 3,
  owned: ["mkopo"],
  equipped: "mkopo",
  upgrades: {},
  custom: {
    body: BIKES.mkopo.color,
    helmet: "#FFC72C",
    jacket: "#0B6E4F",
    plate: "MC 123 BGO",
    sticker: "none",
    vest: true,
    cushion: "#10131A",
    mudflaps: false,
    led: false,
  },
  fuel: BIKES.mkopo.tank,
  damage: 0,
  cities: ["shinyanga"],
  storyChapter: 0,
  seenDialogues: [],
  stats: EMPTY_STATS,
  achievements: {},
  daily: null,
  weekly: null,
  tutorialDone: false,
  collectibles: [],
  photos: [],
  bests: {},
  lastCity: "shinyanga",
  cosmetics: [],
  cityEarnings: {},
  regulars: {},
  licenceHours: 72,
  hesabuOwed: 0,
};

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level: number) => Math.round(120 * level ** 1.35);

interface PlayerActions {
  hydrated: boolean;
  /** Add fare money and XP; handles level-ups. */
  earn: (amount: number, xp: number) => void;
  /** Spend money if affordable. Returns false when broke. */
  spend: (amount: number) => boolean;
  /** Money that isn't income: customers' shopping money in, change back out. Never below zero. */
  transfer: (amount: number) => void;
  buyBike: (id: BikeId) => boolean;
  equipBike: (id: BikeId) => void;
  buyUpgrade: (id: UpgradeId) => boolean;
  setCustom: (patch: Partial<Customization>) => void;
  setRide: (fuel: number, damage: number) => void;
  adjustReputation: (delta: number) => void;
  bumpStat: <K extends keyof PlayerStats>(key: K, delta: number) => void;
  maxStat: <K extends keyof PlayerStats>(key: K, value: number) => void;
  unlockAchievement: (id: string) => void;
  unlockCity: (id: CityId) => void;
  patch: (p: Partial<Profile>) => void;
  reset: () => void;
}

export type PlayerState = Profile & PlayerActions;

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      ...NEW_PROFILE,
      hydrated: false,
      earn: (amount, xp) => {
        let { level, xp: total } = get();
        total += xp;
        const levelsGained: number[] = [];
        while (total >= xpForLevel(level)) {
          total -= xpForLevel(level);
          level++;
          levelsGained.push(level);
        }
        set((s) => ({ wallet: s.wallet + amount, xp: total, level, stats: { ...s.stats, earnings: s.stats.earnings + Math.max(0, amount) } }));
        levelsGained.forEach((l) => events.emit("levelUp", { level: l }));
      },
      spend: (amount) => {
        if (get().wallet < amount) return false;
        set((s) => ({ wallet: s.wallet - amount }));
        return true;
      },
      transfer: (amount) => set((s) => ({ wallet: Math.max(0, s.wallet + amount) })),
      buyBike: (id) => {
        const s = get();
        if (s.owned.includes(id) || !s.spend(BIKES[id].price)) return false;
        set((p) => ({ owned: [...p.owned, id], equipped: id, fuel: BIKES[id].tank, custom: { ...p.custom, body: BIKES[id].color } }));
        return true;
      },
      equipBike: (id) => {
        if (!get().owned.includes(id)) return;
        set((p) => ({ equipped: id, fuel: Math.min(p.fuel, rideStats(id, p.upgrades[id]).tank) }));
      },
      buyUpgrade: (id) => {
        const s = get();
        const levels = s.upgrades[s.equipped] ?? {};
        const level = levels[id] ?? 0;
        if (level >= MAX_UPGRADE || !s.spend(upgradeCost(s.equipped, id, level))) return false;
        set((p) => ({ upgrades: { ...p.upgrades, [p.equipped]: { ...levels, [id]: level + 1 } } }));
        return true;
      },
      setCustom: (patch) => set((p) => ({ custom: { ...p.custom, ...patch } })),
      setRide: (fuel, damage) => set({ fuel, damage }),
      adjustReputation: (delta) => set((p) => ({ reputation: Math.min(5, Math.max(0, p.reputation + delta)) })),
      bumpStat: (key, delta) => set((p) => ({ stats: { ...p.stats, [key]: p.stats[key] + delta } })),
      maxStat: (key, value) => set((p) => (value > p.stats[key] ? { stats: { ...p.stats, [key]: value } } : {})),
      unlockAchievement: (id) => {
        if (get().achievements[id]) return;
        set((p) => ({ achievements: { ...p.achievements, [id]: Date.now() } }));
        events.emit("achievement", { id });
      },
      unlockCity: (id) => set((p) => (p.cities.includes(id) ? {} : { cities: [...p.cities, id] })),
      patch: (p) => set(p),
      reset: () => set({ ...NEW_PROFILE }),
    }),
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (s) => {
        const out: Partial<PlayerState> = {};
        for (const k of Object.keys(NEW_PROFILE) as (keyof Profile)[]) (out as Record<string, unknown>)[k] = s[k];
        return out as Profile;
      },
      // Saves only ever gain fields: fill anything missing from the new-profile defaults.
      migrate: (persisted) => ({ ...NEW_PROFILE, ...(persisted as Partial<Profile>) }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Profile>;
        return { ...current, ...p, stats: { ...EMPTY_STATS, ...p.stats }, custom: { ...NEW_PROFILE.custom, ...p.custom } };
      },
      onRehydrateStorage: () => () => usePlayer.setState({ hydrated: true }),
    },
  ),
);

/** Current ride stats for the equipped bike. */
export const currentRideStats = (s: Pick<Profile, "equipped" | "upgrades">) => rideStats(s.equipped, s.upgrades[s.equipped]);

/** Backup: the save as a downloadable JSON string. */
export const exportSave = (): string => {
  const s = usePlayer.getState();
  const profile: Record<string, unknown> = {};
  for (const k of Object.keys(NEW_PROFILE)) profile[k] = s[k as keyof Profile];
  return JSON.stringify({ app: "bodago", version: SAVE_VERSION, exportedAt: new Date().toISOString(), profile }, null, 2);
};

/** Restore a backup. Throws on files that aren't BodaGo saves. */
export const importSave = (json: string) => {
  const data = JSON.parse(json) as { app?: string; version?: number; profile?: Partial<Profile> };
  if (data.app !== "bodago" || !data.profile || typeof data.profile.wallet !== "number") throw new Error("Not a BodaGo save");
  usePlayer.setState({ ...NEW_PROFILE, ...data.profile, stats: { ...EMPTY_STATS, ...data.profile.stats } });
};
