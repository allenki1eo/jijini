import { CITY_ORDER, isCityId } from "@/data/cities/config";
import { deliveryPoints, NATIONAL, previousWeek, PRIZES, RACE_POINTS, TIER_BONUS, tierFor } from "@/data/league";
import type { BoardRow, PrizeWin } from "@/lib/leaderboard";
import { K as ACCT, sessionAccountId } from "@/lib/server/accounts";
import { pipeline, storeConfigured } from "@/lib/statsStore";
import { weekKey } from "@/lib/week";

/**
 * The BodaGo league, one season per ISO week. Registered riders only: every
 * write comes from the session, never from an id in the body.
 *  - points: league points per city and for all Tanzania (jobs, stars, races);
 *  - race:   best time on the city's weekly course (lower is better);
 *  - earn:   money earned from jobs in that city.
 * Last week's top three on each city's points and race boards win prizes,
 * and everyone gets a bonus for the division they reached.
 */
const KEEP = 60 * 60 * 24 * 70;
const WEEK = /^\d{4}-W\d{2}$/;
const RATE_LIMIT = 40;
type Kind = "points" | "race" | "earn";
const key = (kind: Kind, scope: string, week: string) => `bg:lg:${kind}:${scope}:${week}`;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** This week in Tanzania (UTC+3, no daylight saving): seasons turn at Monday midnight EAT. */
const eatWeek = () => {
  const d = new Date(Date.now() + 3 * 3_600_000);
  return weekKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)));
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Prizes the rider won last week (`week` is that week), and the claim flag. */
const prizesFor = async (id: string, week: string): Promise<{ wins: PrizeWin[]; total: number; claimed: boolean }> => {
  const cmds: (string | number)[][] = [["GET", `bg:lg:claim:${week}:${id}`], ["ZSCORE", key("points", NATIONAL, week), id]];
  for (const city of CITY_ORDER) cmds.push(["ZREVRANK", key("points", city, week), id], ["ZRANK", key("race", city, week), id]);
  const out = await pipeline(cmds);
  if (!out) return { wins: [], total: 0, claimed: false };
  const wins: PrizeWin[] = [];
  CITY_ORDER.forEach((city, i) => {
    const pr = out[2 + i * 2];
    const rr = out[3 + i * 2];
    if (pr !== null && pr !== undefined && Number(pr) < PRIZES.points.length) wins.push({ board: "points", city, rank: Number(pr) + 1, amount: PRIZES.points[Number(pr)]! });
    if (rr !== null && rr !== undefined && Number(rr) < PRIZES.race.length) wins.push({ board: "race", city, rank: Number(rr) + 1, amount: PRIZES.race[Number(rr)]! });
  });
  const tier = tierFor(Number(out[1] ?? 0));
  const bonus = out[1] !== null && out[1] !== undefined ? TIER_BONUS[tier.id] : 0;
  if (bonus > 0) wins.push({ board: "tier", city: NATIONAL, rank: 0, amount: bonus, tier: tier.id });
  return { wins, total: wins.reduce((s, w) => s + w.amount, 0), claimed: out[0] !== null && out[0] !== undefined };
};

export async function POST(request: Request) {
  if (!storeConfigured()) return json({ ok: false, error: "offline" }, 503);
  const id = await sessionAccountId();
  if (!id) return json({ ok: false, error: "signed-out" }, 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false }, 400);
  }
  if (body.kind === "claim") {
    const week = str(body.week, 8);
    if (!WEEK.test(week)) return json({ ok: false }, 400);
    // Only a finished week can pay out (`week` is the season being claimed), and only for a couple of weeks.
    const now = eatWeek();
    if (week >= now || week < previousWeek(previousWeek(now))) return json({ ok: false, error: "not-yet" }, 400);
    const prizes = await prizesFor(id, week);
    if (prizes.claimed) return json({ ok: false, error: "claimed", ...prizes }, 409);
    if (!prizes.total) return json({ ok: true, ...prizes, paid: 0 });
    const claim = await pipeline([["SET", `bg:lg:claim:${week}:${id}`, Date.now(), "NX", "EX", KEEP]]);
    if (claim?.[0] !== "OK") return json({ ok: false, error: "claimed", ...prizes, claimed: true }, 409);
    return json({ ok: true, ...prizes, claimed: true, paid: prizes.total });
  }

  const city = str(body.city, 20);
  if (!isCityId(city)) return json({ ok: false }, 400);
  // Results always count for the season running now: a finished week can't be topped up afterwards.
  const week = eatWeek();
  const minute = Math.floor(Date.now() / 60_000);
  const rate = await pipeline([["INCR", `bg:lg:rate:${id}:${minute}`], ["EXPIRE", `bg:lg:rate:${id}:${minute}`, 120]]);
  if (Number(rate?.[0] ?? 0) > RATE_LIMIT) return json({ ok: false, error: "slow-down" }, 429);

  const cmds: (string | number)[][] = [];
  const addPoints = (points: number) => {
    for (const scope of [city, NATIONAL]) cmds.push(["ZINCRBY", key("points", scope, week), points, id], ["EXPIRE", key("points", scope, week), KEEP]);
  };
  let points = 0;
  if (body.kind === "delivery") {
    const earned = num(body.earned);
    const stars = num(body.stars);
    if (Number.isNaN(earned) || Number.isNaN(stars)) return json({ ok: false }, 400);
    points = deliveryPoints(Math.max(1, Math.min(5, stars)), body.clean === true);
    addPoints(points);
    cmds.push(["ZINCRBY", key("earn", city, week), Math.round(Math.max(0, Math.min(earned, 200_000))), id], ["EXPIRE", key("earn", city, week), KEEP]);
  } else if (body.kind === "race") {
    const seconds = num(body.seconds);
    // A weekly course is 0.7–1.7 km: anything under 25 s isn't a boda.
    if (Number.isNaN(seconds) || seconds < 25 || seconds > 1800) return json({ ok: false }, 400);
    cmds.push(["ZADD", key("race", city, week), "LT", seconds.toFixed(2), id], ["EXPIRE", key("race", city, week), KEEP]);
    const day = new Date().toISOString().slice(0, 10);
    const first = await pipeline([["SET", `bg:lg:racept:${id}:${day}`, 1, "NX", "EX", 172_800]]);
    if (first?.[0] === "OK") {
      points = RACE_POINTS;
      addPoints(points);
    }
  } else return json({ ok: false }, 400);

  const out = await pipeline(cmds);
  return json({ ok: Boolean(out), points });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? "";
  if (!WEEK.test(week)) return json({ rows: [], configured: storeConfigured() }, 400);
  if (!storeConfigured()) return json({ rows: [], configured: false });
  const me = await sessionAccountId();

  // Last week's prizes for the signed-in rider (to show the claim banner).
  if (url.searchParams.has("prizes")) {
    if (!me) return json({ wins: [], total: 0, claimed: false });
    return json(await prizesFor(me, previousWeek(week)));
  }

  const scope = url.searchParams.get("city") ?? "";
  const kindParam = url.searchParams.get("kind");
  const kind: Kind = kindParam === "race" || kindParam === "earn" ? kindParam : "points";
  if (!(isCityId(scope) || (scope === NATIONAL && kind === "points"))) return json({ rows: [], configured: true }, 400);
  const k = key(kind, scope, week);
  const low = kind === "race";
  const top = await pipeline([
    low ? ["ZRANGE", k, 0, 24, "WITHSCORES"] : ["ZRANGE", k, 0, 24, "REV", "WITHSCORES"],
    ["ZCARD", k],
    ...(me ? [[low ? "ZRANK" : "ZREVRANK", k, me], ["ZSCORE", k, me]] : []),
  ]);
  if (!top) return json({ rows: [], configured: true, error: true });
  const flat = (top[0] as string[] | null) ?? [];
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    ids.push(flat[i]!);
    scores.push(Number(flat[i + 1]));
  }
  const info = ids.length ? await pipeline([["HMGET", ACCT.names, ...ids], ["HMGET", ACCT.cities, ...ids]]) : null;
  const names = (info?.[0] as (string | null)[] | null) ?? [];
  const homes = (info?.[1] as (string | null)[] | null) ?? [];
  const rows: BoardRow[] = ids
    .map((id, i) => ({ rank: i + 1, name: names[i] ?? "", city: homes[i] ?? undefined, value: scores[i]!, me: id === me }))
    // Deleted accounts drop off the board.
    .filter((r) => r.name)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const myRank = me && top[2] !== null && top[2] !== undefined ? Number(top[2]) + 1 : null;
  const myValue = me && top[3] !== null && top[3] !== undefined ? Number(top[3]) : null;
  return json({ rows, configured: true, signedIn: Boolean(me), me: myRank ? { rank: myRank, value: myValue } : null, total: Number(top[1] ?? 0) });
}
