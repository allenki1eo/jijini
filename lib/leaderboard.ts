/**
 * Client side of the league (app/api/leaderboard). Results go out only for a
 * signed-in rider (the server takes the account from the session cookie);
 * guests can still look at the boards.
 */
import type { TierId } from "@/data/league";
import { useAccount } from "@/lib/account";
import { weekKey } from "@/lib/week";

export interface BoardRow {
  rank: number;
  name: string;
  /** The rider's home city. */
  city?: string;
  value: number;
  me: boolean;
}

export interface Board {
  rows: BoardRow[];
  configured: boolean;
  signedIn?: boolean;
  me?: { rank: number; value: number | null } | null;
  total?: number;
  error?: boolean;
}

export type BoardKind = "points" | "race" | "earn";

export interface PrizeWin {
  board: "points" | "race" | "tier";
  city: string;
  rank: number;
  amount: number;
  tier?: TierId;
}

export interface Prizes {
  wins: PrizeWin[];
  total: number;
  claimed: boolean;
}

const post = async (body: Record<string, unknown>) => {
  if (typeof window === "undefined" || !useAccount.getState().account) return null;
  try {
    const res = await fetch("/api/leaderboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    return (await res.json()) as { ok: boolean; points?: number; paid?: number; error?: string } & Partial<Prizes>;
  } catch {
    return null;
  }
};

/** A finished job: league points (stars, clean ride) and the week's earnings. */
export const submitDelivery = (city: string, d: { earned: number; stars: number; clean: boolean }) => void post({ kind: "delivery", city, ...d });

/** A finished weekly race (seconds); the board keeps each rider's best. */
export const submitRaceTime = (city: string, seconds: number) => void post({ kind: "race", city, seconds });

export const fetchBoard = async (scope: string, kind: BoardKind, week = weekKey()): Promise<Board> => {
  const res = await fetch(`/api/leaderboard?city=${scope}&kind=${kind}&week=${week}`, { cache: "no-store" });
  return (await res.json()) as Board;
};

/** What the signed-in rider won last week. */
export const fetchPrizes = async (): Promise<Prizes> => {
  const res = await fetch(`/api/leaderboard?prizes=1&week=${weekKey()}`, { cache: "no-store" });
  return (await res.json()) as Prizes;
};

/** Claim last week's prizes; the server pays each week once. */
export const claimPrizes = (lastWeek: string) => post({ kind: "claim", week: lastWeek });
