/**
 * Buildings: extruded footprints with flat or hipped roofs, merged into one
 * mesh per chunk. Window strips, plinths and shop signs are drawn by the
 * facade shader from the per-vertex `facade` attribute.
 */
import earcut from "earcut";
import { DM, type BakedBuilding, type ChunkData } from "../format";
import { ROOF_COLORS, WALL_COLORS } from "../palette";
import { toPoints } from "./ground";
import { GeometryWriter, hash2, hexToRgb, type MeshBuffers, type RGB } from "./writer";

type Vec2 = [number, number];

const WALL_RGB = WALL_COLORS.map(hexToRgb);
const ROOF_RGB = ROOF_COLORS.map(hexToRgb);

const PARAPET = 0.6;

/** Facade style codes read by the shader. */
export const FACADE_PLAIN = 0;
/** Shops: 1 + sign color seed in [0, 1). */
export const FACADE_SHOP = 1;

const walls = (w: GeometryWriter, ring: Vec2[], height: number, color: RGB, style: number) => {
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    // Outward normal for counter-clockwise rings (seen from above); holes are clockwise so face inward.
    const nx = -dz / len;
    const nz = dx / len;
    // Fake sun-facing variation keeps neighboring walls readable even without shadows.
    const shade = 0.94 + 0.06 * hash2(a[0], a[1]);
    const v0 = w.vertex(a[0], 0, a[1], nx, 0, nz, color, shade, [u, 0, style]);
    const v1 = w.vertex(b[0], 0, b[1], nx, 0, nz, color, shade, [u + len, 0, style]);
    const v2 = w.vertex(b[0], height, b[1], nx, 0, nz, color, shade, [u + len, height, style]);
    const v3 = w.vertex(a[0], height, a[1], nx, 0, nz, color, shade, [u, height, style]);
    w.quad(v0, v1, v2, v3, nx, 0, nz);
    u += len;
  }
};

const flatRoof = (w: GeometryWriter, outer: Vec2[], holes: Vec2[][], height: number, color: RGB) => {
  const coords = outer.flat();
  const holeStarts: number[] = [];
  for (const h of holes) {
    holeStarts.push(coords.length / 2);
    coords.push(...h.flat());
  }
  const tris = earcut(coords, holeStarts.length ? holeStarts : undefined, 2);
  const base = w.vertexCount;
  for (let i = 0; i < coords.length; i += 2) w.vertex(coords[i]!, height, coords[i + 1]!, 0, 1, 0, color);
  for (let i = 0; i < tris.length; i += 3) w.triangle(base + tris[i]!, base + tris[i + 1]!, base + tris[i + 2]!);
};

/** Face with its own flat normal, oriented upward. */
const roofFace = (w: GeometryWriter, pts: [number, number, number][], color: RGB) => {
  const [a, b, c] = pts as [[number, number, number], [number, number, number], [number, number, number]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  const s = ny < 0 ? -1 / l : 1 / l;
  nx *= s;
  ny *= s;
  nz *= s;
  const ids = pts.map((p) => w.vertex(p[0], p[1], p[2], nx, ny, nz, color));
  if (ids.length === 3) w.triangle(ids[0]!, ids[1]!, ids[2]!, nx, ny, nz);
  else w.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!, nx, ny, nz);
};

/** Hipped corrugated-iron roof for four-cornered houses, with a small eave overhang. */
const hipRoof = (w: GeometryWriter, ring: Vec2[], height: number, color: RGB) => {
  const cx = (ring[0]![0] + ring[1]![0] + ring[2]![0] + ring[3]![0]) / 4;
  const cz = (ring[0]![1] + ring[1]![1] + ring[2]![1] + ring[3]![1]) / 4;
  const eave = ring.map(([x, z]): Vec2 => {
    const l = Math.hypot(x - cx, z - cz) || 1;
    return [x + ((x - cx) / l) * 0.45, z + ((z - cz) / l) * 0.45];
  });
  const len = (i: number) => Math.hypot(eave[(i + 1) % 4]![0] - eave[i]![0], eave[(i + 1) % 4]![1] - eave[i]![1]);
  // Rotate so edges 0 and 2 are the long sides.
  const shift = len(0) + len(2) >= len(1) + len(3) ? 0 : 1;
  const p = [0, 1, 2, 3].map((i) => eave[(i + shift) % 4]!);
  const short = (Math.hypot(p[2]![0] - p[1]![0], p[2]![1] - p[1]![1]) + Math.hypot(p[0]![0] - p[3]![0], p[0]![1] - p[3]![1])) / 2;
  const long = (Math.hypot(p[1]![0] - p[0]![0], p[1]![1] - p[0]![1]) + Math.hypot(p[3]![0] - p[2]![0], p[3]![1] - p[2]![1])) / 2;
  const rise = Math.min(Math.max(short * 0.32, 0.9), 2.4);
  const top = height + rise;
  const m1: Vec2 = [(p[1]![0] + p[2]![0]) / 2, (p[1]![1] + p[2]![1]) / 2];
  const m3: Vec2 = [(p[3]![0] + p[0]![0]) / 2, (p[3]![1] + p[0]![1]) / 2];
  const inset = Math.min(short / 2, long / 2 - 0.01) / Math.max(long, 0.01);
  const ra: [number, number, number] = [m3[0] + (m1[0] - m3[0]) * inset, top, m3[1] + (m1[1] - m3[1]) * inset];
  const rb: [number, number, number] = [m1[0] + (m3[0] - m1[0]) * inset, top, m1[1] + (m3[1] - m1[1]) * inset];
  const at = (q: Vec2): [number, number, number] => [q[0], height, q[1]];
  roofFace(w, [at(p[0]!), at(p[1]!), rb, ra], color);
  roofFace(w, [at(p[1]!), at(p[2]!), rb], color);
  roofFace(w, [at(p[2]!), at(p[3]!), ra, rb], color);
  roofFace(w, [at(p[3]!), at(p[0]!), ra], color);
};

const buildOne = (w: GeometryWriter, b: BakedBuilding) => {
  const outer = toPoints(b.p);
  const holes = (b.i ?? []).map(toPoints);
  const height = b.h / DM;
  const tint = 0.92 + hash2(outer[0]![0], outer[0]![1]) * 0.12;
  const wall = WALL_RGB[b.c]!.map((v) => v * tint) as unknown as RGB;
  const roof = ROOF_RGB[b.r]!;
  const style = b.s ? FACADE_SHOP + hash2(outer[0]![1], outer[0]![0]) * 0.999 : FACADE_PLAIN;
  const hip = b.k === 1 && b.q;
  // Flat roofs sit just below the wall tops, which reads as a parapet from the street.
  const wallTop = hip ? height : height + PARAPET;
  walls(w, outer, wallTop, wall, style);
  for (const h of holes) walls(w, h, wallTop, wall, FACADE_PLAIN);
  if (hip) hipRoof(w, toPoints(b.q!), height, roof);
  else flatRoof(w, outer, holes, height, roof);
};

export const buildBuildings = (chunk: ChunkData): MeshBuffers | null => {
  const w = new GeometryWriter(true);
  for (const b of chunk.buildings) buildOne(w, b);
  return w.finish();
};
