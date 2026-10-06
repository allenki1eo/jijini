/**
 * IndexedDB-backed storage for the player save (via `idb`). Falls back to an
 * in-memory map when IndexedDB is unavailable (SSR, some private modes).
 */
import { openDB, type IDBPDatabase } from "idb";
import type { StateStorage } from "zustand/middleware";

const DB_NAME = "bodago";
const STORE = "save";
let dbPromise: Promise<IDBPDatabase> | null = null;
const memory = new Map<string, string>();

const db = () => {
  if (typeof indexedDB === "undefined") return null;
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
};

export const idbStorage: StateStorage = {
  async getItem(name) {
    try {
      const d = await db();
      if (!d) return memory.get(name) ?? null;
      return ((await d.get(STORE, name)) as string | undefined) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  async setItem(name, value) {
    memory.set(name, value);
    try {
      await (await db())?.put(STORE, value, name);
    } catch {
      // Keep the in-memory copy; the next write retries.
    }
  },
  async removeItem(name) {
    memory.delete(name);
    try {
      await (await db())?.delete(STORE, name);
    } catch {
      // Ignore.
    }
  },
};
