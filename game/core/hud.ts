/**
 * Values the HUD displays, written by the game loop every frame and read by
 * React at ~10 Hz (see useHudTick). Mutable on purpose: no per-frame renders.
 */
export const hud = {
  speedKmh: 0,
  fuel: 1,
  fuelLiters: 0,
  boost: 1,
  boosting: false,
  damage: 0,
  surface: "tarmac" as string,
  outOfFuel: false,
  heading: 0,
  x: 0,
  z: 0,
  /** Speed limit of the road underneath (km/h). */
  limitKmh: 30,
  /** 0 = neutral, 1–5 = gear, derived from speed. */
  gear: 0,
  /** Signal of the traffic light ahead, if one is coming up. */
  light: null as "red" | "amber" | "green" | null,
  lightDistance: 0,
  headlight: false,
};

export type NavTurn = "straight" | "left" | "right" | "uturn" | "arrive";

/** Turn-by-turn guidance for the arrow at the top of the screen, refreshed a few times a second. */
export const navHud = {
  /** "job": following the route to the current stop; "fuel": heading for the nearest sheli; "pin": a place the rider picked on the map. */
  mode: null as "job" | "fuel" | "pin" | null,
  /** Where to steer, relative to the rider's heading (rad, + = right; unwrapped, so it can exceed ±π). */
  angle: 0,
  turn: "straight" as NavTurn,
  /** Metres to the next turn. */
  turnIn: 0,
  /** Metres left to the destination. */
  distance: 0,
  label: "",
  /** Fuel mode because the rider asked (rather than the tank running low). */
  asked: false,
  /** The drive to the sheli, for the minimap. */
  fuelRoute: null as Float32Array | null,
  /** The drive to the rider's own destination, for the minimap and the city map. */
  pinRoute: null as Float32Array | null,
  /** That destination, while one is set. */
  pin: null as { x: number; z: number; label: string } | null,
};
