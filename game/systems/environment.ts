/**
 * Time of day and weather. One shared state object drives the sky, fog,
 * lights and the shader uniforms (wet roads, lit windows, street lamps).
 */
import * as THREE from "three";

export type Weather = "sunny" | "rain" | "haze";

/** Shader uniforms shared by every world material. */
export const envUniforms = {
  uNight: { value: 0 },
  uWet: { value: 0 },
  uTime: { value: 0 },
};

interface Keyframe {
  hour: number;
  zenith: string;
  horizon: string;
  below: string;
  sun: string;
  hemiSky: string;
  hemiGround: string;
  sunIntensity: number;
  hemiIntensity: number;
}

/** A Tanzanian day: soft dawn, hard white noon, long golden afternoon, quick dusk. */
const KEYS: Keyframe[] = [
  { hour: 0, zenith: "#070B18", horizon: "#1A2238", below: "#0C0F18", sun: "#7F95C9", hemiSky: "#2B3A66", hemiGround: "#1A1410", sunIntensity: 0.25, hemiIntensity: 0.55 },
  { hour: 5.2, zenith: "#0B1430", horizon: "#3A3550", below: "#16141C", sun: "#8A7FB0", hemiSky: "#3A4570", hemiGround: "#231A14", sunIntensity: 0.25, hemiIntensity: 0.6 },
  { hour: 6.3, zenith: "#3A5A9A", horizon: "#F2A06E", below: "#7A5544", sun: "#FFB37A", hemiSky: "#9BB2DA", hemiGround: "#7A5040", sunIntensity: 1.2, hemiIntensity: 1.2 },
  { hour: 8.5, zenith: "#4A8ED6", horizon: "#EAD9BC", below: "#B99A7C", sun: "#FFF1D6", hemiSky: "#D6E7FF", hemiGround: "#B08060", sunIntensity: 2.3, hemiIntensity: 1.8 },
  { hour: 12.5, zenith: "#2F80D2", horizon: "#E4E6E0", below: "#C2A88E", sun: "#FFFFFF", hemiSky: "#E2EEFF", hemiGround: "#B9805C", sunIntensity: 2.7, hemiIntensity: 1.9 },
  { hour: 16.5, zenith: "#3E8DD3", horizon: "#F1D9B5", below: "#C99F7B", sun: "#FFE7BF", hemiSky: "#DCEBFF", hemiGround: "#B9805C", sunIntensity: 2.4, hemiIntensity: 1.9 },
  { hour: 18.1, zenith: "#4C5E9E", horizon: "#FFB25E", below: "#9A5A40", sun: "#FFB060", hemiSky: "#E8B98E", hemiGround: "#8A4E36", sunIntensity: 1.9, hemiIntensity: 1.4 },
  { hour: 18.9, zenith: "#2A2E62", horizon: "#E36F5A", below: "#5A3040", sun: "#FF7A52", hemiSky: "#8A7AA8", hemiGround: "#4A2A26", sunIntensity: 0.9, hemiIntensity: 0.9 },
  { hour: 19.8, zenith: "#0E1430", horizon: "#3A2E4E", below: "#14121C", sun: "#7F95C9", hemiSky: "#34406A", hemiGround: "#1C1612", sunIntensity: 0.3, hemiIntensity: 0.6 },
  { hour: 24, zenith: "#070B18", horizon: "#1A2238", below: "#0C0F18", sun: "#7F95C9", hemiSky: "#2B3A66", hemiGround: "#1A1410", sunIntensity: 0.25, hemiIntensity: 0.55 },
];

const RAIN_TINT = new THREE.Color("#8A929C");
const HAZE_TINT = new THREE.Color("#D9B98C");

const c = () => new THREE.Color();
const a = c();
const b = c();

export const env = {
  /** Time of day in hours (0..24): real local time by default. */
  hour: 16.5,
  /** Real seconds per game hour. */
  secondsPerHour: 40,
  weather: "sunny" as Weather,
  rain: 0,
  haze: 0,
  wetness: 0,
  /** 0 day … 1 full night. */
  night: 0,
  sunDirection: new THREE.Vector3(),
  zenith: c(),
  horizon: c(),
  below: c(),
  sun: c(),
  fog: c(),
  hemiSky: c(),
  hemiGround: c(),
  sunIntensity: 1,
  hemiIntensity: 1,
  /** Multiplier applied to the quality preset's fog distances. */
  fogScale: 1,
  nextWeatherChange: 3,
  /** Freeze the clock (tutorial, debugging). */
  frozen: false,
  /** Follow the device's local time instead of the fast game clock. */
  realTime: true,
  /** Hours added to the real clock (debug time-of-day buttons). */
  offset: 0,
};

/** The device's local time of day in hours (0..24). */
const localHour = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
};

export const setWeather = (w: Weather) => {
  env.weather = w;
};

export const setHour = (h: number) => {
  env.hour = ((h % 24) + 24) % 24;
  // On the real clock, jump by shifting it rather than fighting it.
  if (env.realTime) env.offset = env.hour - localHour();
};

/** Switch between the real local clock and the fast game clock. */
export const setRealTime = (on: boolean) => {
  if (on === env.realTime) return;
  env.realTime = on;
  env.offset = 0;
  if (on) env.hour = localHour();
};

/** Hour formatted HH:MM. */
export const clockText = () => {
  const h = Math.floor(env.hour);
  const m = Math.floor((env.hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const sample = (hour: number) => {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= hour) i++;
  const k0 = KEYS[i]!;
  const k1 = KEYS[i + 1]!;
  const t = (hour - k0.hour) / (k1.hour - k0.hour);
  const mix = (target: THREE.Color, p: string, q: string) => target.copy(a.set(p)).lerp(b.set(q), t);
  mix(env.zenith, k0.zenith, k1.zenith);
  mix(env.horizon, k0.horizon, k1.horizon);
  mix(env.below, k0.below, k1.below);
  mix(env.sun, k0.sun, k1.sun);
  mix(env.hemiSky, k0.hemiSky, k1.hemiSky);
  mix(env.hemiGround, k0.hemiGround, k1.hemiGround);
  env.sunIntensity = k0.sunIntensity + (k1.sunIntensity - k0.sunIntensity) * t;
  env.hemiIntensity = k0.hemiIntensity + (k1.hemiIntensity - k0.hemiIntensity) * t;
};

/** Advance clock and weather. `random` is injectable for deterministic tests. */
export const updateEnvironment = (dt: number, random: () => number = Math.random) => {
  if (!env.frozen) env.hour = env.realTime ? (((localHour() + env.offset) % 24) + 24) % 24 : (env.hour + dt / env.secondsPerHour) % 24;
  envUniforms.uTime.value += dt;

  // Weather changes every few game hours.
  env.nextWeatherChange -= dt / env.secondsPerHour;
  if (env.nextWeatherChange <= 0) {
    const r = random();
    env.weather = r < 0.66 ? "sunny" : r < 0.86 ? "rain" : "haze";
    env.nextWeatherChange = 2.5 + random() * 3.5;
  }
  const approach = (v: number, target: number, rate: number) => v + (target - v) * Math.min(1, dt * rate);
  env.rain = approach(env.rain, env.weather === "rain" ? 1 : 0, 0.12);
  env.haze = approach(env.haze, env.weather === "haze" ? 1 : 0, 0.06);
  env.wetness = env.rain > 0.3 ? Math.min(1, env.wetness + dt * 0.08 * env.rain) : Math.max(0, env.wetness - dt * 0.008);

  sample(env.hour);
  // Sun arcs east → west; at night a dim moon takes over from the opposite side.
  const arc = ((env.hour - 6) / 12) * Math.PI;
  const up = Math.sin(arc);
  if (up > -0.05) env.sunDirection.set(Math.cos(arc), Math.max(0.08, up * 0.95), 0.35).normalize();
  else env.sunDirection.set(-Math.cos(arc) * 0.6, 0.7, -0.3).normalize();
  env.night = Math.min(1, Math.max(0, (0.12 - up) / 0.3));

  // Weather grading: rain greys everything, haze warms and thickens the air.
  const grey = env.rain * 0.78;
  for (const col of [env.zenith, env.horizon, env.hemiSky]) col.lerp(RAIN_TINT, grey * (1 - env.night * 0.7));
  env.horizon.lerp(HAZE_TINT, env.haze * 0.5 * (1 - env.night));
  env.fog.copy(env.horizon);
  env.sunIntensity *= 1 - env.rain * 0.6 - env.haze * 0.25;
  env.fogScale = 1 - env.rain * 0.35 - env.haze * 0.5;

  envUniforms.uNight.value = env.night;
  envUniforms.uWet.value = env.wetness;
};

updateEnvironment(0);
