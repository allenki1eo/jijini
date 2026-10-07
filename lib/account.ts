/**
 * The rider's account on this device: who is signed in, their cloud save,
 * and keeping that save up to date. The session itself is an httpOnly
 * cookie the browser sends with every request; this store only remembers
 * the name and city so the menus can show them offline.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { exportSave, importSave, usePlayer } from "@/stores/player";

export interface Account {
  id: string;
  name: string;
  city: string;
  created: number;
}

export interface CloudSave {
  savedAt: number;
  level: number;
  wallet: number;
}

/** Error codes from /api/account (translated in i18n `account.errors`). */
export type AccountError =
  | "offline"
  | "bad"
  | "name-short"
  | "name-reserved"
  | "name-taken"
  | "pin-format"
  | "pin-weak"
  | "wrong"
  | "locked"
  | "limit"
  | "signed-out"
  | "too-big"
  | "network";

type Result = { ok: true } | { ok: false; error: AccountError };

interface AccountState {
  /** Has the server been asked yet this visit? */
  checked: boolean;
  /** Does the server have a store for accounts at all? */
  configured: boolean;
  account: Account | null;
  cloud: CloudSave | null;
  /** Signed in on a device whose progress differs from the cloud save: the rider picks one before syncing starts. */
  choosing: boolean;
  syncing: boolean;
  syncError: boolean;
  refresh: () => Promise<void>;
  register: (name: string, pin: string, city: string) => Promise<Result>;
  login: (name: string, pin: string) => Promise<Result>;
  logout: () => Promise<void>;
  setCity: (city: string) => Promise<Result>;
  changePin: (old: string, pin: string) => Promise<Result>;
  remove: (pin: string) => Promise<Result>;
  /** Upload this device's progress. */
  backup: () => Promise<Result>;
  /** Replace this device's progress with the cloud save. */
  restore: () => Promise<Result>;
  /** Settle the choice after signing in: keep this device's progress (and upload it) or take the cloud save. */
  choose: (use: "cloud" | "device") => Promise<Result>;
}

const call = async (body: Record<string, unknown>): Promise<{ ok: boolean; error?: AccountError; account?: Account | null; save?: CloudSave | null }> => {
  try {
    const res = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as { ok: boolean; error?: AccountError };
  } catch {
    return { ok: false, error: "network" };
  }
};

const failed = (error?: AccountError): Result => ({ ok: false, error: error ?? "bad" });

export const useAccount = create<AccountState>()(
  persist(
    (set, get) => ({
      checked: false,
      configured: true,
      account: null,
      cloud: null,
      choosing: false,
      syncing: false,
      syncError: false,

      refresh: async () => {
        try {
          const res = await fetch("/api/account", { cache: "no-store" });
          const data = (await res.json()) as { configured: boolean; account: Account | null; save?: CloudSave | null };
          set({ checked: true, configured: data.configured, account: data.account, cloud: data.save ?? null });
        } catch {
          // Offline: keep the remembered account; the cookie is still there for later.
          set({ checked: true });
        }
      },

      register: async (name, pin, city) => {
        const out = await call({ action: "register", name, pin, city });
        if (!out.ok || !out.account) return failed(out.error);
        set({ account: out.account, cloud: null, choosing: false });
        // A new account starts with this device's progress.
        return get().backup();
      },

      login: async (name, pin) => {
        const out = await call({ action: "login", name, pin });
        if (!out.ok || !out.account) return failed(out.error);
        const cloud = out.save ?? null;
        set({ account: out.account, cloud, choosing: Boolean(cloud) });
        if (!cloud) return get().backup();
        return { ok: true };
      },

      logout: async () => {
        await get().backup();
        await call({ action: "logout" });
        set({ account: null, cloud: null, choosing: false });
      },

      setCity: async (city) => {
        const out = await call({ action: "city", city });
        if (!out.ok || !out.account) return failed(out.error);
        set({ account: out.account });
        return { ok: true };
      },

      changePin: async (old, pin) => {
        const out = await call({ action: "pin", old, pin });
        return out.ok ? { ok: true } : failed(out.error);
      },

      remove: async (pin) => {
        const out = await call({ action: "delete", pin });
        if (!out.ok) return failed(out.error);
        set({ account: null, cloud: null, choosing: false });
        return { ok: true };
      },

      backup: async () => {
        if (!get().account || get().choosing) return failed("signed-out");
        set({ syncing: true });
        try {
          const res = await fetch("/api/account/save", { method: "PUT", headers: { "content-type": "application/json" }, body: exportSave() });
          const data = (await res.json()) as { ok: boolean; error?: AccountError } & Partial<CloudSave>;
          if (!data.ok) {
            if (data.error === "signed-out") set({ account: null });
            set({ syncing: false, syncError: true });
            return failed(data.error);
          }
          set({ syncing: false, syncError: false, cloud: { savedAt: data.savedAt!, level: data.level!, wallet: data.wallet! } });
          return { ok: true };
        } catch {
          set({ syncing: false, syncError: true });
          return failed("network");
        }
      },

      restore: async () => {
        try {
          const res = await fetch("/api/account/save", { cache: "no-store" });
          const data = (await res.json()) as { ok: boolean; save?: string | null; error?: AccountError };
          if (!data.ok || !data.save) return failed(data.error);
          importSave(data.save);
          return { ok: true };
        } catch {
          return failed("network");
        }
      },

      choose: async (use) => {
        if (use === "cloud") {
          const out = await get().restore();
          if (!out.ok) return out;
          set({ choosing: false });
          return { ok: true };
        }
        set({ choosing: false });
        return get().backup();
      },
    }),
    {
      name: "bodago:account",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ account: s.account, choosing: s.choosing }),
      skipHydration: true,
    },
  ),
);

const SYNC_DELAY = 45_000;

/**
 * Keep the cloud save fresh while signed in: a backup within 45 s of
 * progress changing, and one when the tab goes to the background. Returns a cleanup.
 */
export const startCloudSync = () => {
  let timer = 0;
  let dirty = false;
  const flush = () => {
    window.clearTimeout(timer);
    timer = 0;
    if (!dirty || !useAccount.getState().account) return;
    dirty = false;
    void useAccount.getState().backup();
  };
  const offPlayer = usePlayer.subscribe((s, prev) => {
    if (!s.hydrated || !prev.hydrated || !useAccount.getState().account) return;
    dirty = true;
    // Throttle, not debounce: a long ride changes the save constantly and should still be backed up.
    if (!timer) timer = window.setTimeout(flush, SYNC_DELAY);
  });
  const onHide = () => document.visibilityState === "hidden" && flush();
  document.addEventListener("visibilitychange", onHide);
  return () => {
    window.clearTimeout(timer);
    offPlayer();
    document.removeEventListener("visibilitychange", onHide);
  };
};
