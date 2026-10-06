/**
 * Daily / weekly challenges and achievements. Challenges are picked
 * deterministically from the date, so every rider gets the same three
 * today. Progress comes from game events; rewards are claimed in the UI.
 */
import { events } from "@/game/core/events";
import { usePlayer, type ChallengeState, type PlayerStats } from "@/stores/player";

export type ChallengeMetric =
  | "nearMiss"
  | "rainDelivery"
  | "wheelieMeters"
  | "delivery"
  | "fiveStar"
  | "cleanDelivery"
  | "earn"
  | "emergency"
  | "nightDelivery"
  | "topSpeed"
  | "drift"
  | "politeCheckpoint";

export interface ChallengeDef {
  id: string;
  metric: ChallengeMetric;
  target: number;
  reward: number;
  xp: number;
  /** "max" metrics track the best single value (top speed) instead of a sum. */
  mode?: "max";
}

export const DAILY: ChallengeDef[] = [
  { id: "near5", metric: "nearMiss", target: 5, reward: 3000, xp: 40 },
  { id: "rain3", metric: "rainDelivery", target: 3, reward: 5000, xp: 60 },
  { id: "wheelie100", metric: "wheelieMeters", target: 100, reward: 3500, xp: 40 },
  { id: "jobs5", metric: "delivery", target: 5, reward: 4000, xp: 50 },
  { id: "stars2", metric: "fiveStar", target: 2, reward: 4000, xp: 50 },
  { id: "clean3", metric: "cleanDelivery", target: 3, reward: 4500, xp: 50 },
  { id: "earn20k", metric: "earn", target: 20000, reward: 5000, xp: 60 },
  { id: "dharura1", metric: "emergency", target: 1, reward: 3000, xp: 40 },
  { id: "night2", metric: "nightDelivery", target: 2, reward: 4500, xp: 50 },
  { id: "speed60", metric: "topSpeed", target: 60, reward: 2500, xp: 30, mode: "max" },
  { id: "drift3", metric: "drift", target: 3, reward: 3000, xp: 40 },
  { id: "polite1", metric: "politeCheckpoint", target: 1, reward: 2500, xp: 30 },
];

export const WEEKLY: ChallengeDef[] = [
  { id: "wJobs30", metric: "delivery", target: 30, reward: 50000, xp: 400 },
  { id: "wEarn150k", metric: "earn", target: 150000, reward: 40000, xp: 400 },
  { id: "wNear60", metric: "nearMiss", target: 60, reward: 30000, xp: 300 },
  { id: "wStars10", metric: "fiveStar", target: 10, reward: 35000, xp: 350 },
];

export const CHALLENGE_BY_ID = Object.fromEntries([...DAILY, ...WEEKLY].map((c) => [c.id, c])) as Record<string, ChallengeDef>;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const weekKey = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const pickIds = (pool: ChallengeDef[], period: string, count: number) => {
  const ids: string[] = [];
  let h = hash(period);
  while (ids.length < count) {
    const id = pool[h % pool.length]!.id;
    if (!ids.includes(id)) ids.push(id);
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  }
  return ids;
};

/** Today's / this week's challenges, rolling over to new ones when the period changes. */
export const ensureChallenges = () => {
  const p = usePlayer.getState();
  const today = dayKey();
  const week = weekKey();
  const patch: { daily?: ChallengeState; weekly?: ChallengeState } = {};
  if (p.daily?.period !== today) {
    const ids = pickIds(DAILY, today, 3);
    patch.daily = { period: today, ids, progress: ids.map(() => 0), claimed: ids.map(() => false) };
  }
  if (p.weekly?.period !== week) {
    const ids = pickIds(WEEKLY, week, 1);
    patch.weekly = { period: week, ids, progress: ids.map(() => 0), claimed: ids.map(() => false) };
  }
  if (patch.daily || patch.weekly) p.patch(patch);
};

const bump = (metric: ChallengeMetric, amount: number) => {
  ensureChallenges();
  const p = usePlayer.getState();
  const apply = (state: ChallengeState | null): ChallengeState | null => {
    if (!state) return state;
    let changed = false;
    const progress = state.ids.map((id, i) => {
      const def = CHALLENGE_BY_ID[id];
      const cur = state.progress[i]!;
      if (!def || def.metric !== metric) return cur;
      changed = true;
      return def.mode === "max" ? Math.max(cur, amount) : cur + amount;
    });
    return changed ? { ...state, progress } : state;
  };
  const daily = apply(p.daily);
  const weekly = apply(p.weekly);
  if (daily !== p.daily || weekly !== p.weekly) p.patch({ daily, weekly });
};

export const claimChallenge = (which: "daily" | "weekly", index: number): boolean => {
  const p = usePlayer.getState();
  const state = p[which];
  if (!state || state.claimed[index]) return false;
  const def = CHALLENGE_BY_ID[state.ids[index]!];
  if (!def || state.progress[index]! < def.target) return false;
  p.patch({ [which]: { ...state, claimed: state.claimed.map((c, i) => (i === index ? true : c)) } });
  p.earn(def.reward, def.xp);
  return true;
};

// ── Achievements ───────────────────────────────────────────────────────────

export interface AchievementDef {
  id: string;
  icon: string;
  tone: "sun" | "forest" | "sky" | "coral";
  check: (s: PlayerStats, extra: { owned: string[]; cities: number; collectibles: number; level: number }) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "firstRide", icon: "bike", tone: "sun", check: (s) => s.deliveries >= 1 },
  { id: "rider10", icon: "route", tone: "forest", check: (s) => s.deliveries >= 10 },
  { id: "rider50", icon: "medal", tone: "sky", check: (s) => s.deliveries >= 50 },
  { id: "rider200", icon: "crown", tone: "sun", check: (s) => s.deliveries >= 200 },
  { id: "snake", icon: "zap", tone: "sky", check: (s) => s.bestCombo >= 5 },
  { id: "wheelieKing", icon: "trending-up", tone: "coral", check: (s) => s.bestWheelie >= 100 },
  { id: "angel", icon: "siren", tone: "coral", check: (s) => s.emergencies >= 5 },
  { id: "rainRider", icon: "cloud-rain", tone: "sky", check: (s) => s.rainDeliveries >= 10 },
  { id: "nightOwl", icon: "moon", tone: "forest", check: (s) => s.nightDeliveries >= 10 },
  { id: "fiveStars", icon: "star", tone: "sun", check: (s) => s.fiveStars >= 10 },
  { id: "gentle", icon: "heart", tone: "forest", check: (s) => s.cleanDeliveries >= 20 },
  { id: "wallet100k", icon: "coins", tone: "sun", check: (s) => s.earnings >= 100_000 },
  { id: "millionaire", icon: "gem", tone: "sun", check: (s) => s.earnings >= 1_000_000 },
  { id: "wind", icon: "wind", tone: "sky", check: (s) => s.topSpeedKmh >= 80 },
  { id: "legend", icon: "trophy", tone: "sun", check: (_, e) => e.owned.includes("legend") },
  { id: "traveller", icon: "map", tone: "forest", check: (_, e) => e.cities >= 4 },
  { id: "goldenHelmets", icon: "hard-hat", tone: "sun", check: (_, e) => e.collectibles >= 12 },
  { id: "photographer", icon: "camera", tone: "sky", check: (s) => s.photos >= 10 },
  { id: "goodCitizen", icon: "shield-check", tone: "forest", check: (s) => s.politeCheckpoints >= 5 },
];

export const evaluateAchievements = () => {
  const p = usePlayer.getState();
  const extra = { owned: p.owned, cities: p.cities.length, collectibles: p.collectibles.length, level: p.level };
  for (const a of ACHIEVEMENTS) if (!p.achievements[a.id] && a.check(p.stats, extra)) p.unlockAchievement(a.id);
};

/** Wire game events into stats, challenges and achievements. Returns a cleanup. */
export const attachProgression = (): (() => void) => {
  ensureChallenges();
  const player = () => usePlayer.getState();
  const offs = [
    events.on("nearMiss", ({ combo }) => {
      player().bumpStat("nearMisses", 1);
      player().maxStat("bestCombo", combo);
      bump("nearMiss", 1);
      evaluateAchievements();
    }),
    events.on("wheelie", ({ meters }) => {
      player().bumpStat("wheelieMeters", meters);
      player().maxStat("bestWheelie", meters);
      bump("wheelieMeters", meters);
      evaluateAchievements();
    }),
    events.on("drift", () => bump("drift", 1)),
    events.on("collision", () => player().bumpStat("crashes", 1)),
    events.on("topSpeed", ({ kmh }) => {
      player().maxStat("topSpeedKmh", kmh);
      bump("topSpeed", kmh);
      evaluateAchievements();
    }),
    events.on("checkpoint", ({ passed }) => {
      if (!passed) return;
      player().bumpStat("politeCheckpoints", 1);
      bump("politeCheckpoint", 1);
      evaluateAchievements();
    }),
    events.on("delivery", (d) => {
      bump("delivery", 1);
      bump("earn", d.earned);
      if (d.stars === 5) bump("fiveStar", 1);
      if (d.clean) bump("cleanDelivery", 1);
      if (d.rain) bump("rainDelivery", 1);
      if (d.night) bump("nightDelivery", 1);
      if (d.type === "dharura") bump("emergency", 1);
      evaluateAchievements();
    }),
  ];
  return () => offs.forEach((off) => off());
};
