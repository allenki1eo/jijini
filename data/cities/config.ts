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
  id: string;
  name: string;
  lat: number;
  lon: number;
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
    landmarks: [],
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
    landmarks: [{ id: "clock-tower", name: "Clock Tower", lat: -3.36996, lon: 36.69443 }],
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
    landmarks: [{ id: "bismarck-rock", name: "Bismarck Rock", lat: -2.5195, lon: 32.8975 }],
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
    landmarks: [{ id: "kariakoo-market", name: "Soko la Kariakoo", lat: -6.81606, lon: 39.2739 }],
  },
};

export const CITY_ORDER: CityId[] = ["shinyanga", "arusha", "mwanza", "kariakoo"];

export const isCityId = (value: string): value is CityId => value in CITIES;
