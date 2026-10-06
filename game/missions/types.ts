/** Mission vocabulary shared by the generator, runner and UI. */
import type { CargoKind, PassengerKind } from "@/game/vehicles/BikeModel";
import type { PoiKind } from "@/game/world/format";

export const MISSION_TYPES = ["abiria", "mzigo", "dharura", "chai", "soko", "shule", "wageni", "mbio", "chipsi", "usiku"] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

export type StopKind = "pickup" | "dropoff" | "checkpoint" | "photo";

export interface Stop {
  x: number;
  z: number;
  kind: StopKind;
  /** POI or place name, shown on cards and the tracker. */
  name: string;
  /** Category, used for a fallback label when the place has no name. */
  poi?: PoiKind;
}

export type RiskTag = "fast" | "fragile" | "crowded" | "night" | "rain" | "long" | "vip";

export interface MissionDef {
  id: string;
  type: MissionType;
  client: string;
  stops: Stop[];
  /** Base fare in TZS (tips and bonuses come on top). */
  fare: number;
  xp: number;
  /** Seconds, or null for no clock. */
  timeLimit: number | null;
  /** Estimated route length (m). */
  distance: number;
  passenger: PassengerKind;
  cargo: CargoKind;
  risks: RiskTag[];
  /** Route preview, normalized polyline [x, y, ...] in 0..1. */
  preview: number[];
}

export interface MissionResult {
  missionId: string;
  type: MissionType;
  success: boolean;
  /** i18n key for failures (e.g. "timeout", "spilled"). */
  reason?: "timeout" | "spilled" | "abandoned" | "lost";
  fare: number;
  tip: number;
  combo: number;
  clean: number;
  penalty: number;
  total: number;
  stars: number;
  xp: number;
  seconds: number;
  collisions: number;
  nearMisses: number;
}

/** Display config: lucide icon name, accent token, unlock rule. */
export const MISSION_META: Record<MissionType, { icon: string; accent: string; level: number; chapter?: number; city?: string }> = {
  abiria: { icon: "user", accent: "sun", level: 1 },
  mzigo: { icon: "package", accent: "sky", level: 1 },
  dharura: { icon: "siren", accent: "coral", level: 2 },
  chai: { icon: "coffee", accent: "sun", level: 1, chapter: 3 },
  soko: { icon: "apple", accent: "forest", level: 3 },
  shule: { icon: "school", accent: "sky", level: 4 },
  wageni: { icon: "camera", accent: "forest", level: 4 },
  mbio: { icon: "flag", accent: "coral", level: 1, chapter: 2 },
  chipsi: { icon: "utensils", accent: "sun", level: 5 },
  usiku: { icon: "moon", accent: "sky", level: 3 },
};

export const CLIENTS = [
  "Mama Neema",
  "Bwana Juma",
  "Dada Rehema",
  "Kaka Hamisi",
  "Bi Mwanaisha",
  "Mzee Shabani",
  "Mwalimu Grace",
  "Daktari Kileo",
  "Bwana Musa",
  "Mama Zawadi",
  "Kaka Baraka",
  "Dada Upendo",
  "Bi Halima",
  "Bwana Peter",
  "Mama Joyce",
  "Mzee Lukas",
];

export const TOURIST_NAMES = ["Anna (Germany)", "Kenji (Japan)", "Sophie (France)", "Liam (Ireland)", "Priya (India)", "Carlos (Brazil)"];

/** Mission types available at a given level and story chapter. */
export const unlockedTypes = (level: number, chapter: number): MissionType[] =>
  MISSION_TYPES.filter((t) => {
    const meta = MISSION_META[t];
    return level >= meta.level && (meta.chapter === undefined || chapter >= meta.chapter);
  });
