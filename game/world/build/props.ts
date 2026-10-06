/**
 * Street furniture, placed deterministically from the baked roads, shops and
 * markets: lamp posts on main roads, kiosks / umbrella vendors / crates in
 * front of shops, vendor clusters in markets, billboards on primary roads.
 */
import { AREA_KINDS, DM, type ChunkData } from "../format";
import { hash2 } from "./writer";

export const PROP_KINDS = ["lamp", "kiosk", "umbrella", "crates", "billboard"] as const;
export type PropKind = (typeof PROP_KINDS)[number];
export const PROP_STRIDE = 5;

const MARKET = AREA_KINDS.indexOf("market");

/** Flat [x, z, yaw, kindIndex, seed, ...]. */
export const buildProps = (chunk: ChunkData): Float32Array => {
  const out: number[] = [];
  const shops: [number, number][] = chunk.buildings
    .filter((b) => b.s)
    .map((b) => {
      let x = 0;
      let z = 0;
      const n = b.p.length / 2;
      for (let i = 0; i < b.p.length; i += 2) {
        x += b.p[i]!;
        z += b.p[i + 1]!;
      }
      return [x / n / DM, z / n / DM];
    });
  const push = (x: number, z: number, yaw: number, kind: PropKind) => out.push(x, z, yaw, PROP_KINDS.indexOf(kind), hash2(x, z));

  for (const road of chunk.roads) {
    if (road.c > 3 || road.c === 6) continue;
    const hw = road.w / DM / 2;
    const paved = !road.u;
    let carry = 0;
    for (let i = 2; i < road.p.length; i += 2) {
      const ax = road.p[i - 2]! / DM, az = road.p[i - 1]! / DM;
      const bx = road.p[i]! / DM, bz = road.p[i + 1]! / DM;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      // Right-hand normal; yaw faces the road from the left side.
      const nx = -dz, nz = dx;
      const yaw = Math.atan2(-dx, -dz);
      for (let s = carry; s < len; s += 12) {
        const px = ax + dx * s, pz = az + dz * s;
        const r = hash2(px * 1.7, pz * 1.3);
        for (const side of [1, -1]) {
          const off = hw + (paved && road.c <= 2 ? 2.2 : 1.6);
          const x = px + nx * off * side, z = pz + nz * off * side;
          // Lamps every ~36 m along paved main roads, alternating sides.
          if (paved && road.c <= 2 && Math.round(s / 12) % 3 === 0 && (Math.round(s / 36) % 2 === 0) === (side === 1)) {
            push(x, z, yaw + (side === 1 ? 0 : Math.PI), "lamp");
            continue;
          }
          const nearShop = shops.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 20 ** 2 && (sx - px) * nx * side + (sz - pz) * nz * side > 0);
          const roll = hash2(x * 0.7, z * 0.9);
          if (nearShop && roll < 0.55) {
            const kind: PropKind = roll < 0.22 ? "kiosk" : roll < 0.44 ? "umbrella" : "crates";
            push(x + dx * (r - 0.5) * 4, z + dz * (r - 0.5) * 4, yaw + (side === 1 ? Math.PI / 2 : -Math.PI / 2), kind);
          } else if (road.c === 0 && roll > 0.965) {
            push(x + nx * side * 2, z + nz * side * 2, yaw + (side === 1 ? Math.PI / 2 : -Math.PI / 2), "billboard");
          }
        }
      }
      carry = (((carry - len) % 12) + 12) % 12;
    }
  }

  // Vendor clusters inside markets.
  for (const area of chunk.areas) {
    if (area.k !== MARKET) continue;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < area.p.length; i += 2) {
      minX = Math.min(minX, area.p[i]! / DM);
      maxX = Math.max(maxX, area.p[i]! / DM);
      minZ = Math.min(minZ, area.p[i + 1]! / DM);
      maxZ = Math.max(maxZ, area.p[i + 1]! / DM);
    }
    for (let x = minX + 3; x < maxX; x += 7) {
      for (let z = minZ + 3; z < maxZ; z += 7) {
        const jx = x + (hash2(x, z) - 0.5) * 3, jz = z + (hash2(z, x) - 0.5) * 3;
        if (!inside(jx * DM, jz * DM, area.p)) continue;
        push(jx, jz, hash2(jx, jz) * Math.PI * 2, hash2(jz, jx) < 0.7 ? "umbrella" : "crates");
      }
    }
  }
  return new Float32Array(out);
};

const inside = (x: number, z: number, ring: number[]) => {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!, zi = ring[i + 1]!, xj = ring[j]!, zj = ring[j + 1]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
