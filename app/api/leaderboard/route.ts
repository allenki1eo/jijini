import { isCityId } from "@/data/cities/config";
import type { BoardRow } from "@/lib/leaderboard";
import { pipeline, storeConfigured } from "@/lib/statsStore";

/**
 * City leaderboards, one set per ISO week:
 *  - race: best time on the city's weekly race course (lower is better);
 *  - earn: money earned from jobs that week.
 * Riders are identified by their anonymous install id and shown by the name
 * they chose. Boards keep for ten weeks, then age out.
 */
const KEEP = 60 * 60 * 24 * 70;
const WEEK = /^\d{4}-W\d{2}$/;
const key = (kind: "race" | "earn", city: string, week: string) => `bg:lb:${kind}:${city}:${week}`;
const NAMES = "bg:lb:names";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Names: letters, digits, spaces and a little punctuation, nothing else. */
const cleanName = (v: unknown) => str(v, 20).replace(/[^\p{L}\p{N} ._'-]/gu, "").trim();

export async function POST(request: Request) {
  if (!storeConfigured()) return Response.json({ ok: false, reason: "offline" });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const id = str(body.id, 64);
  const city = str(body.city, 20);
  const week = str(body.week, 8);
  const name = cleanName(body.name);
  const value = typeof body.value === "number" && Number.isFinite(body.value) ? body.value : NaN;
  if (!id || !isCityId(city) || !WEEK.test(week) || Number.isNaN(value)) return Response.json({ ok: false }, { status: 400 });
  const cmds: (string | number)[][] = [];
  if (name) cmds.push(["HSET", NAMES, id, name]);
  if (body.kind === "race") {
    // A weekly course is 0.7–1.7 km: anything under 25 s isn't a boda.
    if (value < 25 || value > 1800) return Response.json({ ok: false }, { status: 400 });
    cmds.push(["ZADD", key("race", city, week), "LT", value.toFixed(2), id], ["EXPIRE", key("race", city, week), KEEP]);
  } else if (body.kind === "earn") {
    cmds.push(["ZINCRBY", key("earn", city, week), Math.round(Math.max(0, Math.min(value, 200_000))), id], ["EXPIRE", key("earn", city, week), KEEP]);
  } else return Response.json({ ok: false }, { status: 400 });
  const out = await pipeline(cmds);
  return Response.json({ ok: Boolean(out) });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") ?? "";
  const week = url.searchParams.get("week") ?? "";
  const kind = url.searchParams.get("kind") === "earn" ? "earn" : "race";
  const me = str(url.searchParams.get("id"), 64);
  if (!isCityId(city) || !WEEK.test(week)) return Response.json({ rows: [], configured: storeConfigured() }, { status: 400 });
  if (!storeConfigured()) return Response.json({ rows: [], configured: false });
  const k = key(kind, city, week);
  const top = await pipeline([
    kind === "race" ? ["ZRANGE", k, 0, 19, "WITHSCORES"] : ["ZRANGE", k, 0, 19, "REV", "WITHSCORES"],
    ...(me ? [[kind === "race" ? "ZRANK" : "ZREVRANK", k, me], ["ZSCORE", k, me]] : []),
    ["ZCARD", k],
  ]);
  if (!top) return Response.json({ rows: [], configured: true, error: true });
  const flat = (top[0] as string[] | null) ?? [];
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    ids.push(flat[i]!);
    scores.push(Number(flat[i + 1]));
  }
  const names = ids.length ? (((await pipeline([["HMGET", NAMES, ...ids]]))?.[0] as (string | null)[] | null) ?? []) : [];
  const rows: BoardRow[] = ids.map((id, i) => ({ rank: i + 1, name: names[i] || `Dereva ${id.slice(0, 4).toUpperCase()}`, value: scores[i]!, me: id === me }));
  const myRank = me && top[1] !== null && top[1] !== undefined ? Number(top[1]) + 1 : null;
  const myValue = me && top[2] !== null && top[2] !== undefined ? Number(top[2]) : null;
  const total = Number(top[me ? 3 : 1] ?? 0);
  return Response.json({ rows, configured: true, me: myRank ? { rank: myRank, value: myValue } : null, total }, { headers: { "cache-control": "no-store" } });
}
