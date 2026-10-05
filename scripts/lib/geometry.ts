/** Pure 2D geometry helpers for the bake pipeline (meters unless noted). */

export type Vec2 = [number, number];

export { makeProjector } from "../../game/world/projection";

/** Mulberry32: tiny deterministic PRNG. */
export const seededRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Stable hash for numeric OSM ids (ids exceed 2^32). */
export const hashId = (id: number, salt = 0): number => {
  let h = (Math.floor(id / 4294967296) * 31 + (id >>> 0) + salt * 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

export const weightedPick = (weights: readonly number[], r: number): number => {
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc -= weights[i]!;
    if (acc <= 0) return i;
  }
  return weights.length - 1;
};

const sqSegDist = (p: Vec2, a: Vec2, b: Vec2): number => {
  let [x, z] = a;
  let dx = b[0] - x;
  let dz = b[1] - z;
  if (dx !== 0 || dz !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - z) * dz) / (dx * dx + dz * dz);
    if (t > 1) {
      x = b[0];
      z = b[1];
    } else if (t > 0) {
      x += dx * t;
      z += dz * t;
    }
  }
  dx = p[0] - x;
  dz = p[1] - z;
  return dx * dx + dz * dz;
};

export const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number => Math.sqrt(sqSegDist(p, a, b));

/** Douglas-Peucker simplification (iterative, keeps endpoints). */
export const simplify = (points: Vec2[], tolerance: number): Vec2[] => {
  if (points.length <= 2) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i]!, points[first]!, points[last]!);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (index !== -1 && maxSq > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

/** Simplify a closed ring (no repeated closing point). */
export const simplifyRing = (ring: Vec2[], tolerance: number): Vec2[] => {
  if (ring.length <= 4) return ring;
  // Split at the vertex farthest from the first so both halves keep their shape.
  let far = 0;
  let farSq = 0;
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i]![0] - ring[0]![0];
    const dz = ring[i]![1] - ring[0]![1];
    if (dx * dx + dz * dz > farSq) {
      farSq = dx * dx + dz * dz;
      far = i;
    }
  }
  const a = simplify(ring.slice(0, far + 1), tolerance);
  const b = simplify([...ring.slice(far), ring[0]!], tolerance);
  return [...a, ...b.slice(1, -1)];
};

/** Signed area in the x/z plane. Positive = counter-clockwise seen from above (+y). */
export const signedArea = (ring: Vec2[]): number => {
  // Seen from above with +z pointing south, the shoelace sign flips.
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j]![0] - ring[i]![0]) * (ring[j]![1] + ring[i]![1]);
  }
  return -s / 2;
};

export const ensureWinding = (ring: Vec2[], ccw: boolean): Vec2[] =>
  signedArea(ring) > 0 === ccw ? ring : [...ring].reverse();

export const centroid = (ring: Vec2[]): Vec2 => {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return [x / ring.length, z / ring.length];
};

export const pointInRing = (p: Vec2, ring: Vec2[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const ringBounds = (ring: Vec2[]): Rect => {
  const r: Rect = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const [x, z] of ring) {
    if (x < r.minX) r.minX = x;
    if (x > r.maxX) r.maxX = x;
    if (z < r.minZ) r.minZ = z;
    if (z > r.maxZ) r.maxZ = z;
  }
  return r;
};

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** Sutherland-Hodgman polygon clip against an axis-aligned rectangle. */
export const clipRingToRect = (ring: Vec2[], r: Rect): Vec2[] => {
  type Edge = { inside: (p: Vec2) => boolean; cut: (a: Vec2, b: Vec2) => Vec2 };
  const lerpX = (a: Vec2, b: Vec2, x: number): Vec2 => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const lerpZ = (a: Vec2, b: Vec2, z: number): Vec2 => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z];
  const edges: Edge[] = [
    { inside: (p) => p[0] >= r.minX, cut: (a, b) => lerpX(a, b, r.minX) },
    { inside: (p) => p[0] <= r.maxX, cut: (a, b) => lerpX(a, b, r.maxX) },
    { inside: (p) => p[1] >= r.minZ, cut: (a, b) => lerpZ(a, b, r.minZ) },
    { inside: (p) => p[1] <= r.maxZ, cut: (a, b) => lerpZ(a, b, r.maxZ) },
  ];
  let out = ring;
  for (const edge of edges) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!;
      const prev = input[(i + input.length - 1) % input.length]!;
      const curIn = edge.inside(cur);
      const prevIn = edge.inside(prev);
      if (curIn) {
        if (!prevIn) out.push(edge.cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(edge.cut(prev, cur));
      }
    }
  }
  return out;
};

/**
 * Clip a polyline to a rectangle (Liang-Barsky per segment). Returns the
 * inside pieces, each with the original neighbor points just outside the
 * piece so joins can be mitered identically on both sides of a chunk seam.
 */
export interface ClippedPiece {
  points: Vec2[];
  before?: Vec2;
  after?: Vec2;
}

export const clipPolylineToRect = (line: Vec2[], r: Rect): ClippedPiece[] => {
  const pieces: ClippedPiece[] = [];
  let current: ClippedPiece | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    let t0 = 0;
    let t1 = 1;
    const tests: [number, number][] = [
      [-dx, a[0] - r.minX],
      [dx, r.maxX - a[0]],
      [-dz, a[1] - r.minZ],
      [dz, r.maxZ - a[1]],
    ];
    let visible = true;
    for (const [p, q] of tests) {
      if (p === 0) {
        if (q < 0) visible = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (!visible || t0 >= t1) {
      current = null;
      continue;
    }
    const start: Vec2 = [a[0] + dx * t0, a[1] + dz * t0];
    const end: Vec2 = [a[0] + dx * t1, a[1] + dz * t1];
    if (!current) {
      current = { points: [start] };
      // A mid-segment cut has the segment itself as its direction.
      current.before = t0 > 0 ? a : line[i - 1];
      pieces.push(current);
    }
    current.points.push(end);
    current.after = t1 < 1 ? b : line[i + 2];
    if (t1 < 1) current = null;
  }
  return pieces.filter((piece) => piece.points.length >= 2);
};

export const polylineLength = (line: Vec2[]): number => {
  let len = 0;
  for (let i = 1; i < line.length; i++) len += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return len;
};

/** Meters -> integer decimeters, flattened. */
export const toDm = (points: Vec2[]): number[] => {
  const out: number[] = [];
  for (const [x, z] of points) out.push(Math.round(x * 10), Math.round(z * 10));
  return out;
};

export const vecToDm = (p: Vec2): [number, number] => [Math.round(p[0] * 10), Math.round(p[1] * 10)];

/** Convex hull (Andrew's monotone chain). */
export const convexHull = (points: Vec2[]): Vec2[] => {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

/** Minimum-area oriented rectangle around a ring (rotating calipers over its hull). */
export const orientedBox = (ring: Vec2[]): { corners: Vec2[]; area: number } => {
  const hull = convexHull(ring);
  let best = { corners: [] as Vec2[], area: Infinity };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of hull) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      const back = (u: number, v: number): Vec2 => [u * ux - v * uz, u * uz + v * ux];
      best = { area, corners: [back(minU, minV), back(maxU, minV), back(maxU, maxV), back(minU, maxV)] };
    }
  }
  return best;
};
