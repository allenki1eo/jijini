/**
 * BodaGo city bake pipeline.
 *
 *   npm run bake -- shinyanga            # uses scripts/.cache if present
 *   npm run bake -- shinyanga --refresh  # re-download from Overpass / OSM API
 *
 * Reads OpenStreetMap data, projects it to local meters, simplifies it,
 * builds a navigation graph and writes chunked JSON to public/cities/<id>/.
 * Map data © OpenStreetMap contributors, ODbL 1.0.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { CITIES, isCityId, type CityConfig } from "../data/cities/config";
import {
  AREA_KINDS,
  BAKE_VERSION,
  chunkKey,
  FRONTAGE_STRIDE,
  POI_KINDS,
  ROAD_SPEED,
  SHOP_KINDS,
  type BakedArea,
  type BakedBuilding,
  type BakedRoad,
  type ChunkData,
  type ChunkRef,
  type CityManifest,
  type FrontageFile,
  type NavEdge,
  type NavGraph,
  type Poi,
  type RoadClass,
  type ShopKind,
} from "../game/world/format";
import { FLAT_ROOFS, IRON_ROOFS, WALL_WEIGHTS } from "../game/world/palette";
import {
  areaKind,
  areaKindIndex,
  buildingHeight,
  isCommercialBuilding,
  isDrivable,
  isUnpaved,
  oneWay,
  poiKind,
  poiKindIndex,
  poiSubtype,
  roadClass,
  roadClassIndex,
  roadWidth,
} from "./lib/classify";
import {
  centroid,
  clipPolylineToRect,
  clipRingToRect,
  distToSegment,
  ensureWinding,
  hashId,
  makeProjector,
  orientedBox,
  pointInRing,
  polylineLength,
  rectsOverlap,
  ringBounds,
  seededRandom,
  signedArea,
  simplify,
  simplifyRing,
  toDm,
  vecToDm,
  weightedPick,
  type Rect,
  type Vec2,
} from "./lib/geometry";
import { loadOsm, type OsmElement, type OsmNode, type OsmRelation, type OsmWay } from "./lib/osm";

type Tags = Record<string, string>;

interface RoadFeature {
  id: number;
  cls: RoadClass;
  width: number;
  unpaved: boolean;
  oneway: -1 | 0 | 1;
  nodeIds: number[];
  points: Vec2[];
}

interface Polygon {
  outer: Vec2[];
  holes: Vec2[][];
}

interface BuildingFeature extends Polygon {
  id: number;
  tags: Tags;
}

interface AreaFeature extends Polygon {
  kind: number;
}

const ATTRIBUTION = "Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright";

/** Probability that a scatter-tree candidate becomes a tree, per area kind (index = AREA_KINDS). */
const TREE_DENSITY: Record<(typeof AREA_KINDS)[number] | "bare", number> = {
  grass: 0.4,
  residential: 0.3,
  commercial: 0.05,
  market: 0.02,
  industrial: 0.05,
  farmland: 0.1,
  forest: 0.85,
  sand: 0.03,
  institution: 0.28,
  parking: 0.02,
  cemetery: 0.35,
  pitch: 0,
  bare: 0.2,
};

const log = (msg: string) => console.log(msg);

/** Spatial hash for fast "is anything near this point" queries. */
class SpatialHash<T> {
  private cells = new Map<string, T[]>();
  constructor(private size: number) {}
  private key(cx: number, cz: number) {
    return `${cx},${cz}`;
  }
  insert(rect: Rect, item: T) {
    for (let cx = Math.floor(rect.minX / this.size); cx <= Math.floor(rect.maxX / this.size); cx++) {
      for (let cz = Math.floor(rect.minZ / this.size); cz <= Math.floor(rect.maxZ / this.size); cz++) {
        const k = this.key(cx, cz);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
    }
  }
  query(p: Vec2): T[] {
    return this.cells.get(this.key(Math.floor(p[0] / this.size), Math.floor(p[1] / this.size))) ?? [];
  }
}

const main = async () => {
  const args = process.argv.slice(2);
  const cityArg = args.find((a) => !a.startsWith("--")) ?? "shinyanga";
  if (!isCityId(cityArg)) throw new Error(`Unknown city "${cityArg}". Known: ${Object.keys(CITIES).join(", ")}`);
  const city: CityConfig = CITIES[cityArg];
  const refresh = args.includes("--refresh");

  log(`\n🏍  Baking ${city.name} (${city.region})`);

  const { project, unproject } = makeProjector(city.center.lat, city.center.lon);
  const chunksPerSide = Math.ceil((city.halfSize * 2) / city.chunkSize);
  const half = (chunksPerSide * city.chunkSize) / 2;
  const bounds: Rect = { minX: -half, minZ: -half, maxX: half, maxZ: half };
  const margin = 60;
  const sw = unproject(bounds.minX - margin, bounds.maxZ + margin);
  const ne = unproject(bounds.maxX + margin, bounds.minZ - margin);

  // ── 1. Download ──────────────────────────────────────────────────────────
  const dump = await loadOsm(city.id, { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon }, refresh);

  const nodes = new Map<number, OsmNode>();
  const ways = new Map<number, OsmWay>();
  const relations: OsmRelation[] = [];
  for (const el of dump.elements as OsmElement[]) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.set(el.id, el);
    else relations.push(el);
  }
  const pos = new Map<number, Vec2>();
  for (const n of nodes.values()) pos.set(n.id, project(n.lat, n.lon));

  const wayPoints = (way: OsmWay): Vec2[] => way.nodes.map((id) => pos.get(id)).filter((p): p is Vec2 => Boolean(p));
  const isClosed = (way: OsmWay) => way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1];
  const closedRing = (way: OsmWay): Vec2[] | null => {
    if (!isClosed(way)) return null;
    const pts = wayPoints(way);
    return pts.length >= 4 && pts.length === way.nodes.length ? pts.slice(0, -1) : null;
  };

  /** Stitch relation member ways into closed rings. */
  const assembleRings = (wayIds: number[]): Vec2[][] => {
    const chains = wayIds
      .map((id) => ways.get(id))
      .filter((w): w is OsmWay => Boolean(w))
      .map((w) => [...w.nodes]);
    const rings: Vec2[][] = [];
    while (chains.length) {
      let ring = chains.shift()!;
      let grew = true;
      while (ring[0] !== ring[ring.length - 1] && grew) {
        grew = false;
        for (let i = 0; i < chains.length; i++) {
          const c = chains[i]!;
          const end = ring[ring.length - 1];
          if (c[0] === end) ring = [...ring, ...c.slice(1)];
          else if (c[c.length - 1] === end) ring = [...ring, ...[...c].reverse().slice(1)];
          else continue;
          chains.splice(i, 1);
          grew = true;
          break;
        }
      }
      if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) {
        const pts = ring.slice(0, -1).map((id) => pos.get(id));
        if (pts.every(Boolean)) rings.push(pts as Vec2[]);
      }
    }
    return rings;
  };

  const relationPolygons = (rel: OsmRelation): Polygon[] => {
    const outers = assembleRings(rel.members.filter((m) => m.type === "way" && m.role !== "inner").map((m) => m.ref));
    const inners = assembleRings(rel.members.filter((m) => m.type === "way" && m.role === "inner").map((m) => m.ref));
    return outers.map((outer) => ({ outer, holes: inners.filter((inner) => inner[0] && pointInRing(inner[0], outer)) }));
  };

  // ── 2. Roads ─────────────────────────────────────────────────────────────
  const roads: RoadFeature[] = [];
  for (const way of ways.values()) {
    const tags = way.tags;
    if (!tags?.highway) continue;
    const cls = roadClass(tags);
    if (!cls) continue;
    const ids = way.nodes.filter((id) => pos.has(id));
    if (ids.length < 2) continue;
    const rand = seededRandom(hashId(way.id, 1));
    roads.push({
      id: way.id,
      cls,
      width: roadWidth(tags, cls),
      unpaved: isUnpaved(tags, cls, rand()),
      oneway: oneWay(tags),
      nodeIds: ids,
      points: [],
    });
  }

  // Junctions: OSM nodes shared by roads. Incidence counts each way end once, each pass-through twice.
  const incidence = (filter: (r: RoadFeature) => boolean) => {
    const count = new Map<number, number>();
    for (const r of roads) {
      if (!filter(r)) continue;
      r.nodeIds.forEach((id, i) => {
        const add = i === 0 || i === r.nodeIds.length - 1 ? 1 : 2;
        count.set(id, (count.get(id) ?? 0) + add);
      });
    }
    return count;
  };
  const allIncidence = incidence(() => true);
  const driveIncidence = incidence((r) => isDrivable(r.cls));

  // Simplify each road between junctions so junction vertices survive exactly.
  const computePoints = (r: RoadFeature) => {
    const pts: Vec2[] = [];
    let start = 0;
    for (let i = 1; i < r.nodeIds.length; i++) {
      const isJunction = (allIncidence.get(r.nodeIds[i]!) ?? 0) >= 3;
      if (isJunction || i === r.nodeIds.length - 1) {
        const part = simplify(
          r.nodeIds.slice(start, i + 1).map((id) => pos.get(id)!),
          r.cls === "path" ? 0.8 : 0.4,
        );
        pts.push(...(pts.length ? part.slice(1) : part));
        start = i;
      }
    }
    r.points = pts;
  };
  roads.forEach(computePoints);

  // ── 3. Buildings ─────────────────────────────────────────────────────────
  const buildings: BuildingFeature[] = [];
  for (const way of ways.values()) {
    if (!way.tags?.building || way.tags.building === "no") continue;
    const ring = closedRing(way);
    if (ring) buildings.push({ id: way.id, tags: way.tags, outer: ring, holes: [] });
  }
  for (const rel of relations) {
    if (!rel.tags?.building) continue;
    for (const poly of relationPolygons(rel)) buildings.push({ id: rel.id, tags: rel.tags, ...poly });
  }

  // ── 3b. Roads and buildings that disagree ───────────────────────────────
  // OSM footprints and road centrelines come from different mappers and often overlap.
  // A street must never run through a house: a building sitting on a real road goes
  // (the road is what riders use), and driveways, tracks and footpaths are cut where
  // they run inside a building, so no road appears to come out of a wall.
  {
    const MAJOR = new Set<RoadFeature["cls"]>(["primary", "secondary", "tertiary", "residential"]);
    const hash = new SpatialHash<number>(20);
    buildings.forEach((b, i) => hash.insert(ringBounds(b.outer), i));
    const removed = new Set<number>();
    const hit = (p: Vec2) => {
      for (const i of hash.query(p)) {
        if (removed.has(i)) continue;
        const b = buildings[i]!;
        if (pointInRing(p, b.outer) && !b.holes.some((h) => pointInRing(p, h))) return i;
      }
      return -1;
    };
    /** Points along a segment every ~1.5 m, optionally pushed sideways by `side` metres. */
    const samples = (a: Vec2, b: Vec2, side: number): Vec2[] => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / 1.5));
      const nx = len ? -(b[1] - a[1]) / len : 0, nz = len ? (b[0] - a[0]) / len : 0;
      const out: Vec2[] = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        out.push([x, z]);
        if (side) out.push([x + nx * side, z + nz * side], [x - nx * side, z - nz * side]);
      }
      return out;
    };

    // Buildings on the carriageway of a real street.
    for (const r of roads) {
      if (!MAJOR.has(r.cls)) continue;
      const side = Math.max(0, r.width / 2 - 0.6);
      for (let k = 1; k < r.points.length; k++) {
        for (const p of samples(r.points[k - 1]!, r.points[k]!, side)) {
          const i = hit(p);
          if (i >= 0) removed.add(i);
        }
      }
    }

    // Minor ways: keep only the runs of segments that stay outside buildings.
    const split: RoadFeature[] = [];
    let clipped = 0;
    for (const r of roads) {
      if (MAJOR.has(r.cls)) {
        split.push(r);
        continue;
      }
      const blocked = r.nodeIds.slice(1).map((id, k) => samples(pos.get(r.nodeIds[k]!)!, pos.get(id)!, 0).some((p) => hit(p) >= 0));
      if (!blocked.some(Boolean)) {
        split.push(r);
        continue;
      }
      clipped++;
      let run: number[] = [r.nodeIds[0]!];
      const flush = () => {
        const pts = run.map((id) => pos.get(id)!);
        if (run.length >= 2 && polylineLength(pts) >= 4) split.push({ ...r, nodeIds: run, points: [] });
      };
      blocked.forEach((b, k) => {
        if (b) {
          flush();
          run = [r.nodeIds[k + 1]!];
        } else run.push(r.nodeIds[k + 1]!);
      });
      flush();
    }
    for (const r of split) if (!r.points.length) computePoints(r);
    roads.splice(0, roads.length, ...split);
    const kept = buildings.filter((_, i) => !removed.has(i));
    log(`  ✓ Cleared ${removed.size} buildings off streets, trimmed ${clipped} paths that ran into buildings`);
    buildings.splice(0, buildings.length, ...kept);
  }

  // ── 4. Areas & water ─────────────────────────────────────────────────────
  const areas: AreaFeature[] = [];
  const waterAreas: Polygon[] = [];
  const waterLines: { width: number; points: Vec2[] }[] = [];
  const WATERWAY_WIDTH: Record<string, number> = { river: 14, canal: 7, stream: 3, drain: 1.6, ditch: 1.4 };

  const addAreaFromTags = (tags: Tags, polys: Polygon[]) => {
    if (tags.natural === "water" || tags.water || tags.landuse === "reservoir" || tags.landuse === "basin") {
      waterAreas.push(...polys);
      return;
    }
    if (tags.building || tags.highway) return;
    const kind = areaKind(tags);
    if (kind) for (const p of polys) areas.push({ kind: areaKindIndex(kind), ...p });
  };
  for (const way of ways.values()) {
    const tags = way.tags;
    if (!tags) continue;
    if (tags.waterway && WATERWAY_WIDTH[tags.waterway] && !isClosed(way)) {
      waterLines.push({ width: WATERWAY_WIDTH[tags.waterway]!, points: simplify(wayPoints(way), 0.8) });
      continue;
    }
    const ring = closedRing(way);
    if (ring) addAreaFromTags(tags, [{ outer: simplifyRing(ring, 0.8), holes: [] }]);
  }
  for (const rel of relations) {
    if (rel.tags?.type === "multipolygon" && !rel.tags.building) addAreaFromTags(rel.tags, relationPolygons(rel));
  }

  // ── 5. POIs ──────────────────────────────────────────────────────────────
  // Each place gets a curb point on its nearest drivable road for a signpost and a stopping spot.
  const SIGN_REACH = 60;
  const curbHash = new SpatialHash<{ a: Vec2; b: Vec2; half: number }>(30);
  for (const r of roads) {
    if (!isDrivable(r.cls)) continue;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      curbHash.insert(
        { minX: Math.min(a[0], b[0]) - SIGN_REACH, minZ: Math.min(a[1], b[1]) - SIGN_REACH, maxX: Math.max(a[0], b[0]) + SIGN_REACH, maxZ: Math.max(a[1], b[1]) + SIGN_REACH },
        { a, b, half: r.width / 2 },
      );
    }
  }
  const curbPoint = (p: Vec2): [number, number] | undefined => {
    let best: Vec2 | undefined;
    let bestD = SIGN_REACH;
    for (const { a, b, half } of curbHash.query(p)) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
      const qx = a[0] + dx * t, qz = a[1] + dz * t;
      const d = Math.hypot(p[0] - qx, p[1] - qz);
      if (d >= bestD) continue;
      bestD = d;
      // Step off the carriageway toward the place, onto the verge.
      const off = Math.min(d, half + 1.3);
      best = d > 0.01 ? [qx + ((p[0] - qx) / d) * off, qz + ((p[1] - qz) / d) * off] : [qx, qz];
    }
    return best && vecToDm(best);
  };
  const inBounds = ([x, z]: Vec2) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  const pois: Poi[] = [];
  /** A pitch's long axis (degrees, for local +z) and size, from its mapped outline. */
  const pitchShape = (ring: Vec2[]): Pick<Poi, "a" | "s"> => {
    const [c0, c1, c2] = orientedBox(ring).corners;
    if (!c0 || !c1 || !c2) return {};
    const e1: Vec2 = [c1[0] - c0[0], c1[1] - c0[1]], e2: Vec2 = [c2[0] - c1[0], c2[1] - c1[1]];
    const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    const long = l1 >= l2 ? e1 : e2;
    return { a: Math.round((Math.atan2(long[0], long[1]) * 180) / Math.PI), s: [Math.round(Math.min(l1, l2)), Math.round(Math.max(l1, l2))] };
  };
  const addPoi = (tags: Tags | undefined, p: Vec2, ring?: Vec2[]) => {
    if (!tags || !inBounds(p)) return;
    const kind = poiKind(tags);
    if (!kind) return;
    const [x, z] = vecToDm(p);
    // Bus stops come as several OSM objects (stop, platform, pole); keep one per 25 m.
    if (kind === "bus_stop" && pois.some((o) => o.k === poiKindIndex("bus_stop") && Math.hypot(o.x - x, o.z - z) < 250)) return;
    const name = (tags.name ?? tags["name:sw"] ?? "").trim();
    const brand = (tags.brand ?? (kind === "fuel" || kind === "bank" ? tags.operator : undefined))?.trim();
    const subtype = poiSubtype(tags);
    const curb = curbPoint(p);
    pois.push({
      k: poiKindIndex(kind),
      ...(name ? { n: name } : {}),
      ...(subtype ? { t: subtype } : {}),
      ...(brand && brand !== name ? { b: brand } : {}),
      ...(kind === "pitch" && ring ? pitchShape(ring) : {}),
      x,
      z,
      ...(curb ? { r: curb } : {}),
    });
  };
  for (const n of nodes.values()) addPoi(n.tags, pos.get(n.id)!);
  for (const way of ways.values()) {
    if (!way.tags || way.tags.highway) continue;
    const t = way.tags;
    const ring = closedRing(way);
    if (ring && (t.amenity || t.shop || t.tourism || t.office || t.healthcare || t.craft || t.public_transport || t.leisure === "playground" || t.leisure === "pitch")) addPoi(t, centroid(ring), ring);
  }

  // ── 5b. Street frontage ─────────────────────────────────────────────────
  // Rows of dukas along streets wherever the map has no buildings, so a street
  // is lined with shops instead of opening onto bare ground. Real shop names
  // from OSM go on the signboards nearest to where those shops are mapped.
  const frontage = (() => {
    const rand = seededRandom(hashId(city.center.lat * 1e6 + city.center.lon * 1e3, 9));
    const shops: number[] = [];
    const signs: string[] = [];
    const signIndex = new Map<string, number>();
    const sign = (text: string) => {
      let i = signIndex.get(text);
      if (i === undefined) {
        i = signs.length;
        signs.push(text);
        signIndex.set(text, i);
      }
      return i;
    };
    const GENERIC: Record<ShopKind, string[]> = {
      duka: ["Duka la Mangi", "Duka la Rejareja", "Baraka General Store", "Neema Mini Supermarket", "Mama Zuhura Shop", "Juma & Sons", "Upendo Shop", "Faraja Store"],
      phone: ["Wakala wa Pesa", "Simu & Vocha", "Pesa Point · Wakala", "Smart Phones"],
      salon: ["Saluni ya Kisasa", "Barber Shop", "Mama Rose Saluni", "Classic Cuts"],
      pharmacy: ["Duka la Dawa Baridi", "Afya Pharmacy", "Uzima Dawa"],
      hardware: ["Vifaa vya Ujenzi", "Mabati Hardware", "Fundi Hardware"],
      clothes: ["Mitumba Bora", "Fashion Wear", "Viatu na Nguo", "Kitenge Corner"],
      food: ["Mama Ntilie", "Chipsi Mayai", "Hoteli ya Kisasa", "Mgahawa wa Pwani"],
    };
    const kindOfPoi = (p: Poi): ShopKind | null => {
      const k = POI_KINDS[p.k];
      const t = p.t ?? "";
      if (k === "pharmacy") return "pharmacy";
      if (k === "restaurant" || k === "bar" || t === "fast_food" || t === "cafe") return "food";
      if (k === "bank") return "phone";
      if (k !== "shop") return null;
      if (/hardware|doityourself|building|paint/.test(t)) return "hardware";
      if (/clothes|shoes|fashion|tailor|fabric|boutique/.test(t)) return "clothes";
      if (/hairdresser|beauty|cosmetics/.test(t)) return "salon";
      if (/mobile|electronics|phone|computer/.test(t)) return "phone";
      return "duka";
    };
    const named = pois
      .map((p) => ({ p, kind: kindOfPoi(p), x: p.x / 10, z: p.z / 10 }))
      .filter((e): e is { p: Poi; kind: ShopKind; x: number; z: number } => e.kind !== null && Boolean(e.p.n));
    const usedNames = new Set<Poi>();

    // Everything a shop must stay clear of: buildings, every road (and its cross streets), water, other shops.
    const segHash = new SpatialHash<{ a: Vec2; b: Vec2; half: number }>(20);
    for (const r of roads) {
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1]!, b = r.points[i]!;
        segHash.insert({ minX: Math.min(a[0], b[0]) - 12, minZ: Math.min(a[1], b[1]) - 12, maxX: Math.max(a[0], b[0]) + 12, maxZ: Math.max(a[1], b[1]) + 12 }, { a, b, half: r.width / 2 });
      }
    }
    const bHash = new SpatialHash<number>(20);
    buildings.forEach((b, i) => bHash.insert(ringBounds(b.outer), i));
    const placed = new SpatialHash<Vec2[]>(20);
    const clearOfRoads = (p: Vec2) => segHash.query(p).every(({ a, b, half }) => distToSegment(p, a, b) > half + 1.2);
    const inBuilding = (p: Vec2) => bHash.query(p).some((i) => pointInRing(p, buildings[i]!.outer));
    const inWater = (p: Vec2) => waterAreas.some((w) => pointInRing(p, w.outer));
    // No shop rows across school grounds, pitches, parks or cemeteries, or in front of churches, mosques, schools and the like.
    const OPEN = new Set(["institution", "pitch", "cemetery", "grass"].map((k) => AREA_KINDS.indexOf(k as (typeof AREA_KINDS)[number])));
    const openAreas = areas.filter((a) => OPEN.has(a.kind));
    const CIVIC = new Set(["school", "place_of_worship", "hospital", "police", "playground", "pitch", "clinic"].map((k) => POI_KINDS.indexOf(k as (typeof POI_KINDS)[number])));
    const civic = pois.filter((p) => CIVIC.has(p.k)).map((p) => ({ x: p.x / 10, z: p.z / 10, r: p.s ? p.s[1] / 2 + 6 : 22 }));
    const inOpenGround = (p: Vec2) => openAreas.some((a) => pointInRing(p, a.outer)) || civic.some((c) => Math.hypot(c.x - p[0], c.z - p[1]) < c.r);
    const fits = (rect: Vec2[]) => {
      const c: Vec2 = [(rect[0]![0] + rect[2]![0]) / 2, (rect[0]![1] + rect[2]![1]) / 2];
      const probes: Vec2[] = [...rect, c, ...rect.map((p, i): Vec2 => [(p[0] + rect[(i + 1) % 4]![0]) / 2, (p[1] + rect[(i + 1) % 4]![1]) / 2])];
      if (!probes.every(inBounds)) return false;
      if (probes.some(inBuilding) || !probes.every(clearOfRoads) || inWater(c) || inOpenGround(c)) return false;
      // A building corner poking into the shop, or another shop overlapping it.
      for (const i of bHash.query(c)) if (buildings[i]!.outer.some((v) => pointInRing(v, rect))) return false;
      for (const other of placed.query(c)) if (other.some((v) => pointInRing(v, rect)) || rect.some((v) => pointInRing(v, other))) return false;
      return true;
    };

    // Main roads are lined almost end to end; residential streets get the odd run of dukas between houses.
    const FILL: Partial<Record<RoadFeature["cls"], number>> = { primary: 0.9, secondary: 0.85, tertiary: 0.75, residential: 0.22 };
    const dense = city.difficulty >= 3;
    const MAX = dense ? 1100 : 750;
    const SIDEWALK = 2.8;
    // Main roads first, and within a class the ones nearest the town centre, so the busy core fills before the outskirts.
    const mid = (r: RoadFeature) => r.points[Math.floor(r.points.length / 2)]!;
    const ordered = [...roads].sort((a, b) => roadClassIndex(a.cls) - roadClassIndex(b.cls) || Math.hypot(...mid(a)) - Math.hypot(...mid(b)));
    for (const r of ordered) {
      const fill = FILL[r.cls];
      if (!fill) continue;
      for (const side of [1, -1]) {
        // Walk this side of the road, laying shops shoulder to shoulder in runs.
        let run = rand() < fill;
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1]!, b = r.points[i]!;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 6) continue;
          const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
          // Left normal of the direction of travel, flipped for the other side.
          const nx = tz * side, nz = -tx * side;
          let s = 3;
          while (s < len - 3 && shops.length / FRONTAGE_STRIDE < MAX) {
            if (rand() < 0.08) run = rand() < fill;
            const w = 4 + Math.round(rand() * 6) / 2;
            if (!run || s + w > len - 2) {
              s += 3;
              continue;
            }
            const d = 6 + rand() * 3;
            const off = r.width / 2 + SIDEWALK;
            const cx = a[0] + tx * (s + w / 2) + nx * off, cz = a[1] + tz * (s + w / 2) + nz * off;
            const hx = (tx * w) / 2, hz = (tz * w) / 2;
            const rect: Vec2[] = [
              [cx - hx, cz - hz],
              [cx + hx, cz + hz],
              [cx + hx + nx * d, cz + hz + nz * d],
              [cx - hx + nx * d, cz - hz + nz * d],
            ];
            if (!fits(rect)) {
              s += 1.5;
              continue;
            }
            placed.insert(ringBounds(rect), rect);
            // A real shop mapped near here lends its name and trade.
            const near = named.find((e) => !usedNames.has(e.p) && Math.hypot(e.x - (cx + nx * d * 0.5), e.z - (cz + nz * d * 0.5)) < 28);
            let kind: ShopKind;
            let text: string;
            if (near) {
              usedNames.add(near.p);
              kind = near.kind;
              text = near.p.n!;
            } else {
              kind = SHOP_KINDS[weightedPick([10, 4, 3, 2, 3, 4, 3], rand())]!;
              const list = GENERIC[kind];
              text = list[Math.floor(rand() * list.length)]!;
            }
            const floors = dense ? (rand() < 0.55 ? 2 : rand() < 0.3 ? 3 : 1) : rand() < 0.22 ? 2 : 1;
            // The shop faces the road: local −z points back across the verge.
            const yaw = Math.atan2(-nx, -nz) + Math.PI;
            shops.push(Math.round(cx * 10), Math.round(cz * 10), Math.round(yaw * 1000), Math.round(w * 10), Math.round(d * 10), floors, SHOP_KINDS.indexOf(kind), Math.floor(rand() * 12), sign(text));
            s += w + (rand() < 0.15 ? 1.5 : 0.05);
          }
        }
      }
    }
    return { format: 1, shops, signs } satisfies FrontageFile;
  })();
  log(`  ✓ ${frontage.shops.length / FRONTAGE_STRIDE} shopfronts along the streets (${frontage.signs.length} signboards)`);

  // ── 6. Navigation graph ──────────────────────────────────────────────────
  const navGraph = (() => {
    const drivable = roads.filter((r) => isDrivable(r.cls));
    const nodeIndex = new Map<number, number>();
    const nodePos: Vec2[] = [];
    const isGraphNode = (r: RoadFeature, i: number) =>
      i === 0 || i === r.nodeIds.length - 1 || (driveIncidence.get(r.nodeIds[i]!) ?? 0) >= 3;
    const indexOf = (osmId: number) => {
      let idx = nodeIndex.get(osmId);
      if (idx === undefined) {
        idx = nodePos.length;
        nodeIndex.set(osmId, idx);
        nodePos.push(pos.get(osmId)!);
      }
      return idx;
    };
    const edges: { a: number; b: number; pts: Vec2[]; road: RoadFeature }[] = [];
    for (const r of drivable) {
      let start = 0;
      for (let i = 1; i < r.nodeIds.length; i++) {
        if (!isGraphNode(r, i)) continue;
        let pts = simplify(r.nodeIds.slice(start, i + 1).map((id) => pos.get(id)!), 0.5);
        let a = indexOf(r.nodeIds[start]!);
        let b = indexOf(r.nodeIds[i]!);
        if (r.oneway === -1) {
          pts = [...pts].reverse();
          [a, b] = [b, a];
        }
        if (a !== b) edges.push({ a, b, pts, road: r });
        start = i;
      }
    }
    // Keep only the largest connected component so AI never gets stranded.
    const adj = nodePos.map(() => [] as number[]);
    for (const e of edges) {
      adj[e.a]!.push(e.b);
      adj[e.b]!.push(e.a);
    }
    const comp = new Int32Array(nodePos.length).fill(-1);
    let best = -1;
    let bestSize = 0;
    for (let s = 0, c = 0; s < nodePos.length; s++) {
      if (comp[s] !== -1) continue;
      const stack = [s];
      comp[s] = c;
      let size = 0;
      while (stack.length) {
        const n = stack.pop()!;
        size++;
        for (const m of adj[n]!) {
          if (comp[m] !== -1) continue;
          comp[m] = c;
          stack.push(m);
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = c;
      }
      c++;
    }
    const remap = new Int32Array(nodePos.length).fill(-1);
    const outNodes: number[] = [];
    nodePos.forEach((p, i) => {
      if (comp[i] !== best) return;
      remap[i] = outNodes.length / 2;
      outNodes.push(...vecToDm(p));
    });
    const outEdges: NavEdge[] = edges
      .filter((e) => comp[e.a] === best)
      .map((e) => {
        const inner = e.pts.slice(1, -1);
        return {
          a: remap[e.a]!,
          b: remap[e.b]!,
          l: Math.round(polylineLength(e.pts) * 10),
          c: roadClassIndex(e.road.cls),
          w: Math.round(e.road.width * 10),
          s: ROAD_SPEED[e.road.cls],
          ...(e.road.oneway ? { o: 1 as const } : {}),
          ...(inner.length ? { p: toDm(inner) } : {}),
        };
      });
    return { format: BAKE_VERSION, nodes: outNodes, edges: outEdges } satisfies NavGraph;
  })();

  // Spawn on the most important road near the center.
  const spawn = (() => {
    let best = { x: 0, z: 0, heading: 0, score: Infinity };
    for (const e of navGraph.edges) {
      const ax = navGraph.nodes[e.a * 2]! / 10;
      const az = navGraph.nodes[e.a * 2 + 1]! / 10;
      const nx = e.p ? e.p[0]! / 10 : navGraph.nodes[e.b * 2]! / 10;
      const nz = e.p ? e.p[1]! / 10 : navGraph.nodes[e.b * 2 + 1]! / 10;
      const score = Math.hypot(ax, az) + e.c * 60;
      if (score < best.score) best = { x: ax, z: az, heading: Math.atan2(-(nx - ax), -(nz - az)), score };
    }
    return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10, heading: Math.round(best.heading * 1000) / 1000 };
  })();

  // ── 7. Chunking ──────────────────────────────────────────────────────────
  const chunkRect = (cx: number, cz: number): Rect => ({
    minX: cx * city.chunkSize,
    minZ: cz * city.chunkSize,
    maxX: (cx + 1) * city.chunkSize,
    maxZ: (cz + 1) * city.chunkSize,
  });
  const chunkOf = ([x, z]: Vec2) => [Math.floor(x / city.chunkSize), Math.floor(z / city.chunkSize)] as const;
  const firstChunk = Math.floor(bounds.minX / city.chunkSize);
  const chunks = new Map<string, ChunkData>();
  for (let cx = firstChunk; cx < firstChunk + chunksPerSide; cx++) {
    for (let cz = firstChunk; cz < firstChunk + chunksPerSide; cz++) {
      chunks.set(chunkKey(cx, cz), {
        key: chunkKey(cx, cz),
        cx,
        cz,
        roads: [],
        junctions: [],
        buildings: [],
        areas: [],
        water: { areas: [], lines: [] },
        trees: [],
      });
    }
  }
  const chunkAt = (p: Vec2) => {
    const [cx, cz] = chunkOf(p);
    return chunks.get(chunkKey(cx, cz));
  };

  // Roads, clipped exactly at chunk borders.
  for (const r of roads) {
    const rb = ringBounds(r.points);
    for (const chunk of chunks.values()) {
      const rect = chunkRect(chunk.cx, chunk.cz);
      if (!rectsOverlap(rb, rect)) continue;
      for (const piece of clipPolylineToRect(r.points, rect)) {
        if (polylineLength(piece.points) < 0.05) continue;
        const road: BakedRoad = { c: roadClassIndex(r.cls), w: Math.round(r.width * 10), p: toDm(piece.points) };
        if (r.unpaved) road.u = 1;
        if (r.oneway) road.o = 1;
        if (piece.before) road.a = vecToDm(piece.before);
        if (piece.after) road.b = vecToDm(piece.after);
        chunk.roads.push(road);
      }
    }
  }

  // Junction discs.
  const junctionInfo = new Map<number, { radius: number; cls: number; unpaved: boolean }>();
  for (const r of roads) {
    for (const id of r.nodeIds) {
      if ((allIncidence.get(id) ?? 0) < 3) continue;
      const info = junctionInfo.get(id) ?? { radius: 0, cls: 99, unpaved: true };
      const cls = roadClassIndex(r.cls);
      info.radius = Math.max(info.radius, r.width / 2);
      // The disc takes the surface of the most important road through it.
      if (cls < info.cls || (cls === info.cls && !r.unpaved)) info.unpaved = r.unpaved;
      info.cls = Math.min(info.cls, cls);
      junctionInfo.set(id, info);
    }
  }
  for (const [id, info] of junctionInfo) {
    const p = pos.get(id)!;
    const chunk = inBounds(p) ? chunkAt(p) : undefined;
    chunk?.junctions.push(...vecToDm(p), Math.round(info.radius * 10), info.cls, info.unpaved ? 1 : 0);
  }

  // Buildings, assigned by centroid.
  const buildingHash = new SpatialHash<Rect>(25);
  let buildingCount = 0;
  for (const b of buildings) {
    const outer = ensureWinding(simplifyRing(b.outer, 0.3), true);
    const area = signedArea(outer);
    if (outer.length < 3 || area < 6) continue;
    const c = centroid(outer);
    const chunk = inBounds(c) ? chunkAt(c) : undefined;
    if (!chunk) continue;
    const rand = seededRandom(hashId(b.id, 2));
    const height = buildingHeight(b.tags, area, rand);
    const commercial = isCommercialBuilding(b.tags);
    // Near-rectangular houses get a hipped iron roof over their oriented bounding box.
    const box = orientedBox(outer);
    const isHip = !commercial && height < 7 && area < 420 && area / box.area > 0.8 && rand() < 0.88;
    const roofs = isHip ? IRON_ROOFS : rand() < 0.35 ? IRON_ROOFS : FLAT_ROOFS;
    const baked: BakedBuilding = {
      p: toDm(outer),
      h: Math.round(height * 10),
      c: weightedPick(WALL_WEIGHTS, rand()),
      r: roofs[Math.floor(rand() * roofs.length)]!,
      k: isHip ? 1 : 0,
    };
    const holes = b.holes.map((h) => ensureWinding(simplifyRing(h, 0.3), false)).filter((h) => h.length >= 3);
    if (holes.length) baked.i = holes.map(toDm);
    if (isHip) baked.q = toDm(ensureWinding(box.corners, true));
    if (commercial) baked.s = 1;
    chunk.buildings.push(baked);
    const rb = ringBounds(outer);
    buildingHash.insert(rb, { minX: rb.minX - 1.5, minZ: rb.minZ - 1.5, maxX: rb.maxX + 1.5, maxZ: rb.maxZ + 1.5 });
    buildingCount++;
  }

  // Areas and water polygons, clipped per chunk.
  const clipPolygonInto = (poly: Polygon, kind: number, target: (chunk: ChunkData) => BakedArea[]) => {
    const pb = ringBounds(poly.outer);
    for (const chunk of chunks.values()) {
      const rect = chunkRect(chunk.cx, chunk.cz);
      if (!rectsOverlap(pb, rect)) continue;
      const outer = clipRingToRect(ensureWinding(poly.outer, true), rect);
      if (outer.length < 3 || Math.abs(signedArea(outer)) < 1) continue;
      const holes = poly.holes
        .map((h) => clipRingToRect(ensureWinding(h, false), rect))
        .filter((h) => h.length >= 3 && Math.abs(signedArea(h)) >= 1);
      target(chunk).push({ k: kind, p: toDm(outer), ...(holes.length ? { i: holes.map(toDm) } : {}) });
    }
  };
  for (const a of areas) clipPolygonInto(a, a.kind, (c) => c.areas);
  for (const w of waterAreas) clipPolygonInto(w, 0, (c) => c.water.areas);
  for (const line of waterLines) {
    const lb = ringBounds(line.points);
    for (const chunk of chunks.values()) {
      const rect = chunkRect(chunk.cx, chunk.cz);
      if (!rectsOverlap(lb, rect)) continue;
      for (const piece of clipPolylineToRect(line.points, rect)) {
        chunk.water.lines.push({ w: Math.round(line.width * 10), p: toDm(piece.points) });
      }
    }
  }

  // ── 8. Trees: OSM-mapped trees plus seeded scatter in open ground ────────
  const roadHash = new SpatialHash<{ a: Vec2; b: Vec2; clearance: number }>(20);
  for (const r of roads) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      const clearance = r.width / 2 + (r.cls === "path" ? 1 : 2.5);
      roadHash.insert(
        { minX: Math.min(a[0], b[0]) - clearance, minZ: Math.min(a[1], b[1]) - clearance, maxX: Math.max(a[0], b[0]) + clearance, maxZ: Math.max(a[1], b[1]) + clearance },
        { a, b, clearance },
      );
    }
  }
  const areaBounds = areas.map((a) => ({ area: a, rect: ringBounds(a.outer) }));
  const kindAt = (p: Vec2): (typeof AREA_KINDS)[number] | "bare" => {
    let found: AreaFeature | null = null;
    for (const { area, rect } of areaBounds) {
      if (p[0] < rect.minX || p[0] > rect.maxX || p[1] < rect.minZ || p[1] > rect.maxZ) continue;
      if (!pointInRing(p, area.outer) || area.holes.some((h) => pointInRing(p, h))) continue;
      // Prefer the most specific (non-residential) area.
      if (!found || AREA_KINDS[found.kind] === "residential") found = area;
    }
    return found ? AREA_KINDS[found.kind]! : "bare";
  };
  const blocked = (p: Vec2) =>
    roadHash.query(p).some((s) => distToSegment(p, s.a, s.b) < s.clearance) ||
    buildingHash.query(p).some((r) => p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minZ && p[1] <= r.maxZ) ||
    waterAreas.some((w) => pointInRing(p, w.outer)) ||
    waterLines.some((l) => l.points.some((q, i) => i > 0 && distToSegment(p, l.points[i - 1]!, q) < l.width / 2 + 2));

  const treeMix = city.treeMix;
  let treeCount = 0;
  const addTree = (p: Vec2, kind: number, scale: number) => {
    const chunk = inBounds(p) ? chunkAt(p) : undefined;
    if (!chunk) return;
    chunk.trees.push(...vecToDm(p), kind, Math.round(scale * 10));
    treeCount++;
  };
  for (const n of nodes.values()) {
    if (n.tags?.natural !== "tree") continue;
    const rand = seededRandom(hashId(n.id, 3));
    addTree(pos.get(n.id)!, weightedPick(treeMix, rand()), 0.9 + rand() * 0.5);
  }
  const rand = seededRandom(hashId(city.center.lat * 1e6 + city.center.lon * 1e3, 4));
  const spacing = 11;
  for (let x = bounds.minX + spacing / 2; x < bounds.maxX; x += spacing) {
    for (let z = bounds.minZ + spacing / 2; z < bounds.maxZ; z += spacing) {
      const p: Vec2 = [x + (rand() - 0.5) * spacing * 0.9, z + (rand() - 0.5) * spacing * 0.9];
      const roll = rand();
      const kindRoll = rand();
      const scaleRoll = rand();
      if (roll > TREE_DENSITY[kindAt(p)] || blocked(p)) continue;
      addTree(p, weightedPick(treeMix, kindRoll), 0.75 + scaleRoll * 0.6);
    }
  }

  // ── 9. Write ─────────────────────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "public/cities", city.id);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, "chunks"), { recursive: true });

  const chunkRefs: ChunkRef[] = [];
  let totalBytes = 0;
  for (const chunk of chunks.values()) {
    const empty =
      !chunk.roads.length && !chunk.buildings.length && !chunk.areas.length && !chunk.water.areas.length && !chunk.water.lines.length && !chunk.trees.length;
    if (empty) continue;
    const json = JSON.stringify(chunk);
    await fs.writeFile(path.join(outDir, "chunks", `${chunk.key}.json`), json);
    const bytes = Buffer.byteLength(json);
    chunkRefs.push({ key: chunk.key, cx: chunk.cx, cz: chunk.cz, bytes });
    totalBytes += bytes;
  }
  // Stylized map for the city-select card: major roads normalized to 0..1000.
  const size = bounds.maxX - bounds.minX;
  const preview = roads
    .filter((r) => roadClassIndex(r.cls) <= 3)
    .map((r) => ({
      c: roadClassIndex(r.cls),
      p: simplify(r.points, 6).flatMap(([x, z]) => [Math.round(((x - bounds.minX) / size) * 1000), Math.round(((z - bounds.minZ) / size) * 1000)]),
    }));
  await fs.writeFile(path.join(outDir, "preview.json"), JSON.stringify(preview));

  const navJson = JSON.stringify(navGraph);
  const poiJson = JSON.stringify(pois);
  await fs.writeFile(path.join(outDir, "navgraph.json"), navJson);
  await fs.writeFile(path.join(outDir, "pois.json"), poiJson);
  const frontageJson = JSON.stringify(frontage);
  await fs.writeFile(path.join(outDir, "frontage.json"), frontageJson);
  totalBytes += Buffer.byteLength(frontageJson);
  totalBytes += Buffer.byteLength(navJson) + Buffer.byteLength(poiJson);

  const manifest: CityManifest = {
    format: BAKE_VERSION,
    id: city.id,
    name: city.name,
    generatedAt: new Date().toISOString(),
    source: dump.source,
    origin: city.center,
    bounds,
    chunkSize: city.chunkSize,
    chunks: chunkRefs,
    spawn,
    stats: {
      buildings: buildingCount,
      roads: roads.length,
      pois: pois.length,
      navNodes: navGraph.nodes.length / 2,
      navEdges: navGraph.edges.length,
      trees: treeCount,
      roadKm: Math.round(navGraph.edges.reduce((sum, e) => sum + e.l, 0) / 10 / 100) / 10,
      shopfronts: frontage.shops.length / FRONTAGE_STRIDE,
      places: Object.fromEntries(POI_KINDS.map((k, i) => [k, pois.filter((p) => p.k === i).length]).filter(([, n]) => (n as number) > 0)),
    },
    totalBytes,
    attribution: ATTRIBUTION,
  };
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  log(`  ✓ ${buildingCount.toLocaleString()} buildings, ${roads.length} roads, ${areas.length} areas, ${treeCount.toLocaleString()} trees, ${pois.length} POIs`);
  log(`  ✓ Nav graph: ${manifest.stats.navNodes} nodes, ${manifest.stats.navEdges} edges`);
  log(`  ✓ ${chunkRefs.length} chunks, ${(totalBytes / 1024).toFixed(0)} KiB → public/cities/${city.id}/`);
  log(`  ✓ Spawn at (${spawn.x}, ${spawn.z})\n`);
};

main().catch((error: unknown) => {
  console.error(`\n✗ Bake failed: ${(error as Error).stack ?? error}`);
  process.exit(1);
});
