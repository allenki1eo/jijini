/**
 * Pedestrians walking the sidewalks, now and then stepping out to cross.
 * Denser around markets. They're obstacles for traffic and the player, and
 * hurry off the road when someone honks.
 */
import * as THREE from "three";
import { createInstancedMaterial, setInstanceHex } from "@/game/world/meshKit";
import { CLOTHES, PERSON_GEOMETRY, PERSON_KINDS, personKindFor, type PersonKind } from "@/game/world/people";
import type { BikePhysics } from "@/game/vehicles/BikePhysics";
import type { RideStats } from "@/game/vehicles/bikes";
import type { LanePoint, NavNetwork } from "./NavNetwork";
import type { Obstacle } from "./TrafficSystem";

type PedState = "walk" | "cross" | "fallen";

interface Ped {
  active: boolean;
  lane: number;
  s: number;
  side: 1 | -1;
  speed: number;
  state: PedState;
  x: number;
  z: number;
  yaw: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  timer: number;
  phase: number;
  shirt: string;
  kind: PersonKind;
  obstacle: Obstacle;
}

const pt: LanePoint = { x: 0, z: 0, dx: 0, dz: 0 };
const dummy = new THREE.Object3D();


export class Pedestrians {
  readonly group = new THREE.Group();
  private peds: Ped[];
  private meshes: Record<PersonKind, THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>>;
  private material = createInstancedMaterial();
  private target: number;
  /** Market positions attract crowds. */
  private hotspots: [number, number][] = [];

  constructor(
    private readonly nav: NavNetwork,
    capacity: number,
  ) {
    this.target = capacity;
    this.peds = Array.from({ length: capacity }, () => ({
      active: false,
      lane: 0,
      s: 0,
      side: 1 as const,
      speed: 1.3,
      state: "walk" as PedState,
      x: 0,
      z: 0,
      yaw: 0,
      fromX: 0,
      fromZ: 0,
      toX: 0,
      toZ: 0,
      t: 0,
      timer: 0,
      phase: Math.random() * 6,
      shirt: "#FFFFFF",
      kind: "man" as PersonKind,
      obstacle: { x: 0, z: 0, radius: 0.5 },
    }));
    this.peds.forEach((p, i) => {
      p.kind = personKindFor(i);
      const clothes = CLOTHES[p.kind];
      p.shirt = clothes[(i * 7) % clothes.length]!;
    });
    this.meshes = Object.fromEntries(
      PERSON_KINDS.map((kind) => {
        const mesh = new THREE.InstancedMesh(PERSON_GEOMETRY[kind](), this.material, capacity);
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return [kind, mesh];
      }),
    ) as Record<PersonKind, THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>>;
  }

  setHotspots(points: [number, number][]) {
    this.hotspots = points;
  }

  setDensity(count: number) {
    this.target = Math.min(count, this.peds.length);
  }

  /** Crossing pedestrians block traffic. */
  obstacles(out: Obstacle[]) {
    for (const p of this.peds) {
      if (!p.active || p.state === "walk") continue;
      p.obstacle.x = p.x;
      p.obstacle.z = p.z;
      out.push(p.obstacle);
    }
  }

  /** People within `radius` meters (drives the crowd ambience). */
  countNear(x: number, z: number, radius: number) {
    let n = 0;
    for (const p of this.peds) if (p.active && (p.x - x) ** 2 + (p.z - z) ** 2 < radius * radius) n++;
    return n;
  }

  hornAt(x: number, z: number, range: number) {
    for (const p of this.peds) {
      if (p.active && p.state === "cross" && (p.x - x) ** 2 + (p.z - z) ** 2 < range * range) p.speed = 2.6;
    }
  }

  private sidewalk(p: Ped) {
    const lane = this.nav.lanes[p.lane]!;
    return lane.width / 2 + 1.7;
  }

  private spawn(p: Ped, px: number, pz: number) {
    const lanes = this.nav.lanes;
    for (let attempt = 0; attempt < 6; attempt++) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)]!;
      const s = Math.random() * lane.length;
      this.nav.sample(lane.id, s, pt);
      const d = Math.hypot(pt.x - px, pt.z - pz);
      if (d < 22 || d > 150) continue;
      // Favor market streets: elsewhere, accept only some candidates.
      const nearMarket = this.hotspots.some(([hx, hz]) => (hx - pt.x) ** 2 + (hz - pt.z) ** 2 < 90 ** 2);
      if (!nearMarket && Math.random() < 0.45) continue;
      Object.assign(p, {
        active: true,
        lane: lane.id,
        s,
        side: Math.random() < 0.5 ? 1 : -1,
        speed: 0.9 + Math.random() * 0.7,
        state: "walk",
        timer: 0,
        shirt: CLOTHES[p.kind][Math.floor(Math.random() * CLOTHES[p.kind].length)]!,
      });
      return;
    }
  }

  update(dt: number, bike: BikePhysics, stats: RideStats) {
    const b = bike.state;
    let active = 0;
    for (const p of this.peds) {
      if (p.active && Math.hypot(p.x - b.x, p.z - b.z) > 180) p.active = false;
      if (p.active) active++;
    }
    for (const p of this.peds) {
      if (active >= this.target) break;
      if (p.active) continue;
      this.spawn(p, b.x, b.z);
      if (p.active) active++;
    }

    for (const p of this.peds) {
      if (!p.active) continue;
      p.phase += dt * p.speed * 6;
      if (p.state === "walk") {
        p.s += p.speed * dt;
        const lane = this.nav.lanes[p.lane]!;
        if (p.s > lane.length) {
          p.s -= lane.length;
          p.lane = this.nav.nextLane(p.lane, Math.random(), 0);
        }
        this.nav.sample(p.lane, p.s, pt);
        const off = this.sidewalk(p) * p.side;
        p.x = pt.x + pt.dz * off;
        p.z = pt.z - pt.dx * off;
        p.yaw = Math.atan2(-pt.dx, -pt.dz);
        // Step out to cross now and then (more often on small streets).
        if (Math.random() < dt * (lane.cls >= 3 ? 0.03 : 0.012)) {
          p.state = "cross";
          p.fromX = p.x;
          p.fromZ = p.z;
          p.toX = pt.x - pt.dz * off;
          p.toZ = pt.z + pt.dx * off;
          p.t = 0;
          p.yaw = Math.atan2(-(p.toX - p.fromX), -(p.toZ - p.fromZ));
        }
      } else if (p.state === "cross") {
        const len = Math.hypot(p.toX - p.fromX, p.toZ - p.fromZ) || 1;
        p.t += (p.speed * dt) / len;
        p.x = p.fromX + (p.toX - p.fromX) * Math.min(1, p.t);
        p.z = p.fromZ + (p.toZ - p.fromZ) * Math.min(1, p.t);
        if (p.t >= 1) {
          p.state = "walk";
          p.side = p.side === 1 ? -1 : 1;
          p.speed = Math.min(p.speed, 1.6);
        }
      } else {
        p.timer -= dt;
        if (p.timer <= 0) p.state = "walk";
      }

      // Bumping a pedestrian: big reputation hit, they sit down for a moment (no gore, ever).
      if (p.state !== "fallen") {
        const dx = p.x - b.x, dz = p.z - b.z;
        if (dx * dx + dz * dz < 0.85 * 0.85 && Math.abs(b.speed) > 1.5) {
          bike.impact(Math.abs(b.speed), "pedestrian", { stats });
          b.speed *= 0.3;
          p.state = "fallen";
          p.timer = 2.5;
        }
      }
    }

    const counts = Object.fromEntries(PERSON_KINDS.map((k) => [k, 0])) as Record<PersonKind, number>;
    for (const p of this.peds) {
      if (!p.active) continue;
      const mesh = this.meshes[p.kind];
      const i = counts[p.kind]++;
      const bob = p.state === "fallen" ? 0 : Math.abs(Math.sin(p.phase)) * 0.05;
      dummy.position.set(p.x, bob, p.z);
      dummy.rotation.set(p.state === "fallen" ? -1.2 : 0, p.yaw, p.state === "fallen" ? 0 : Math.sin(p.phase) * 0.05);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      setInstanceHex(mesh, i, p.shirt);
    }
    for (const kind of PERSON_KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
  }
}
