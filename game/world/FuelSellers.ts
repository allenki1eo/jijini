/**
 * Roadside petrol sellers ("mafuta ya chupa"): a small table of petrol in
 * plastic bottles and a jerrycan, far from the nearest sheli, on the side
 * streets. Dearer than the pump, sold by the litre for cash, and now and
 * then a bit watered down. A lifeline when the tank runs dry.
 *
 * Local frame: −z faces the road.
 */
import * as THREE from "three";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { PERSON_GEOMETRY } from "./people";

const MAX_SELLERS = 12;
/** Only where a sheli is at least this far away (m). */
const FAR_FROM_PUMP = 550;
const SPACING = 420;

const stall = () =>
  merge([
    // Rickety table on four legs.
    part(block(1.3, 0.06, 0.7, 0, 0.78, 0), "#8B5A2B"),
    ...[-0.58, 0.58].flatMap((x) => [-0.28, 0.28].map((z) => part(block(0.06, 0.78, 0.06, x, 0.39, z), "#6B4423"))),
    // One-litre bottles of petrol (that pink-amber colour), with blue caps.
    ...[-0.45, -0.22, 0.01, 0.24, 0.47].map((x, i) => part(new THREE.CylinderGeometry(0.055, 0.06, 0.26, 8).translate(x, 0.94, i % 2 ? 0.12 : -0.1), "#F2A14A", { glow: true })),
    ...[-0.45, -0.22, 0.01, 0.24, 0.47].map((x, i) => part(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6).translate(x, 1.09, i % 2 ? 0.12 : -0.1), "#1E5AA8")),
    // A yellow jerrycan and a funnel under the table.
    part(block(0.36, 0.42, 0.2, 0.75, 0.21, 0.1), "#F2C94C"),
    part(new THREE.ConeGeometry(0.1, 0.16, 10, 1, true).rotateX(Math.PI).translate(0.75, 0.5, 0.1), "#E9ECF0"),
    // Hand-painted sign on a stick.
    part(block(0.05, 1.6, 0.05, -0.85, 0.8, 0.3), "#6B4423"),
    part(block(0.78, 0.36, 0.04, -0.85, 1.55, 0.29), "#FFFFFF", { tint: true }),
  ]);

export interface FuelSeller {
  x: number;
  z: number;
}

export class FuelSellers {
  readonly group = new THREE.Group();
  readonly sellers: FuelSeller[] = [];
  private readonly material = createInstancedMaterial({ glowStrength: 1.2 });
  private readonly owned: { dispose(): void }[] = [];

  constructor(nav: NavNetwork, pumps: { x: number; z: number }[], seed: number) {
    this.group.name = "fuel-sellers";
    let r = seed;
    const rand = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
    const lanes = nav.lanes.filter((l) => l.cls >= 3 && l.length > 40);
    const spots: { x: number; z: number; yaw: number; sx: number; sz: number }[] = [];
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    for (let tries = 0; tries < 400 && spots.length < MAX_SELLERS && lanes.length; tries++) {
      const lane = lanes[Math.floor(rand() * lanes.length)]!;
      nav.sample(lane.id, lane.length * (0.3 + rand() * 0.4), p);
      if (pumps.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < FAR_FROM_PUMP)) continue;
      if (spots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < SPACING)) continue;
      // On the left verge, the table's front to the road.
      const off = lane.width / 2 + 1.8;
      const x = p.x + p.dz * off, z = p.z - p.dx * off;
      const yaw = Math.atan2(p.dz, -p.dx);
      spots.push({ x, z, yaw, sx: p.x + p.dz * (lane.width / 2 - 0.5), sz: p.z - p.dx * (lane.width / 2 - 0.5) });
    }
    if (!spots.length) return;

    const geometry = stall();
    const seller = PERSON_GEOMETRY.man();
    this.owned.push(geometry, seller);
    const tables = new THREE.InstancedMesh(geometry, this.material, spots.length);
    const people = new THREE.InstancedMesh(seller, this.material, spots.length);
    const dummy = new THREE.Object3D();
    const SIGNS = ["#F2C94C", "#FFFFFF", "#FF8A3D"];
    const SHIRTS = ["#2F80ED", "#27AE60", "#EB5757", "#F2994A"];
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.updateMatrix();
      tables.setMatrixAt(i, dummy.matrix);
      setInstanceHex(tables, i, SIGNS[i % SIGNS.length]!);
      // The seller sits just behind the table, watching the road.
      const bx = s.x + Math.sin(s.yaw) * 0.9, bz = s.z + Math.cos(s.yaw) * 0.9;
      dummy.position.set(bx, 0, bz);
      dummy.rotation.set(0, s.yaw + Math.PI, 0);
      dummy.updateMatrix();
      people.setMatrixAt(i, dummy.matrix);
      setInstanceHex(people, i, SHIRTS[i % SHIRTS.length]!);
      this.sellers.push({ x: s.sx, z: s.sz });
    });
    tables.frustumCulled = people.frustumCulled = false;
    this.group.add(tables, people);
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
