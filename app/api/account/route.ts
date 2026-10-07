import { CITY_ORDER, isCityId } from "@/data/cities/config";
import {
  checkPin,
  cleanName,
  clearFailures,
  endAllSessions,
  endSession,
  hashPin,
  K,
  loadAccount,
  lockedOut,
  nameKey,
  nameProblem,
  newAccountId,
  noteFailure,
  pinProblem,
  publicAccount,
  registrationAllowed,
  sessionAccountId,
  startSession,
} from "@/lib/server/accounts";
import { pipeline, storeConfigured } from "@/lib/statsStore";

/**
 * Rider accounts: who's signed in (GET), and register / login / logout /
 * home city / change PIN / delete (POST with an `action`). Errors come back
 * as `{ ok: false, error }` with a short code the client translates.
 */
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
const ok = (body: Record<string, unknown> = {}) => Response.json({ ok: true, ...body }, { headers: { "cache-control": "no-store" } });

const saveSummary = async (id: string) => {
  const out = await pipeline([["HMGET", K.saveMeta(id), "savedAt", "level", "wallet"]]);
  const [savedAt, level, wallet] = (out?.[0] as (string | null)[] | null) ?? [];
  return savedAt ? { savedAt: Number(savedAt), level: Number(level ?? 1), wallet: Number(wallet ?? 0) } : null;
};

export async function GET() {
  if (!storeConfigured()) return ok({ configured: false, account: null });
  const id = await sessionAccountId();
  const account = id ? await loadAccount(id) : null;
  return ok({ configured: true, account: account && publicAccount(account), save: account ? await saveSummary(account.id) : null });
}

export async function POST(request: Request) {
  if (!storeConfigured()) return fail("offline", 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("bad");
  }

  switch (body.action) {
    case "register": {
      const name = cleanName(body.name);
      const problem = nameProblem(name);
      if (problem) return fail(`name-${problem}`);
      const pinIssue = pinProblem(body.pin);
      if (pinIssue) return fail(`pin-${pinIssue}`);
      const city = typeof body.city === "string" && isCityId(body.city) ? body.city : CITY_ORDER[0]!;
      if (!(await registrationAllowed(request))) return fail("limit", 429);
      const id = newAccountId();
      const key = nameKey(name);
      // Claim the name first: SET NX is the one atomic step that decides who owns it.
      const claim = await pipeline([["SET", K.byKey(key), id, "NX"]]);
      if (!claim) return fail("offline", 503);
      if (claim[0] !== "OK") return fail("name-taken", 409);
      const pin = await hashPin(body.pin as string);
      const created = Date.now();
      await pipeline([
        ["HSET", K.acct(id), "name", name, "key", key, "city", city, "pin", pin, "created", created],
        ["HSET", K.names, id, name],
        ["HSET", K.cities, id, city],
      ]);
      await startSession(id);
      return ok({ account: { id, name, city, created }, save: null });
    }

    case "login": {
      const key = nameKey(cleanName(body.name));
      if (!key || typeof body.pin !== "string") return fail("wrong", 401);
      if (await lockedOut(key)) return fail("locked", 429);
      const owner = await pipeline([["GET", K.byKey(key)]]);
      const id = owner?.[0];
      const account = typeof id === "string" ? await loadAccount(id) : null;
      if (!account || !(await checkPin(body.pin, account.pin))) {
        await noteFailure(key);
        return fail("wrong", 401);
      }
      await clearFailures(key);
      await startSession(account.id);
      return ok({ account: publicAccount(account), save: await saveSummary(account.id) });
    }

    case "logout":
      await endSession();
      return ok();
  }

  // Everything else needs a signed-in rider.
  const id = await sessionAccountId();
  const account = id ? await loadAccount(id) : null;
  if (!account) return fail("signed-out", 401);

  switch (body.action) {
    case "city": {
      if (typeof body.city !== "string" || !isCityId(body.city)) return fail("bad");
      await pipeline([
        ["HSET", K.acct(account.id), "city", body.city],
        ["HSET", K.cities, account.id, body.city],
      ]);
      return ok({ account: { ...publicAccount(account), city: body.city } });
    }

    case "pin": {
      if (await lockedOut(account.key)) return fail("locked", 429);
      if (typeof body.old !== "string" || !(await checkPin(body.old, account.pin))) {
        await noteFailure(account.key);
        return fail("wrong", 401);
      }
      const pinIssue = pinProblem(body.pin);
      if (pinIssue) return fail(`pin-${pinIssue}`);
      await pipeline([["HSET", K.acct(account.id), "pin", await hashPin(body.pin as string)]]);
      // A new PIN signs out every other device; this one gets a fresh session.
      await endAllSessions(account.id);
      await startSession(account.id);
      return ok();
    }

    case "delete": {
      if (typeof body.pin !== "string" || !(await checkPin(body.pin, account.pin))) {
        await noteFailure(account.key);
        return fail("wrong", 401);
      }
      await endAllSessions(account.id);
      await pipeline([
        ["DEL", K.acct(account.id), K.save(account.id), K.saveMeta(account.id), K.byKey(account.key)],
        ["HDEL", K.names, account.id],
        ["HDEL", K.cities, account.id],
      ]);
      return ok();
    }
  }
  return fail("bad");
}
