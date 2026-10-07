/**
 * How each kind of passenger behaves: what they'll pay, how much speed they
 * stand, and whether they're in a rush. Used for fare bargaining ("Bei
 * gani?") and for what they say on the way.
 *
 * - mama: back from the market with her basket; fair, but hates speed.
 * - student: always short of money; walks off at a high price.
 * - business: late for everything; pays well, wants you to fly.
 * - elder: careful and thrifty; "pole pole, mwanangu".
 * - kid: school runs; parents pay, nervous at speed.
 * - tourist: pays what you ask (the mzungu price), but overcharging gets talked about.
 */
import type { PassengerKind } from "@/game/vehicles/BikeModel";

export interface Personality {
  /** What they think a ride is worth, as a share of the going rate. */
  budget: number;
  /** km/h over the limit they put up with before complaining. */
  speedTolerance: number;
  /** Complains when the boda dawdles. */
  wantsSpeed: boolean;
}

export const PERSONALITY: Record<Exclude<PassengerKind, "none">, Personality> = {
  mama: { budget: 1, speedTolerance: 6, wantsSpeed: false },
  student: { budget: 0.72, speedTolerance: 14, wantsSpeed: false },
  business: { budget: 1.35, speedTolerance: 28, wantsSpeed: true },
  elder: { budget: 0.9, speedTolerance: 3, wantsSpeed: false },
  kid: { budget: 0.85, speedTolerance: 4, wantsSpeed: false },
  tourist: { budget: 1.7, speedTolerance: 10, wantsSpeed: false },
};

/** The three prices a rider can quote: a discount, the going rate, and "bei ya juu". */
export const QUOTES = [0.8, 1, 1.35] as const;

/** Chance the passenger agrees to `mult` × the going rate (regular customers trust you more). */
export const acceptChance = (kind: Exclude<PassengerKind, "none">, mult: number, regular: boolean) => {
  const budget = PERSONALITY[kind].budget + (regular ? 0.2 : 0);
  return Math.min(1, (budget / mult) ** 2);
};

/** What they offer instead when they say no. */
export const counterOffer = (kind: Exclude<PassengerKind, "none">, fare: number, mult: number) =>
  Math.max(500, Math.round((fare * Math.min(mult - 0.1, Math.max(0.7, PERSONALITY[kind].budget))) / 100) * 100);

/** Mission types where the fare is agreed at the kerb. */
export const BARGAIN_TYPES = new Set(["abiria", "usiku", "stendi", "haraka", "wageni"]);
