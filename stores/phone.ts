import { create } from "zustand";
import type { MissionDef } from "@/game/missions/types";

export type PhoneTab = "messages" | "calls" | "pesa" | "hustles" | "radio";

export interface PhoneMessage {
  id: number;
  from: string;
  text: string;
  /** Game clock when it arrived, e.g. "16:42". */
  at: string;
  kind: "sms" | "pesa";
  /** Mobile-money alerts: + received, − sent. */
  amount?: number;
  read: boolean;
}

export interface CallLog {
  id: number;
  who: string;
  at: string;
  outcome: "accepted" | "declined" | "missed" | "outgoing";
}

export interface IncomingCall {
  id: number;
  caller: string;
  /** What they say when you pick up. */
  text: string;
  offer: MissionDef;
  regular: boolean;
  /** Seconds left before it rings out. */
  ringsLeft: number;
}

export interface ShopItem {
  id: string;
  qty: number;
  /** The stall's price per unit today. */
  unit: number;
  /** The customer's expected price per unit. */
  expected: number;
}

/** The shopping counter for an errand's "buy" stop. */
export interface ShopState {
  place: string;
  seller: string;
  items: ShopItem[];
  advance: number;
  /** null = not tried yet. */
  haggled: boolean | null;
  canHaggle: boolean;
}

interface PhoneState {
  open: boolean;
  tab: PhoneTab;
  messages: PhoneMessage[];
  calls: CallLog[];
  call: IncomingCall | null;
  shop: ShopState | null;
  set: (patch: Partial<Omit<PhoneState, "set" | "push" | "log" | "markRead">>) => void;
  push: (msg: Omit<PhoneMessage, "id" | "read">) => void;
  log: (entry: Omit<CallLog, "id">) => void;
  markRead: () => void;
}

let nextId = 1;

/** The boda phone: messages, mobile-money alerts, calls and the shop counter (session only). */
export const usePhone = create<PhoneState>()((set) => ({
  open: false,
  tab: "messages",
  messages: [],
  calls: [],
  call: null,
  shop: null,
  set: (patch) => set(patch),
  push: (msg) => set((s) => ({ messages: [{ ...msg, id: nextId++, read: s.open && s.tab === (msg.kind === "pesa" ? "pesa" : "messages") }, ...s.messages].slice(0, 40) })),
  log: (entry) => set((s) => ({ calls: [{ ...entry, id: nextId++ }, ...s.calls].slice(0, 30) })),
  markRead: () => set((s) => ({ messages: s.messages.map((m) => (m.read ? m : { ...m, read: true })) })),
}));
