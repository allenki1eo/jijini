/**
 * Playable city definitions. Adding a city = add an entry here, then run
 * `npm run bake -- <id>` to generate its chunked data in /public/cities/<id>.
 */

export type CityId = "shinyanga" | "arusha" | "mwanza" | "kariakoo";

export type SkylineKind = "savanna" | "meru" | "lake" | "ocean";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Landmark {
  /** Model id in game/world/landmarks.ts. */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** "curb": stand at the roadside nearest the point, facing the road (flags, shopfronts). */
  placement?: "center" | "curb";
  /** Rotation in degrees (center placement). */
  yaw?: number;
}

export interface CityConfig {
  id: CityId;
  /** Display name (proper noun, identical in both languages). */
  name: string;
  region: string;
  /** World origin and default spawn point. */
  center: LatLon;
  /** Half the side length of the playable square, in meters. */
  halfSize: number;
  /** Chunk tile size in meters. */
  chunkSize: number;
  /** 1 = calm starter town, 4 = Kariakoo chaos. */
  difficulty: 1 | 2 | 3 | 4;
  skyline: SkylineKind;
  /** Card accent color for menus. */
  accent: string;
  /** Relative weights of [mango, acacia, palm] trees. */
  treeMix: [number, number, number];
  /** Boda-stand membership needed to ride here. */
  unlock: { level: number; price: number };
  landmarks: Landmark[];
}

export const CITIES: Record<CityId, CityConfig> = {
  shinyanga: {
    id: "shinyanga",
    name: "Shinyanga",
    region: "Shinyanga",
    center: { lat: -3.6639, lon: 33.4218 },
    halfSize: 750,
    chunkSize: 200,
    difficulty: 1,
    skyline: "savanna",
    accent: "#0B6E4F",
    treeMix: [5, 4, 1],
    unlock: { level: 1, price: 0 },
    landmarks: [
      { id: "nguzo-nane", name: "Nguzo Nane", lat: -3.66807, lon: 33.41694 },
      { id: "kambarage-stadium", name: "Uwanja wa Kambarage", lat: -3.6616, lon: 33.41561 },
    ],
  },
  arusha: {
    id: "arusha",
    name: "Arusha",
    region: "Arusha",
    center: { lat: -3.37, lon: 36.6944 },
    halfSize: 750,
    chunkSize: 200,
    difficulty: 2,
    skyline: "meru",
    accent: "#00A3DD",
    treeMix: [4, 3, 1],
    unlock: { level: 3, price: 20_000 },
    landmarks: [
      { id: "clock-tower", name: "Clock Tower", lat: -3.37236, lon: 36.69441 },
      { id: "uhuru-torch", name: "Mnara wa Azimio la Arusha", lat: -3.3697, lon: 36.6881 },
    ],
  },
  mwanza: {
    id: "mwanza",
    name: "Mwanza",
    region: "Mwanza",
    center: { lat: -2.5164, lon: 32.9006 },
    halfSize: 750,
    chunkSize: 200,
    difficulty: 3,
    skyline: "lake",
    accent: "#FFC72C",
    treeMix: [5, 2, 2],
    unlock: { level: 5, price: 40_000 },
    landmarks: [
      { id: "bismarck-rock", name: "Bismarck Rock", lat: -2.5195, lon: 32.8975 },
      { id: "mwanza-clock", name: "Saa ya Mwanza", lat: -2.5176, lon: 32.89849 },
    ],
  },
  kariakoo: {
    id: "kariakoo",
    name: "Kariakoo",
    region: "Dar es Salaam",
    center: { lat: -6.8166, lon: 39.2735 },
    halfSize: 750,
    chunkSize: 200,
    difficulty: 4,
    skyline: "ocean",
    accent: "#FF5A4F",
    treeMix: [4, 1, 4],
    unlock: { level: 8, price: 75_000 },
    landmarks: [
      { id: "kariakoo-market", name: "Soko la Kariakoo", lat: -6.81606, lon: 39.2739 },
      { id: "yanga-tawi", name: "Tawi la Yanga, Mtaa wa Uhuru", lat: -6.82308, lon: 39.27147, placement: "curb" },
      { id: "simba-duka", name: "Duka la Simba, Msimbazi", lat: -6.82217, lon: 39.27334, placement: "curb" },
    ],
  },
};

export const CITY_ORDER: CityId[] = ["shinyanga", "arusha", "mwanza", "kariakoo"];

export const isCityId = (value: string): value is CityId => value in CITIES;
