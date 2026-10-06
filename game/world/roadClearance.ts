/**
 * How far a point is from the nearest carriageway edge, over the whole
 * road network (not just the streamed-in chunks). Roadside props use it to
 * keep walls, gates and people off the road.
 */
import type { NavNetwork } from "@/game/traffic/NavNetwork";

const CELL = 16;
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

export interface RoadClearance {
  /** Metres from (x, z) to the nearest road edge; negative on the road. Far from any road: a large number. */
  (x: number, z: number): number;
  /** The nearest road point to (x, z), with that road's half-width, or null if none within ~40 m. */
  nearest(x: number, z: number): { x: number; z: number; half: number; dx: number; dz: number } | null;
}

export const roadClearance = (nav: NavNetwork): RoadClearance => {
  const grid = new Map<number, number[]>();
  const segs: number[] = [];
  const seen = new Set<string>();
  for (const lane of nav.lanes) {
    const { pts } = lane;
    const half = lane.width / 2;
    for (let i = 2; i < pts.length; i += 2) {
      const ax = pts[i - 2]!, az = pts[i - 1]!, bx = pts[i]!, bz = pts[i + 1]!;
      // Two-way roads are two lanes over the same line: index each segment once.
      const id = ax < bx || (ax === bx && az < bz) ? `${ax},${az},${bx},${bz}` : `${bx},${bz},${ax},${az}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const s = segs.length;
      segs.push(ax, az, bx, bz, half);
      const pad = half + 1;
      for (let cx = Math.floor((Math.min(ax, bx) - pad) / CELL); cx <= Math.floor((Math.max(ax, bx) + pad) / CELL); cx++) {
        for (let cz = Math.floor((Math.min(az, bz) - pad) / CELL); cz <= Math.floor((Math.max(az, bz) + pad) / CELL); cz++) {
          const k = key(cx, cz);
          const list = grid.get(k);
          if (list) list.push(s);
          else grid.set(k, [s]);
        }
      }
    }
  }

  const visit = (x: number, z: number, reach: number, fn: (s: number, qx: number, qz: number, d: number) => void) => {
    const done = new Set<number>();
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
        for (const s of grid.get(key(cx, cz)) ?? []) {
          if (done.has(s)) continue;
          done.add(s);
          const ax = segs[s]!, az = segs[s + 1]!, bx = segs[s + 2]!, bz = segs[s + 3]!;
          const dx = bx - ax, dz = bz - az;
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const qx = ax + dx * t, qz = az + dz * t;
          fn(s, qx, qz, Math.hypot(x - qx, z - qz));
        }
      }
    }
  };

  const clearance = ((x: number, z: number) => {
    let best = 99;
    visit(x, z, 24, (s, _qx, _qz, d) => {
      best = Math.min(best, d - segs[s + 4]!);
    });
    return best;
  }) as RoadClearance;

  clearance.nearest = (x, z) => {
    let best: ReturnType<RoadClearance["nearest"]> = null;
    let bestGap = Infinity;
    visit(x, z, 40, (s, qx, qz, d) => {
      const gap = d - segs[s + 4]!;
      if (gap >= bestGap) return;
      bestGap = gap;
      const tx = segs[s + 2]! - segs[s]!, tz = segs[s + 3]! - segs[s + 1]!;
      const tl = Math.hypot(tx, tz) || 1;
      best = { x: qx, z: qz, half: segs[s + 4]!, dx: tx / tl, dz: tz / tl };
    });
    return best;
  };

  return clearance;
};
