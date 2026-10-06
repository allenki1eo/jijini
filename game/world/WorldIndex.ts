/**
 * Spatial index over the loaded chunks: building walls (collisions, camera
 * occlusion) and road segments (surface, minimap). A uniform grid keyed by
 * integer cell; each chunk remembers its cells so unloading is cheap.
 */
import { ROAD_STRIDE } from "./build/collision";

const CELL = 8;
/** Reused across queries so the frame loop doesn't allocate. */
const scratchSeen = new Set<object>();
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

interface ChunkEntry {
  walls: Float32Array;
  roads: Float32Array;
  wallCells: number[];
  roadCells: number[];
}

export interface Surface {
  onRoad: boolean;
  /** Road class index, or -1 off-road. */
  cls: number;
  unpaved: boolean;
  /** Distance from the nearest road centerline (m). */
  distance: number;
}

const segDistSq = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px;
  const z = az + dz * t - pz;
  return { d2: x * x + z * z, t };
};

export class WorldIndex {
  private chunks = new Map<string, ChunkEntry>();
  /** cell -> segments (buffer + offset) overlapping that cell. */
  private wallGrid = new Map<number, { walls: Float32Array; i: number }[]>();
  private roadGrid = new Map<number, { roads: Float32Array; i: number }[]>();
  private readonly surface: Surface = { onRoad: false, cls: -1, unpaved: true, distance: Infinity };
  /** Bumped on every add/remove so caches (minimap) can refresh. */
  version = 0;

  addChunk(chunkKey: string, walls: Float32Array, roads: Float32Array) {
    if (this.chunks.has(chunkKey)) this.removeChunk(chunkKey);
    const entry: ChunkEntry = { walls, roads, wallCells: [], roadCells: [] };
    for (let i = 0; i < walls.length; i += 4) {
      this.insert(this.wallGrid, entry.wallCells, walls[i]!, walls[i + 1]!, walls[i + 2]!, walls[i + 3]!, 0, { walls, i });
    }
    for (let i = 0; i < roads.length; i += ROAD_STRIDE) {
      this.insert(this.roadGrid, entry.roadCells, roads[i]!, roads[i + 1]!, roads[i + 2]!, roads[i + 3]!, roads[i + 4]!, { roads, i });
    }
    this.chunks.set(chunkKey, entry);
    this.version++;
  }

  removeChunk(chunkKey: string) {
    const entry = this.chunks.get(chunkKey);
    if (!entry) return;
    for (const c of entry.wallCells) {
      const list = this.wallGrid.get(c);
      if (!list) continue;
      const kept = list.filter((e) => e.walls !== entry.walls);
      if (kept.length) this.wallGrid.set(c, kept);
      else this.wallGrid.delete(c);
    }
    for (const c of entry.roadCells) {
      const list = this.roadGrid.get(c);
      if (!list) continue;
      const kept = list.filter((e) => e.roads !== entry.roads);
      if (kept.length) this.roadGrid.set(c, kept);
      else this.roadGrid.delete(c);
    }
    this.chunks.delete(chunkKey);
    this.version++;
  }

  private insert<T>(grid: Map<number, T[]>, cells: number[], ax: number, az: number, bx: number, bz: number, pad: number, item: T) {
    const x0 = Math.floor((Math.min(ax, bx) - pad) / CELL);
    const x1 = Math.floor((Math.max(ax, bx) + pad) / CELL);
    const z0 = Math.floor((Math.min(az, bz) - pad) / CELL);
    const z1 = Math.floor((Math.max(az, bz) + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        const list = grid.get(k);
        if (list) list.push(item);
        else grid.set(k, [item]);
        cells.push(k);
      }
    }
  }

  /**
   * Push a circle out of building walls. Returns the collision normal
   * (x, z) and penetration, or null when clear. Resolves the deepest wall.
   */
  resolveCircle(x: number, z: number, r: number, out: { x: number; z: number; nx: number; nz: number; depth: number }): boolean {
    let hit = false;
    out.x = x;
    out.z = z;
    out.depth = 0;
    for (let pass = 0; pass < 2; pass++) {
      const cx0 = Math.floor((out.x - r) / CELL);
      const cx1 = Math.floor((out.x + r) / CELL);
      const cz0 = Math.floor((out.z - r) / CELL);
      const cz1 = Math.floor((out.z + r) / CELL);
      let moved = false;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const list = this.wallGrid.get(key(cx, cz));
          if (!list) continue;
          for (const { walls: w, i } of list) {
            const ax = w[i]!, az = w[i + 1]!, bx = w[i + 2]!, bz = w[i + 3]!;
            const { d2, t } = segDistSq(out.x, out.z, ax, az, bx, bz);
            if (d2 >= r * r) continue;
            const d = Math.sqrt(d2);
            let nx: number;
            let nz: number;
            if (d > 1e-4) {
              nx = (out.x - (ax + (bx - ax) * t)) / d;
              nz = (out.z - (az + (bz - az) * t)) / d;
            } else {
              const l = Math.hypot(bx - ax, bz - az) || 1;
              nx = -(bz - az) / l;
              nz = (bx - ax) / l;
            }
            const depth = r - d;
            out.x += nx * depth;
            out.z += nz * depth;
            if (depth > out.depth) {
              out.depth = depth;
              out.nx = nx;
              out.nz = nz;
            }
            hit = true;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Fraction (0..1) along a→b before the first wall; 1 if clear. Used by the chase camera. */
  raycastWalls(ax: number, az: number, bx: number, bz: number): number {
    let best = 1;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / CELL) + 1;
    // Segments spanning several cells share one entry object.
    const seen = scratchSeen;
    seen.clear();
    for (let s = 0; s <= steps; s++) {
      const px = ax + ((bx - ax) * s) / steps;
      const pz = az + ((bz - az) * s) / steps;
      const list = this.wallGrid.get(key(Math.floor(px / CELL), Math.floor(pz / CELL)));
      if (!list) continue;
      for (const entry of list) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        const { walls: w, i } = entry;
        const t = segmentIntersect(ax, az, bx, bz, w[i]!, w[i + 1]!, w[i + 2]!, w[i + 3]!);
        if (t < best) best = t;
      }
    }
    return best;
  }

  /** Road surface under a point. The returned object is reused; copy fields you keep. */
  surfaceAt(x: number, z: number): Surface {
    const s = this.surface;
    s.onRoad = false;
    s.cls = -1;
    s.unpaved = true;
    s.distance = Infinity;
    const list = this.roadGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return s;
    let best = Infinity;
    for (const { roads: r, i } of list) {
      const { d2 } = segDistSq(x, z, r[i]!, r[i + 1]!, r[i + 2]!, r[i + 3]!);
      const d = Math.sqrt(d2);
      const hw = r[i + 4]!;
      const cls = r[i + 5]!;
      // Prefer the most important road when overlapping (junctions).
      const score = d - hw + cls * 0.01;
      if (score < best) {
        best = score;
        s.distance = d;
        s.onRoad = d <= hw + 0.3;
        s.cls = cls;
        s.unpaved = r[i + 6]! === 1;
      }
    }
    if (!s.onRoad) s.cls = -1;
    return s;
  }

  /** Visit road segments in a square around a point (minimap). */
  forEachRoad(x: number, z: number, radius: number, visit: (r: Float32Array, i: number) => void) {
    const seen = scratchSeen;
    seen.clear();
    for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++) {
      for (let cz = Math.floor((z - radius) / CELL); cz <= Math.floor((z + radius) / CELL); cz++) {
        const list = this.roadGrid.get(key(cx, cz));
        if (!list) continue;
        for (const e of list) {
          if (seen.has(e)) continue;
          seen.add(e);
          visit(e.roads, e.i);
        }
      }
    }
  }
}

/** Parametric t along a→b where it crosses segment c→d, or 1. */
const segmentIntersect = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return 1;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : 1;
};
