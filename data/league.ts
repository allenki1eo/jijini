/**
 * The BodaGo league: weekly points per city (and for all Tanzania), the
 * divisions those points put you in, and the prizes for last week's top
 * riders. Shared by the server (which awards and checks) and the client
 * (which shows them).
 */
import { weekKey } from "@/lib/week";

/** Points for one finished job: more for good stars and a clean ride. */
export const deliveryPoints = (stars: number, clean: boolean) => Math.max(5, 10 + (Math.round(stars) - 3) * 5) + (clean ? 5 : 0);

/** Points for the first weekly-race finish each day. */
export const RACE_POINTS = 30;

export type TierId = "shaba" | "fedha" | "dhahabu" | "almasi";

export interface Tier {
  id: TierId;
  /** Weekly points needed. */
  min: number;
  /** Badge colours: background, ink, ring. */
  bg: string;
  ink: string;
  ring: string;
}

/** Divisions, lowest first. */
export const TIERS: Tier[] = [
  { id: "shaba", min: 0, bg: "#B87333", ink: "#1B1208", ring: "#E2A06A" },
  { id: "fedha", min: 250, bg: "#C9D1DC", ink: "#141A22", ring: "#F2F5F9" },
  { id: "dhahabu", min: 800, bg: "#FFC72C", ink: "#1B1406", ring: "#FFE38A" },
  { id: "almasi", min: 2000, bg: "#5EE0F0", ink: "#06202A", ring: "#C8F7FF" },
];

export const tierFor = (points: number): Tier => [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0]!;

/** The next division up and how many points are missing, or null at the top. */
export const nextTier = (points: number): { tier: Tier; need: number } | null => {
  const next = TIERS.find((t) => t.min > points);
  return next ? { tier: next, need: next.min - points } : null;
};

/** Prizes (TSh, paid to BodaPesa) for last week's city boards, by rank. */
export const PRIZES = {
  points: [150_000, 100_000, 60_000],
  race: [100_000, 60_000, 40_000],
} as const;

/** Every rider who reached this division last week gets a small bonus too. */
export const TIER_BONUS: Record<TierId, number> = { shaba: 0, fedha: 10_000, dhahabu: 30_000, almasi: 75_000 };

/** The national board's id, next to the city ids. */
export const NATIONAL = "tz";

/** The ISO week before `week` ("2026-W41" → "2026-W40"). */
export const previousWeek = (week: string) => {
  const [y, w] = week.split("-W").map(Number) as [number, number];
  // Midday on the Thursday of that week (Thursday decides an ISO week's year), a week back.
  const jan4 = Date.UTC(y, 0, 4, 12);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const thursday = jan4 + ((w - 1) * 7 + 4 - jan4Day) * 86_400_000;
  return weekKey(new Date(thursday - 7 * 86_400_000));
};
