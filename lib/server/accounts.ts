/**
 * Rider accounts, kept in the same Redis store as /stats. A rider registers
 * a name (unique, ignoring case and punctuation) and a 4–6 digit PIN, like a
 * mobile-money PIN. PINs are stored as salted scrypt hashes; sessions are
 * random tokens in an httpOnly cookie, stored server-side by their SHA-256.
 * Wrong PINs are rate-limited per name, new accounts per IP.
 *
 * Keys:
 *  bg:acct:{id}          hash: name, key, city, pin, created
 *  bg:acct:key:{key}     the id that owns a normalised name
 *  bg:acct:names         hash id → display name (for the boards)
 *  bg:acct:cities        hash id → home city
 *  bg:acct:sess:{id}     set of that account's session hashes
 *  bg:sess:{hash}        account id, expires with the cookie
 *  bg:save:{id}          the cloud save (JSON), with bg:save:{id}:meta (savedAt, level, wallet)
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { pipeline } from "@/lib/statsStore";

const scrypt = promisify(scryptCb) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "bg_sess";
const SESSION_TTL = 60 * 60 * 24 * 180;
const FAIL_LIMIT = 5;
const FAIL_WINDOW = 15 * 60;
const REG_LIMIT = 5;

export interface Account {
  id: string;
  name: string;
  city: string;
  created: number;
}

export const K = {
  acct: (id: string) => `bg:acct:${id}`,
  byKey: (key: string) => `bg:acct:key:${key}`,
  names: "bg:acct:names",
  cities: "bg:acct:cities",
  sessions: (id: string) => `bg:acct:sess:${id}`,
  session: (hash: string) => `bg:sess:${hash}`,
  save: (id: string) => `bg:save:${id}`,
  saveMeta: (id: string) => `bg:save:${id}:meta`,
  fails: (key: string) => `bg:acct:fail:${key}`,
  regs: (ip: string, day: string) => `bg:acct:reg:${ip}:${day}`,
};

/** Display names: letters (any script), digits, spaces and . _ ' - ; 3–16 characters. */
export const cleanName = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/[^\p{L}\p{N} ._'-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 16)
        .trim()
    : "";

/** What makes two names "the same": case, spaces and punctuation don't count. */
export const nameKey = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const RESERVED = new Set(["admin", "bodago", "jijini", "moderator", "polisi", "latra", "system", "mfumo", "dereva"]);

export type NameProblem = "short" | "reserved";
export const nameProblem = (name: string): NameProblem | null => {
  const key = nameKey(name);
  if (key.length < 3) return "short";
  if (RESERVED.has(key)) return "reserved";
  return null;
};

export type PinProblem = "format" | "weak";
/** 4–6 digits, and not something everyone guesses first (0000, 1234, 4321…). */
export const pinProblem = (pin: unknown): PinProblem | null => {
  if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) return "format";
  if (/^(\d)\1+$/.test(pin)) return "weak";
  const d = [...pin].map(Number);
  const step = d[1]! - d[0]!;
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1]! === step)) return "weak";
  return null;
};

export const hashPin = async (pin: string) => {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, 32);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
};

export const checkPin = async (pin: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const got = await scrypt(pin, Buffer.from(salt, "base64url"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
};

const sha = (token: string) => createHash("sha256").update(token).digest("base64url");

export const newAccountId = () => `a_${randomBytes(9).toString("base64url")}`;

/** Parse HGETALL's flat [field, value, …] list. */
const fields = (flat: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  return out;
};

export const loadAccount = async (id: string): Promise<(Account & { pin: string; key: string }) | null> => {
  const out = await pipeline([["HGETALL", K.acct(id)]]);
  const f = fields(out?.[0]);
  if (!f.name || !f.pin) return null;
  return { id, name: f.name, city: f.city ?? "shinyanga", created: Number(f.created ?? 0), pin: f.pin, key: f.key ?? nameKey(f.name) };
};

export const publicAccount = ({ id, name, city, created }: Account): Account => ({ id, name, city, created });

/** Start a session for `id` and set its cookie. */
export const startSession = async (id: string) => {
  const token = randomBytes(32).toString("base64url");
  const hash = sha(token);
  await pipeline([
    ["SET", K.session(hash), id, "EX", SESSION_TTL],
    ["SADD", K.sessions(id), hash],
    ["EXPIRE", K.sessions(id), SESSION_TTL],
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
};

/** The signed-in account's id, from the session cookie, or null. */
export const sessionAccountId = async (): Promise<string | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const out = await pipeline([["GET", K.session(sha(token))]]);
  const id = out?.[0];
  return typeof id === "string" && id ? id : null;
};

export const endSession = async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const hash = sha(token);
    const id = await sessionAccountId();
    await pipeline([["DEL", K.session(hash)], ...(id ? [["SREM", K.sessions(id), hash]] : [])]);
  }
  store.delete(SESSION_COOKIE);
};

/** Wrong-PIN guard: true while this name is locked out. */
export const lockedOut = async (key: string) => {
  const out = await pipeline([["GET", K.fails(key)]]);
  return Number(out?.[0] ?? 0) >= FAIL_LIMIT;
};

export const noteFailure = (key: string) => pipeline([["INCR", K.fails(key)], ["EXPIRE", K.fails(key), FAIL_WINDOW]]);
export const clearFailures = (key: string) => pipeline([["DEL", K.fails(key)]]);

/** New-account guard: at most a few registrations per IP per day. */
export const registrationAllowed = async (request: Request) => {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
  const day = new Date().toISOString().slice(0, 10);
  const out = await pipeline([["INCR", K.regs(ip, day)], ["EXPIRE", K.regs(ip, day), 86_400]]);
  return Number(out?.[0] ?? 0) <= REG_LIMIT;
};

/** Every session of an account, ended (sign out everywhere, or account deleted). */
export const endAllSessions = async (id: string) => {
  const out = await pipeline([["SMEMBERS", K.sessions(id)]]);
  const hashes = Array.isArray(out?.[0]) ? (out[0] as string[]) : [];
  await pipeline([...hashes.map((h) => ["DEL", K.session(h)]), ["DEL", K.sessions(id)]]);
  (await cookies()).delete(SESSION_COOKIE);
};
