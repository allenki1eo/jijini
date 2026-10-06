/**
 * OSM download: Overpass API first (mirrors in order), then the main OSM API
 * `map` call as a fallback for small boxes. Raw responses are cached in
 * scripts/.cache so re-bakes are offline and reproducible.
 */
import fs from "node:fs/promises";
import path from "node:path";

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
export interface OsmRelation {
  type: "relation";
  id: number;
  members: { type: "node" | "way" | "relation"; ref: number; role: string }[];
  tags?: Record<string, string>;
}
export type OsmElement = OsmNode | OsmWay | OsmRelation;

export interface OsmDump {
  source: "overpass" | "osm-api";
  fetchedAt: string;
  elements: OsmElement[];
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export const overpassQuery = ({ south, west, north, east }: BBox): string => {
  const b = `${south},${west},${north},${east}`;
  return `[out:json][timeout:120];
(
  way["highway"](${b});
  way["building"](${b});
  relation["building"](${b});
  way["natural"~"^(water|wood|scrub|grassland|sand|bare_rock|beach)$"](${b});
  relation["natural"="water"](${b});
  way["waterway"](${b});
  way["landuse"](${b});
  relation["landuse"](${b});
  way["leisure"~"^(park|pitch|garden|playground|stadium)$"](${b});
  way["amenity"](${b});
  node["amenity"](${b});
  node["shop"](${b});
  node["tourism"](${b});
  way["tourism"](${b});
  way["shop"](${b});
  nwr["office"](${b});
  nwr["healthcare"](${b});
  nwr["craft"](${b});
  node["highway"="bus_stop"](${b});
  nwr["public_transport"](${b});
  node["name"]["building"](${b});
  way["barrier"](${b});
  node["natural"="tree"](${b});
);
out body;
>;
out skel qt;`;
};

const fetchWithTimeout = async (url: string, init: RequestInit, ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const fromOverpass = async (bbox: BBox): Promise<OsmElement[]> => {
  const body = new URLSearchParams({ data: overpassQuery(bbox) });
  let lastError: unknown;
  for (const url of OVERPASS_MIRRORS) {
    try {
      console.log(`  → Overpass: ${new URL(url).host}`);
      const res = await fetchWithTimeout(
        url,
        { method: "POST", body, headers: { "User-Agent": "BodaGo-bake/1.0 (game map baker)" } },
        150_000,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      return json.elements;
    } catch (error) {
      lastError = error;
      console.warn(`    ✗ ${(error as Error).message}`);
    }
  }
  throw lastError ?? new Error("All Overpass mirrors failed");
};

/** OSM API v0.6 `map` call: returns everything in the box (max 0.25 deg², 50k nodes). */
const osmApiMap = async ({ south, west, north, east }: BBox): Promise<OsmElement[]> => {
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${west},${south},${east},${north}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": "BodaGo-bake/1.0 (game map baker)" } }, 180_000);
  if (!res.ok) throw new Error(`OSM API HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { elements: OsmElement[] };
  return json.elements;
};

/** Dense towns go over the API's node limit: split the box into quarters (recursively) and merge, de-duplicating shared elements. */
const fromOsmApi = async (bbox: BBox, depth = 0): Promise<OsmElement[]> => {
  if (depth === 0) console.log("  → OSM API v0.6 map (fallback)");
  try {
    return await osmApiMap(bbox);
  } catch (error) {
    if (depth >= 2 || !/too many nodes/i.test((error as Error).message)) throw error;
    console.log(`    … too dense, splitting into quarters (level ${depth + 1})`);
    const midLat = (bbox.south + bbox.north) / 2, midLon = (bbox.west + bbox.east) / 2;
    const quarters: BBox[] = [
      { south: bbox.south, west: bbox.west, north: midLat, east: midLon },
      { south: bbox.south, west: midLon, north: midLat, east: bbox.east },
      { south: midLat, west: bbox.west, north: bbox.north, east: midLon },
      { south: midLat, west: midLon, north: bbox.north, east: bbox.east },
    ];
    const seen = new Set<string>();
    const out: OsmElement[] = [];
    for (const q of quarters) {
      for (const el of await fromOsmApi(q, depth + 1)) {
        const key = `${el.type}/${el.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(el);
      }
    }
    return out;
  }
};

export const loadOsm = async (cityId: string, bbox: BBox, refresh: boolean): Promise<OsmDump> => {
  const cacheDir = path.join(process.cwd(), "scripts/.cache");
  const cacheFile = path.join(cacheDir, `${cityId}.osm.json`);
  if (!refresh) {
    try {
      const cached = JSON.parse(await fs.readFile(cacheFile, "utf8")) as OsmDump;
      console.log(`  ✓ Using cached OSM data from ${cached.fetchedAt} (${cached.source}). Pass --refresh to re-download.`);
      return cached;
    } catch {
      // No cache yet.
    }
  }
  let dump: OsmDump;
  try {
    dump = { source: "overpass", fetchedAt: new Date().toISOString(), elements: await fromOverpass(bbox) };
  } catch {
    dump = { source: "osm-api", fetchedAt: new Date().toISOString(), elements: await fromOsmApi(bbox) };
  }
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(dump));
  console.log(`  ✓ Downloaded ${dump.elements.length.toLocaleString()} elements via ${dump.source}`);
  return dump;
};
