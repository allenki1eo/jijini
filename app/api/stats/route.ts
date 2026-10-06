import { CITY_ORDER } from "@/data/cities/config";
import { K, dayKey, pipeline, storeConfigured } from "@/lib/statsStore";

export interface LiveStats {
  configured: boolean;
  players: { total: number; today: number; week: number };
  sessions: { total: number; days: { day: string; sessions: number; players: number }[] };
  deliveries: number;
  fares: number;
  km: number;
  minutes: number;
  cities: { id: string; sessions: number; deliveries: number }[];
  devices: Record<string, number>;
  jobs: Record<string, number>;
}

const DAYS = 14;

const toNum = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) || 0 : 0);
/** HGETALL comes back as a flat [field, value, ...] list. */
const toMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (Array.isArray(v)) for (let i = 0; i + 1 < v.length; i += 2) out[String(v[i])] = toNum(v[i + 1]);
  return out;
};

/** Aggregated, anonymous counters for the /stats page. */
export async function GET() {
  const empty: LiveStats = {
    configured: false,
    players: { total: 0, today: 0, week: 0 },
    sessions: { total: 0, days: [] },
    deliveries: 0,
    fares: 0,
    km: 0,
    minutes: 0,
    cities: [],
    devices: {},
    jobs: {},
  };
  if (!storeConfigured()) return Response.json(empty, { headers: { "Cache-Control": "no-store" } });

  const days = Array.from({ length: DAYS }, (_, i) => dayKey(new Date(Date.now() - (DAYS - 1 - i) * 86_400_000)));
  const week = days.slice(-7).map(K.playersDay);
  const cmds: (string | number)[][] = [
    ["PFCOUNT", K.playersAll],
    ["PFCOUNT", ...week],
    ["GET", K.sessions],
    ["GET", K.deliveries],
    ["GET", K.fares],
    ["GET", K.km],
    ["GET", K.minutes],
    ["HGETALL", K.citySessions],
    ["HGETALL", K.cityDeliveries],
    ["HGETALL", K.devices],
    ["HGETALL", K.jobTypes],
    ...days.flatMap((d) => [["GET", K.sessionsDay(d)], ["PFCOUNT", K.playersDay(d)]]),
  ];
  const r = await pipeline(cmds);
  if (!r) return Response.json({ ...empty, configured: true }, { headers: { "Cache-Control": "no-store" } });
  const citySessions = toMap(r[7]);
  const cityDeliveries = toMap(r[8]);
  const dayRows = days.map((day, i) => ({ day, sessions: toNum(r[11 + i * 2]), players: toNum(r[12 + i * 2]) }));
  const stats: LiveStats = {
    configured: true,
    players: { total: toNum(r[0]), week: toNum(r[1]), today: dayRows[dayRows.length - 1]!.players },
    sessions: { total: toNum(r[2]), days: dayRows },
    deliveries: toNum(r[3]),
    fares: toNum(r[4]),
    km: toNum(r[5]),
    minutes: toNum(r[6]),
    cities: CITY_ORDER.map((id) => ({ id, sessions: citySessions[id] ?? 0, deliveries: cityDeliveries[id] ?? 0 })),
    devices: toMap(r[9]),
    jobs: toMap(r[10]),
  };
  return Response.json(stats, { headers: { "Cache-Control": "no-store" } });
}
