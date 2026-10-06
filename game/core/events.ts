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
  honked: { x: number; z: number };
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
