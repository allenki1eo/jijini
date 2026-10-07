import { K, sessionAccountId } from "@/lib/server/accounts";
import { pipeline, storeConfigured } from "@/lib/statsStore";

/**
 * The signed-in rider's cloud save: GET downloads it, PUT replaces it.
 * Saves are the same JSON as the Settings backup file, capped in size.
 */
const MAX_BYTES = 400_000;

const signedIn = async () => (storeConfigured() ? await sessionAccountId() : null);

export async function GET() {
  const id = await signedIn();
  if (!id) return Response.json({ ok: false, error: "signed-out" }, { status: 401 });
  const out = await pipeline([["GET", K.save(id)]]);
  const save = typeof out?.[0] === "string" ? out[0] : null;
  return Response.json({ ok: true, save }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const id = await signedIn();
  if (!id) return Response.json({ ok: false, error: "signed-out" }, { status: 401 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ ok: false, error: "too-big" }, { status: 413 });
  let data: { app?: unknown; profile?: { level?: unknown; wallet?: unknown } };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return Response.json({ ok: false, error: "bad" }, { status: 400 });
  }
  if (data.app !== "bodago" || typeof data.profile !== "object" || !data.profile) return Response.json({ ok: false, error: "bad" }, { status: 400 });
  const savedAt = Date.now();
  const level = Number(data.profile.level) || 1;
  const wallet = Number(data.profile.wallet) || 0;
  const out = await pipeline([
    ["SET", K.save(id), text],
    ["HSET", K.saveMeta(id), "savedAt", savedAt, "level", level, "wallet", wallet],
  ]);
  if (!out) return Response.json({ ok: false, error: "offline" }, { status: 503 });
  return Response.json({ ok: true, savedAt, level, wallet });
}
