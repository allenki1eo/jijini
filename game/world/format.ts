/**
 * Baked city data format, shared by the bake script (Node) and the runtime
 * (browser + worker). Keep this file dependency-free.
 *
 * Coordinates are integer DECIMETERS in a local tangent plane centered on the
 * city origin: +x = east, +z = south (Three.js convention, north is -z).
 * Polylines and rings are flat arrays: [x0, z0, x1, z1, ...].
 */

export const BAKE_VERSION = 1;

/** Decimeters per meter. */
export const DM = 10;

export const ROAD_CLASSES = ["primary", "secondary", "tertiary", "residential", "service", "track", "path"] as const;
export type RoadClass = (typeof ROAD_CLASSES)[number];

/** Road width in meters, by class index. */
export const ROAD_WIDTH: Record<RoadClass, number> = {
  primary: 9,
  secondary: 8,
  tertiary: 7,
  residential: 5,
  service: 4,
  track: 3,
  path: 2,
};

/** Default speed limit in km/h, by class. */
export const ROAD_SPEED: Record<RoadClass, number> = {
  primary: 50,
  secondary: 50,
  tertiary: 40,
  residential: 30,
  service: 20,
  track: 20,
  path: 10,
};

export const AREA_KINDS = [
  "grass",
  "residential",
  "commercial",
  "market",
  "industrial",
  "farmland",
  "forest",
  "sand",
  "institution",
  "parking",
  "cemetery",
  "pitch",
] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export const TREE_KINDS = ["mango", "acacia", "palm"] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

export const ROOF_KINDS = ["flat", "hip"] as const;

export interface BakedRoad {
  /** Index into ROAD_CLASSES. */
  c: number;
  /** Width in decimeters. */
  w: number;
  /** 1 when unpaved (dirt / gravel). */
  u?: 1;
  /** 1 when one-way. */
  o?: 1;
  /** Polyline (dm). */
  p: number[];
  /** Point before p[0] on the original way, so joins across chunks miter identically. */
  a?: [number, number];
  /** Point after the last point on the original way. */
  b?: [number, number];
}

export interface BakedBuilding {
  /** Outer ring (dm), counter-clockwise when viewed from above. */
  p: number[];
  /** Inner rings (courtyards), clockwise. */
  i?: number[][];
  /** Wall height (dm). */
  h: number;
  /** Wall palette index. */
  c: number;
  /** Roof palette index. */
  r: number;
  /** Index into ROOF_KINDS. */
  k: number;
  /** Hip roofs: base rectangle (dm), the footprint's oriented bounding box. */
  q?: number[];
  /** 1 for shops / commercial frontage (gets awnings + signs later). */
  s?: 1;
}

export interface BakedArea {
  /** Index into AREA_KINDS. */
  k: number;
  p: number[];
  i?: number[][];
}

export interface BakedWaterLine {
  /** Width (dm). */
  w: number;
  p: number[];
}

export interface ChunkData {
  key: string;
  cx: number;
  cz: number;
  roads: BakedRoad[];
  /** Junction discs: flat [x, z, radius (dm), classIndex, unpaved 0|1, ...]. */
  junctions: number[];
  buildings: BakedBuilding[];
  areas: BakedArea[];
  water: { areas: BakedArea[]; lines: BakedWaterLine[] };
  /** Flat [x, z, kindIndex, scale*10, ...] (dm). */
  trees: number[];
}

export interface ChunkRef {
  key: string;
  cx: number;
  cz: number;
  /** Uncompressed JSON size in bytes (for download estimates). */
  bytes: number;
}

export interface CityManifest {
  format: number;
  id: string;
  name: string;
  generatedAt: string;
  source: "overpass" | "osm-api";
  origin: { lat: number; lon: number };
  /** Playable bounds in meters. */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  chunkSize: number;
  chunks: ChunkRef[];
  spawn: { x: number; z: number; heading: number };
  stats: {
    buildings: number;
    roads: number;
    pois: number;
    navNodes: number;
    navEdges: number;
    trees: number;
    /** Kilometres of drivable road (newer bakes). */
    roadKm?: number;
    /** Generated shopfronts and mapped places by kind (newer bakes). */
    shopfronts?: number;
    places?: Partial<Record<PoiKind, number>>;
  };
  totalBytes: number;
  attribution: string;
}

export interface NavEdge {
  /** Node indices. */
  a: number;
  b: number;
  /** Length (dm). */
  l: number;
  c: number;
  w: number;
  /** Speed limit km/h. */
  s: number;
  /** 1 = only a -> b is allowed. */
  o?: 1;
  /** Intermediate points (dm), excluding endpoints. */
  p?: number[];
}

export interface NavGraph {
  format: number;
  /** Flat [x, z, ...] (dm). */
  nodes: number[];
  edges: NavEdge[];
}

export const POI_KINDS = [
  "hospital",
  "clinic",
  "pharmacy",
  "school",
  "market",
  "fuel",
  "bus_station",
  "place_of_worship",
  "bank",
  "restaurant",
  "bar",
  "shop",
  "hotel",
  "police",
  "office",
  "other",
  // Appended later; keep existing indices stable.
  "bus_stop",
  "garage",
  "playground",
  "pitch",
] as const;
export type PoiKind = (typeof POI_KINDS)[number];

export interface Poi {
  /** Index into POI_KINDS. */
  k: number;
  n?: string;
  /** OSM subtype, e.g. "hardware" for shop=hardware or "ngo" for office=ngo. */
  t?: string;
  /** Brand or operator (fuel stations, banks, supermarkets). */
  b?: string;
  /** Long-axis direction in degrees (sports pitches mapped as areas): local +z runs along it. */
  a?: number;
  /** Width and length in metres (sports pitches mapped as areas). */
  s?: [number, number];
  x: number;
  z: number;
  /** Curb point (dm) on the nearest drivable road, where the place's signpost stands. */
  r?: [number, number];
}

export const chunkKey = (cx: number, cz: number): string => `${cx}_${cz}`;

// ── Street frontage (frontage.json) ─────────────────────────────────────────

/**
 * Shop kinds for the generated street frontage. Where OpenStreetMap has no
 * buildings along a street, the bake fills the verge with rows of dukas so
 * streets read as real Tanzanian shopping streets.
 */
export const SHOP_KINDS = ["duka", "phone", "salon", "pharmacy", "hardware", "clothes", "food"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

/** Values per shop in `FrontageFile.shops`. */
export const FRONTAGE_STRIDE = 9;

export interface FrontageFile {
  format: 1;
  /**
   * Flat records of FRONTAGE_STRIDE numbers: x, z (dm, front-centre at the kerb side),
   * yaw (milliradians; the shop faces local −z), width, depth (dm), floors,
   * kind (index into SHOP_KINDS), wall colour (palette index), sign (index into `signs`).
   */
  shops: number[];
  /** Signboard texts: a real OSM shop name where one is nearby, otherwise a typical local one. */
  signs: string[];
}
