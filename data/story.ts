/**
 * Kijiweni story chapters. Each unlocks when its condition is met (checked
 * between jobs) and plays a short comic dialogue. Lines live in i18n under
 * `story.<id>`; this file holds speakers, conditions and rewards.
 */
import type { CharacterId } from "@/components/story/Portrait";
import type { CityId } from "./cities/config";

export interface ChapterRequirement {
  deliveries?: number;
  level?: number;
}

export interface Chapter {
  /** Chapter number written to `storyChapter` when completed. */
  id: number;
  key: "ch1" | "ch2" | "ch3" | "ch4" | "ch5" | "ch6" | "ch7";
  speakers: CharacterId[];
  requires: ChapterRequirement;
  reward: { money?: number; reputation?: number; city?: CityId };
}

export const CHAPTERS: Chapter[] = [
  { id: 1, key: "ch1", speakers: ["juma", "juma"], requires: { deliveries: 3 }, reward: { money: 5000 } },
  { id: 2, key: "ch2", speakers: ["baraka", "juma", "baraka"], requires: { level: 2 }, reward: { money: 3000 } },
  { id: 3, key: "ch3", speakers: ["neema", "neema"], requires: { level: 3, deliveries: 8 }, reward: { money: 4000 } },
  { id: 4, key: "ch4", speakers: ["salum", "salum"], requires: { level: 4 }, reward: { reputation: 0.3 } },
  { id: 5, key: "ch5", speakers: ["juma", "neema", "juma"], requires: { level: 5 }, reward: { city: "arusha" } },
  { id: 6, key: "ch6", speakers: ["baraka", "baraka"], requires: { level: 7 }, reward: { city: "mwanza" } },
  { id: 7, key: "ch7", speakers: ["juma", "salum", "neema", "juma"], requires: { level: 9 }, reward: { city: "kariakoo", money: 20000 } },
];

export const nextChapter = (current: number, stats: { deliveries: number; level: number }): Chapter | null => {
  const ch = CHAPTERS.find((c) => c.id === current + 1);
  if (!ch) return null;
  const r = ch.requires;
  return (r.deliveries ?? 0) <= stats.deliveries && (r.level ?? 0) <= stats.level ? ch : null;
};
