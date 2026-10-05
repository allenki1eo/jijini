/** Ground layer: land-use areas, sidewalks, roads, junction discs and lane markings in ONE mesh. */
import earcut from "earcut";
import { DM, ROAD_CLASSES, type BakedArea, type BakedRoad, type ChunkData } from "../format";
import {
  AREA_COLORS,
  AREA_LAYER,
  DIRT_ROAD_COLOR,
  MARKING_COLOR,
  PATH_COLOR,
  SIDEWALK_COLOR,
  TARMAC_COLOR,
  WATER_COLOR,
} from "../palette";
import { roadY, Y_AREA_BASE, Y_AREA_STEP, Y_MARKING, Y_SIDEWALK, Y_WATER } from "./layers";
import { GeometryWriter, hexToRgb, type MeshBuffers, type RGB } from "./writer";

type Vec2 = [number, number];

const AREA_RGB = AREA_COLORS.map(hexToRgb);
const TARMAC = hexToRgb(TARMAC_COLOR);
const DIRT = hexToRgb(DIRT_ROAD_COLOR);
const PATH = hexToRgb(PATH_COLOR);
const SIDEWALK = hexToRgb(SIDEWALK_COLOR);
const MARKING = hexToRgb(MARKING_COLOR);
const WATER = hexToRgb(WATER_COLOR);
const PATH_CLASS = ROAD_CLASSES.indexOf("path");

export const toPoints = (flat: number[]): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i]! / DM, flat[i + 1]! / DM]);
  return out;
};

/** Triangulate a polygon (with holes) flat at height y. */
export const fillPolygon = (w: GeometryWriter, area: BakedArea, y: number, color: RGB, jitter = 0.06) => {
  const coords: number[] = area.p.map((v) => v / DM);
  const holes: number[] = [];
  for (const hole of area.i ?? []) {
    holes.push(coords.length / 2);
    coords.push(...hole.map((v) => v / DM));
  }
  const tris = earcut(coords, holes.length ? holes : undefined, 2);
  const base = w.vertexCount;
  for (let i = 0; i < coords.length; i += 2) w.ground(coords[i]!, y, coords[i + 1]!, color, jitter);
  for (let i = 0; i < tris.length; i += 3) w.triangle(base + tris[i]!, base + tris[i + 1]!, base + tris[i + 2]!);
};

/**
 * Mitered ribbon along a polyline. `before`/`after` are the neighbor points
 * beyond the ends (from the bake), so ribbons split at chunk seams line up.
 */
export const ribbon = (w: GeometryWriter, pts: Vec2[], halfWidth: number, y: number, color: RGB, before?: Vec2, after?: Vec2, jitter = 0.08) => {
  const n = pts.length;
  if (n < 2) return;
  let prevLeft = -1;
  let prevRight = -1;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const prev = i > 0 ? pts[i - 1] : before;
    const next = i < n - 1 ? pts[i + 1] : after;
    // Unit directions of the incoming and outgoing segments.
    let ix = 0, iz = 0, ox = 0, oz = 0;
    if (prev) {
      const l = Math.hypot(p[0] - prev[0], p[1] - prev[1]) || 1;
      ix = (p[0] - prev[0]) / l;
      iz = (p[1] - prev[1]) / l;
    }
    if (next) {
      const l = Math.hypot(next[0] - p[0], next[1] - p[1]) || 1;
      ox = (next[0] - p[0]) / l;
      oz = (next[1] - p[1]) / l;
    }
    if (!prev) {
      ix = ox;
      iz = oz;
    }
    if (!next) {
      ox = ix;
      oz = iz;
    }
    let tx = ix + ox;
    let tz = iz + oz;
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-6) {
      tx = ix;
      tz = iz;
    } else {
      tx /= tl;
      tz /= tl;
    }
    // Miter normal, scaled so the ribbon keeps its width through bends (clamped for hairpins).
    const nx = -tz;
    const nz = tx;
    const cos = Math.max(0.4, Math.abs(nx * -iz + nz * ix));
    const off = halfWidth / cos;
    const left = w.ground(p[0] + nx * off, y, p[1] + nz * off, color, jitter);
    const right = w.ground(p[0] - nx * off, y, p[1] - nz * off, color, jitter);
    if (prevLeft >= 0) w.quad(prevLeft, prevRight, right, left);
    prevLeft = left;
    prevRight = right;
  }
};

/** Dashed line along a polyline at a lateral offset. */
const dashes = (w: GeometryWriter, pts: Vec2[], offset: number, dash: number, gap: number, halfWidth: number, y: number, color: RGB) => {
  let phase = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) continue;
    const dx = (b[0] - a[0]) / len;
    const dz = (b[1] - a[1]) / len;
    const nx = -dz;
    const nz = dx;
    let t = phase;
    while (t < len) {
      const start = Math.max(t, 0);
      const end = Math.min(t + dash, len);
      if (end > start + 0.05) {
        const cx = a[0] + nx * offset;
        const cz = a[1] + nz * offset;
        const v0 = w.ground(cx + dx * start + nx * halfWidth, y, cz + dz * start + nz * halfWidth, color, 0.02);
        const v1 = w.ground(cx + dx * start - nx * halfWidth, y, cz + dz * start - nz * halfWidth, color, 0.02);
        const v2 = w.ground(cx + dx * end - nx * halfWidth, y, cz + dz * end - nz * halfWidth, color, 0.02);
        const v3 = w.ground(cx + dx * end + nx * halfWidth, y, cz + dz * end + nz * halfWidth, color, 0.02);
        w.quad(v0, v1, v2, v3);
      }
      t += dash + gap;
    }
    phase = t - len;
  }
};

/** Offset a polyline sideways (used for edge lines). Simple per-vertex miter. */
const offsetLine = (pts: Vec2[], offset: number): Vec2[] =>
  pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - ((b[1] - a[1]) / l) * offset, p[1] + ((b[0] - a[0]) / l) * offset];
  });

const roadColor = (road: BakedRoad): RGB => (road.c === PATH_CLASS ? PATH : road.u ? DIRT : TARMAC);

export const buildGround = (chunk: ChunkData): MeshBuffers | null => {
  const w = new GeometryWriter();

  for (const area of chunk.areas) {
    fillPolygon(w, area, Y_AREA_BASE + AREA_LAYER[area.k]! * Y_AREA_STEP, AREA_RGB[area.k]!, 0.1);
  }

  for (const road of chunk.roads) {
    const pts = toPoints(road.p);
    const before = road.a ? ([road.a[0] / DM, road.a[1] / DM] as Vec2) : undefined;
    const after = road.b ? ([road.b[0] / DM, road.b[1] / DM] as Vec2) : undefined;
    const half = road.w / DM / 2;
    const paved = !road.u && road.c !== PATH_CLASS;
    const major = paved && road.c <= 2;
    if (major) ribbon(w, pts, half + 1.6, Y_SIDEWALK, SIDEWALK, before, after, 0.05);
    ribbon(w, pts, half, roadY(road.c), roadColor(road), before, after, road.u ? 0.14 : 0.05);
    if (major) {
      if (!road.o) dashes(w, pts, 0, 3, 4, 0.08, Y_MARKING, MARKING);
      if (road.c === 0) {
        for (const side of [half - 0.35, -(half - 0.35)]) ribbon(w, offsetLine(pts, side), 0.07, Y_MARKING, MARKING, undefined, undefined, 0.02);
      }
    }
  }

  // Junction discs smooth out the overlap where ribbons meet.
  const j = chunk.junctions;
  for (let i = 0; i < j.length; i += 5) {
    const x = j[i]! / DM;
    const z = j[i + 1]! / DM;
    const r = (j[i + 2]! / DM) * 1.08;
    const cls = j[i + 3]!;
    const color = cls === PATH_CLASS ? PATH : j[i + 4] ? DIRT : TARMAC;
    const y = roadY(cls) + 0.006;
    const center = w.ground(x, y, z, color, 0.04);
    const segments = 14;
    let first = -1;
    let prev = -1;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const v = w.ground(x + Math.cos(a) * r, y, z + Math.sin(a) * r, color, 0.04);
      if (prev >= 0) w.triangle(center, prev, v);
      else first = v;
      prev = v;
    }
    w.triangle(center, prev, first);
  }

  return w.finish();
};

export const buildWater = (chunk: ChunkData): MeshBuffers | null => {
  const w = new GeometryWriter();
  for (const area of chunk.water.areas) fillPolygon(w, area, Y_WATER, WATER, 0);
  for (const line of chunk.water.lines) ribbon(w, toPoints(line.p), line.w / DM / 2, Y_WATER, WATER, undefined, undefined, 0);
  return w.finish();
};
