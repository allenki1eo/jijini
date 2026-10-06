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
  ROAD_SPEED,
  type BakedArea,
  type BakedBuilding,
  type BakedRoad,
  type ChunkData,
  type ChunkRef,
  type CityManifest,
  type NavEdge,
  type NavGraph,
  type Poi,
  type RoadClass,
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
  for (const r of roads) {
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
  }

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
  const inBounds = ([x, z]: Vec2) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  const pois: Poi[] = [];
  const addPoi = (tags: Tags | undefined, p: Vec2) => {
    if (!tags || !inBounds(p)) return;
    const kind = poiKind(tags);
    if (!kind) return;
    const [x, z] = vecToDm(p);
    pois.push({ k: poiKindIndex(kind), ...(tags.name ? { n: tags.name.trim() } : {}), x, z });
  };
  for (const n of nodes.values()) addPoi(n.tags, pos.get(n.id)!);
  for (const way of ways.values()) {
    if (!way.tags || way.tags.highway) continue;
    const ring = closedRing(way);
    if (ring && (way.tags.amenity || way.tags.shop || way.tags.tourism)) addPoi(way.tags, centroid(ring));
  }

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
