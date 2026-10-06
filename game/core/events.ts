/** Tiny typed event bus connecting game systems, HUD toasts, audio, challenges and achievements. */

export type ToastTone = "sun" | "forest" | "sky" | "coral" | "cream";

export interface GameEvents {
  toast: { text: string; tone?: ToastTone; icon?: string; amount?: number };
  nearMiss: { combo: number };
  collision: { speed: number; kind: "wall" | "vehicle" | "pedestrian" };
  stumble: Record<string, never>;
  wheelie: { meters: number };
  drift: { seconds: number };
  horn: Record<string, never>;
  /** An NPC sounded its horn. `mood`: nudge (move along), angry (you hit or cut them up), friendly (a passing boda's hello). */
  honked: { x: number; z: number; kind: "car" | "suv" | "daladala" | "bajaji" | "truck" | "boda"; mood: "nudge" | "angry" | "friendly" };
  delivery: {
    type: string;
    stars: number;
    earned: number;
    clean: boolean;
    rain: boolean;
    night: boolean;
    seconds: number;
    city: string;
  };
  missionFailed: { type: string };
  levelUp: { level: number };
  achievement: { id: string };
  checkpoint: { passed: boolean };
  collectible: { id: string };
  photo: { id: string };
  refuel: { liters: number; cost: number };
  topSpeed: { kmh: number };
  /** Someone speaks: shown as a speech bubble, and voiced when a recording exists for `key`. */
  say: { key: string; who: string; text: string };
  /** The boda phone rings (true) or stops ringing (false). */
  ringing: { on: boolean };
  /** Traffic police: waved down by a tochi, fined, a chase starting or ending. */
  police: { kind: "flagged" | "fined" | "chase" | "caught" | "escaped" };
  /** The radio DJ speaks between songs. */
  radio: { station: string; text: string };
  /** A message or mobile-money alert arrived on the boda phone. */
  sms: { from: string };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

const handlers = new Map<keyof GameEvents, Set<(payload: never) => void>>();

export const events = {
  on<K extends keyof GameEvents>(type: K, handler: Handler<K>): () => void {
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(handler as (payload: never) => void);
    return () => void set.delete(handler as (payload: never) => void);
  },
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]) {
    handlers.get(type)?.forEach((h) => (h as Handler<K>)(payload));
  },
};
