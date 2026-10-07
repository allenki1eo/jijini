/**
 * Client side of the city leaderboards (app/api/leaderboard): the weekly race
 * times and weekly earnings, posted under the rider's chosen name and the
 * anonymous install id (the same one telemetry uses). Nothing is sent when the
 * rider has turned off sharing in Settings.
 */
import { weekKey } from "@/game/systems/progression";
import { installId } from "@/lib/telemetry";
import { useSettings } from "@/stores/settings";

export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  me: boolean;
}

export interface Board {
  rows: BoardRow[];
  configured: boolean;
  me?: { rank: number; value: number | null } | null;
  total?: number;
  error?: boolean;
}

export type BoardKind = "race" | "earn";

/** The rider's name on the boards (a "Dereva 1234" default until they pick one). */
export const riderName = () => useSettings.getState().riderName || `Dereva ${installId().slice(0, 4).toUpperCase()}`;

const post = (body: Record<string, unknown>) => {
  if (typeof window === "undefined" || !useSettings.getState().shareStats) return;
  void fetch("/api/leaderboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, id: installId(), name: riderName(), week: weekKey() }), keepalive: true }).catch(() => {});
};

/** A finished weekly race (seconds); the board keeps each rider's best. */
export const submitRaceTime = (city: string, seconds: number) => post({ kind: "race", city, value: seconds });

/** Money from a finished job, added to this week's total. */
export const addEarnings = (city: string, amount: number) => amount > 0 && post({ kind: "earn", city, value: amount });

export const fetchBoard = async (city: string, kind: BoardKind, week = weekKey()): Promise<Board> => {
  const res = await fetch(`/api/leaderboard?city=${city}&kind=${kind}&week=${week}&id=${encodeURIComponent(installId())}`, { cache: "no-store" });
  return (await res.json()) as Board;
};
