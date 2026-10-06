/**
 * Server-side store for the /stats counters: Upstash Redis over its REST API
 * (what Vercel's Redis/KV integration provides). Configure either
 * KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN. Without them the counters are simply off and
 * /stats says so.
 */
const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeConfigured = () => Boolean(URL_ && TOKEN);

type Cmd = (string | number)[];

/** Run commands in one round trip; returns each result (or null on failure). */
export const pipeline = async (cmds: Cmd[]): Promise<unknown[] | null> => {
  if (!URL_ || !TOKEN || !cmds.length) return null;
  try {
    const res = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((r) => (r.error ? null : (r.result ?? null)));
  } catch {
    return null;
  }
};

/** UTC day key, e.g. 20261006. */
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10).replaceAll("-", "");

export const K = {
  playersAll: "bg:players",
  playersDay: (day: string) => `bg:players:${day}`,
  sessionsDay: (day: string) => `bg:sessions:${day}`,
  sessions: "bg:sessions",
  citySessions: "bg:city:sessions",
  devices: "bg:devices",
  deliveries: "bg:deliveries",
  cityDeliveries: "bg:city:deliveries",
  jobTypes: "bg:jobs",
  fares: "bg:fares",
  km: "bg:km",
  minutes: "bg:minutes",
};
