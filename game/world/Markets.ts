/**
 * Street markets: around every mapped marketplace, the verges fill with
 * stalls — produce tables under tin roofs, mitumba clothes racks under
 * umbrellas, mama ntilie cooking spots and kikapu (basket) sellers — each
 * with a seller, plus shoppers browsing in front. The stall fronts are
 * solid, so you weave the boda between them.
 */
import * as THREE from "three";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { POI_KINDS, type Poi } from "./format";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { CLOTHES, PERSON_GEOMETRY, PERSON_KINDS, personKindFor, type PersonKind } from "./people";

const STALL_KINDS = ["produce", "mitumba", "ntilie", "baskets"] as const;
type StallKind = (typeof STALL_KINDS)[number];

const RADIUS = 55;
const STEP = 2.7;
const MAX_MARKETS = 8;
const MAX_STALLS = 60;

const pile = (x: number, z: number, color: string, r = 0.11) => [0, 1, 2, 3, 4].map((i) => part(new THREE.SphereGeometry(r, 6, 5).translate(x + ((i % 3) - 1) * r * 1.6, 0.92 + (i > 2 ? r * 1.4 : 0), z + (i > 2 ? 0 : (i % 2) * r * 1.2)), color));

/** Stall models; local −z faces the road. Tinted parts take each stall's colour. */
const STALL_GEOMETRY: Record<StallKind, () => THREE.BufferGeometry> = {
  produce: () =>
    merge([
      part(block(2.1, 0.08, 1.1, 0, 0.82, 0), "#8B5E3C"),
      ...[-0.95, 0.95].flatMap((x) => [-0.45, 0.45].map((z) => part(block(0.07, 0.82, 0.07, x, 0.41, z), "#6B4A33"))),
      ...[-0.95, 0.95].map((x) => part(block(0.07, 2.2, 0.07, x, 1.1, 0.55), "#6B4A33")),
      part(block(2.4, 0.05, 1.6, 0, 2.15, 0.05).rotateX(-0.12), "#FFFFFF", { tint: true }),
      ...pile(-0.6, -0.15, "#D7261E"),
      ...pile(0.0, -0.15, "#7B3F8C"),
      ...pile(0.6, -0.15, "#F2994A", 0.1),
      part(block(0.55, 0.1, 0.35, -0.3, 0.92, 0.3), "#4E9A3A"),
      part(new THREE.CapsuleGeometry(0.05, 0.3, 2, 6).rotateZ(1.2).translate(0.45, 0.94, 0.3), "#F2C94C"),
      part(new THREE.CapsuleGeometry(0.05, 0.3, 2, 6).rotateZ(1.0).translate(0.5, 0.98, 0.22), "#F2C94C"),
    ]),
  mitumba: () =>
    merge([
      part(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6).translate(0, 1.15, 0.2), "#4B5563"),
      part(new THREE.ConeGeometry(1.5, 0.6, 8).translate(0, 2.4, 0.2), "#FFFFFF", { tint: true }),
      part(block(1.9, 0.04, 0.04, 0, 1.75, -0.1), "#4B5563"),
      ...[-0.7, -0.25, 0.2, 0.65].map((x, i) => part(block(0.36, 0.7, 0.08, x, 1.36, -0.1), ["#1F4E8C", "#E0457B", "#F4F1EA", "#2E9E5B"][i]!)),
      part(block(1.6, 0.35, 0.8, 0, 0.18, 0.4), "#C9B79C"),
      part(block(1.5, 0.12, 0.7, 0, 0.42, 0.4), "#7C3AED"),
    ]),
  ntilie: () =>
    merge([
      part(block(1.8, 0.06, 0.8, 0.3, 0.78, 0.2), "#8B5E3C"),
      ...[-0.5, 1.1].map((x) => part(block(0.06, 0.78, 0.7, x, 0.39, 0.2), "#6B4A33")),
      // Charcoal jiko with a sufuria on top, and a bench for customers.
      part(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 10).translate(-0.85, 0.18, -0.1), "#3A3F4A"),
      part(new THREE.CylinderGeometry(0.24, 0.2, 0.22, 12).translate(-0.85, 0.48, -0.1), "#C9D0DC"),
      part(new THREE.SphereGeometry(0.12, 6, 4).translate(-0.85, 0.42, -0.1), "#FF6A1F", { glow: true }),
      part(block(1.6, 0.08, 0.32, 0.3, 0.45, -0.55), "#6B4A33"),
      ...[0.2, 0.55].map((x) => part(new THREE.CylinderGeometry(0.12, 0.1, 0.08, 10).translate(x, 0.85, 0.15), "#F4F1EA")),
      part(block(2.4, 0.05, 1.8, 0.1, 2.1, 0.1), "#FFFFFF", { tint: true }),
      ...[-1.0, 1.2].map((x) => part(block(0.06, 2.1, 0.06, x, 1.05, 0.9), "#6B4A33")),
    ]),
  baskets: () =>
    merge([
      part(block(2.0, 0.05, 1.2, 0, 0.03, 0), "#FFFFFF", { tint: true }),
      ...[-0.6, 0, 0.6].map((x) => part(new THREE.CylinderGeometry(0.28, 0.2, 0.32, 10).translate(x, 0.2, -0.1), "#C8913A")),
      ...[-0.3, 0.3].map((x) => part(new THREE.CylinderGeometry(0.24, 0.18, 0.28, 10).translate(x, 0.5, -0.05), "#B07A2E")),
      part(new THREE.CylinderGeometry(0.22, 0.17, 0.26, 10).translate(0, 0.76, -0.05), "#C8913A"),
      ...[-0.75, 0.75].map((x) => part(block(0.6, 0.25, 0.6, x, 0.15, 0.4), "#D69A57")),
    ]),
};

const STALL_COLORS: Record<StallKind, string[]> = {
  produce: ["#9AA3AD", "#B8BFC7", "#1E5AA8", "#2E9E5B"],
  mitumba: ["#FF5A4F", "#FFC72C", "#00A3DD", "#2E9E5B", "#E0457B"],
  ntilie: ["#1E5AA8", "#D7261E", "#2E9E5B"],
  baskets: ["#E0457B", "#FFC72C", "#7C3AED", "#00A3DD"],
};

interface Stall {
  kind: StallKind;
  x: number;
  z: number;
  yaw: number;
}

export class Markets {
  readonly group = new THREE.Group();
  /** Collision segments along the stall fronts, flat [x1, z1, x2, z2, ...]. */
  readonly walls: number[] = [];
  /** Market centres (for crowds and ambience). */
  readonly centres: [number, number][] = [];
  private readonly material = createInstancedMaterial({ glowStrength: 2 });
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(nav: NavNetwork, pois: Poi[]) {
    this.group.name = "markets";
    const marketKind = POI_KINDS.indexOf("market");
    for (const poi of pois) {
      // Open-air markets, not supermarkets.
      if (poi.k !== marketKind || (poi.t && poi.t !== "marketplace")) continue;
      const x = poi.x / 10, z = poi.z / 10;
      if (this.centres.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 120)) continue;
      this.centres.push([x, z]);
      if (this.centres.length >= MAX_MARKETS) break;
    }

    const stalls: Stall[] = [];
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    this.centres.forEach(([mx, mz], m) => {
      let count = 0;
      for (const lane of nav.lanes) {
        if (lane.cls === 0) continue;
        for (let s = 3; s < lane.length - 3 && count < MAX_STALLS; s += STEP) {
          nav.sample(lane.id, s, p);
          if (Math.hypot(p.x - mx, p.z - mz) > RADIUS) continue;
          // On the left verge of this direction (the other direction's lane fills the far side).
          const off = lane.width / 2 + 1.5;
          const x = p.x + p.dz * off, z = p.z - p.dx * off;
          if (stalls.some((o) => Math.hypot(o.x - x, o.z - z) < 2.3)) continue;
          // Leave gaps now and then, as real stall rows have.
          if (((s * 13 + m * 7) | 0) % 9 === 0) continue;
          stalls.push({ kind: STALL_KINDS[((s * 7 + lane.id) | 0) % STALL_KINDS.length]!, x, z, yaw: Math.atan2(p.dz, -p.dx) });
          count++;
        }
      }
    });

    const dummy = new THREE.Object3D();
    for (const kind of STALL_KINDS) {
      const mine = stalls.filter((s) => s.kind === kind);
      if (!mine.length) continue;
      const geometry = STALL_GEOMETRY[kind]();
      const mesh = new THREE.InstancedMesh(geometry, this.material, mine.length);
      mine.forEach((s, i) => {
        dummy.position.set(s.x, 0, s.z);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const colors = STALL_COLORS[kind];
        setInstanceHex(mesh, i, colors[i % colors.length]!);
      });
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.geometries.push(geometry);
    }

    // A seller behind each stall, and shoppers browsing in front of some.
    const people: Record<PersonKind, { x: number; z: number; yaw: number; color: string }[]> = { man: [], mama: [], kid: [], mzee: [] };
    stalls.forEach((s, i) => {
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      const seller = i % 3 === 0 ? "man" : "mama";
      people[seller].push({ x: s.x - fx * 0.9, z: s.z - fz * 0.9, yaw: s.yaw, color: CLOTHES[seller][i % CLOTHES[seller].length]! });
      if (i % 2 === 0) {
        const kind = personKindFor(i + 3);
        const side = ((i % 4) - 1.5) * 0.4;
        people[kind].push({ x: s.x + fx * 1.25 + Math.cos(s.yaw) * side, z: s.z + fz * 1.25 - Math.sin(s.yaw) * side, yaw: s.yaw + Math.PI, color: CLOTHES[kind][(i * 3) % CLOTHES[kind].length]! });
      }
      // The stall front is solid.
      const hx = Math.cos(s.yaw) * 1.15, hz = -Math.sin(s.yaw) * 1.15;
      const cx = s.x + fx * 0.6, cz = s.z + fz * 0.6;
      this.walls.push(cx - hx, cz - hz, cx + hx, cz + hz);
    });
    for (const kind of PERSON_KINDS) {
      const list = people[kind];
      if (!list.length) continue;
      const geometry = PERSON_GEOMETRY[kind]();
      const mesh = new THREE.InstancedMesh(geometry, this.material, list.length);
      list.forEach((o, i) => {
        dummy.position.set(o.x, 0, o.z);
        dummy.rotation.set(0, o.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        setInstanceHex(mesh, i, o.color);
      });
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.geometries.push(geometry);
    }
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
  }
}
