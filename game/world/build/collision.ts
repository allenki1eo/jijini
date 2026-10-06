/** Collision data for the runtime WorldIndex: building wall segments and road segments. */
import { DM, type ChunkData } from "../format";

/** Flat [x1, z1, x2, z2, ...] (m) for every building wall edge. */
export const buildWalls = (chunk: ChunkData): Float32Array => {
  const out: number[] = [];
  const ring = (flat: number[]) => {
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(flat[i * 2]! / DM, flat[i * 2 + 1]! / DM, flat[j * 2]! / DM, flat[j * 2 + 1]! / DM);
    }
  };
  for (const b of chunk.buildings) {
    ring(b.p);
    for (const h of b.i ?? []) ring(h);
  }
  return new Float32Array(out);
};

/** Stride of the road segment buffer. */
export const ROAD_STRIDE = 7;

/** Flat [x1, z1, x2, z2, halfWidth, classIndex, unpaved, ...] (m). */
export const buildRoadSegments = (chunk: ChunkData): Float32Array => {
  const out: number[] = [];
  for (const r of chunk.roads) {
    const hw = r.w / DM / 2;
    for (let i = 2; i < r.p.length; i += 2) {
      out.push(r.p[i - 2]! / DM, r.p[i - 1]! / DM, r.p[i]! / DM, r.p[i + 1]! / DM, hw, r.c, r.u ? 1 : 0);
    }
  }
  return new Float32Array(out);
};
