import { isCityId } from "@/data/cities/config";
import { K, dayKey, pipeline, storeConfigured } from "@/lib/statsStore";

/** Days a daily key lives, so old days age out on their own. */
const DAY_TTL = 60 * 60 * 24 * 120;

const str = (v: unknown, max = 40) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(v, max)) : 0);

/** Anonymous game events from lib/telemetry.ts. Always answers 204, so a missing store never shows up as an error. */
export async function POST(request: Request) {
  if (!storeConfigured()) return new Response(null, { status: 204 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }
  const id = str(body.id, 64);
  const city = str(body.city);
  if (!id || !isCityId(city)) return new Response(null, { status: 204 });
  const day = dayKey();
  const cmds: (string | number)[][] = [
    ["PFADD", K.playersAll, id],
    ["PFADD", K.playersDay(day), id],
    ["EXPIRE", K.playersDay(day), DAY_TTL],
  ];
  switch (body.e) {
    case "session": {
      const device = ["phone", "tablet", "desktop"].includes(str(body.device)) ? str(body.device) : "phone";
      cmds.push(["INCR", K.sessions], ["INCR", K.sessionsDay(day)], ["EXPIRE", K.sessionsDay(day), DAY_TTL], ["HINCRBY", K.citySessions, city, 1], ["HINCRBY", K.devices, device, 1]);
      break;
    }
    case "delivery":
      cmds.push(["INCR", K.deliveries], ["HINCRBY", K.cityDeliveries, city, 1], ["HINCRBY", K.jobTypes, str(body.type, 16) || "kazi", 1], ["INCRBY", K.fares, Math.round(num(body.fare, 500_000))]);
      break;
    case "ride":
      cmds.push(["INCRBYFLOAT", K.km, num(body.km, 300)], ["INCRBYFLOAT", K.minutes, num(body.minutes, 600)]);
      break;
    default:
      return new Response(null, { status: 204 });
  }
  await pipeline(cmds);
  return new Response(null, { status: 204 });
}

