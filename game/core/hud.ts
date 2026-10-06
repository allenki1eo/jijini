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
};
