/**
 * AI traffic: pooled vehicles that drive the lane network on the LEFT
 * (Tanzanian rule of the road) with Intelligent Driver Model car-following,
 * simple right-of-way at junctions, honking, daladalas pulling over for
 * passengers, plus collisions and near-miss detection against the player.
 */
import * as THREE from "three";
import { events } from "@/game/core/events";
import { createInstancedMaterial, setInstanceHex } from "@/game/world/meshKit";
import type { BikePhysics } from "@/game/vehicles/BikePhysics";
import type { RideStats } from "@/game/vehicles/bikes";
import type { LanePoint, NavNetwork } from "./NavNetwork";
import { VEHICLE_GEOMETRY, VEHICLE_KINDS, VEHICLE_SPECS, type VehicleKind } from "./vehicleMeshes";

interface Agent {
  active: boolean;
  kind: VehicleKind;
  lane: number;
  next: number;
  s: number;
  v: number;
  /** Personal desired-speed factor. */
  temper: number;
  color: string;
  x: number;
  z: number;
  dx: number;
  dz: number;
  yaw: number;
  waiting: number;
  stopTimer: number;
  honkCooldown: number;
  prevLong: number;
  bounce: number;
}

/** Something traffic must not run into (crossing pedestrians, the player). */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

const SPAWN_MIN = 70;
const SPAWN_MAX = 260;
const DESPAWN = 330;
const COMBO_WINDOW = 4;

const pt: LanePoint = { x: 0, z: 0, dx: 0, dz: 0 };
const dummy = new THREE.Object3D();

const pickKind = (r: number): VehicleKind => {
  let acc = 0;
  for (const kind of VEHICLE_KINDS) {
    acc += VEHICLE_SPECS[kind].weight;
    if (r <= acc) return kind;
  }
  return "car";
};

const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class TrafficSystem {
  readonly group = new THREE.Group();
  private agents: Agent[];
  private meshes: Record<VehicleKind, THREE.InstancedMesh>;
  private material = createInstancedMaterial({ glowStrength: 2.6 });
  private byLane = new Map<number, Agent[]>();
  private combo = 0;
  private comboTimer = 0;
  private target: number;
  private warm = true;

  constructor(
    private readonly nav: NavNetwork,
    capacity: number,
  ) {
    this.target = capacity;
    this.agents = Array.from({ length: capacity }, () => ({
      active: false,
      kind: "car" as VehicleKind,
      lane: 0,
      next: -1,
      s: 0,
      v: 0,
      temper: 1,
      color: "#FFFFFF",
      x: 0,
      z: 0,
      dx: 0,
      dz: -1,
      yaw: 0,
      waiting: 0,
      stopTimer: 0,
      honkCooldown: 0,
      prevLong: 0,
      bounce: Math.random() * 10,
    }));
    const make = (kind: VehicleKind) => {
      const mesh = new THREE.InstancedMesh(VEHICLE_GEOMETRY[kind](), this.material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `traffic-${kind}`;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { car: make("car"), daladala: make("daladala"), bajaji: make("bajaji"), truck: make("truck"), boda: make("boda") };
  }

  /** Active vehicle count target (quality presets change it live). */
  setDensity(count: number) {
    this.target = Math.min(count, this.agents.length);
  }

  /** Vehicles for the minimap: flat [x, z, ...]. */
  positions(out: number[]) {
    out.length = 0;
    for (const a of this.agents) if (a.active) out.push(a.x, a.z);
    return out;
  }

  /** The player honked: stalled vehicles nearby get moving. */
  hornAt(x: number, z: number, range: number) {
    for (const a of this.agents) {
      if (a.active && (a.x - x) ** 2 + (a.z - z) ** 2 < range * range) a.stopTimer = Math.min(a.stopTimer, 0.3);
    }
  }

  private laneOffset(laneId: number, kind: VehicleKind) {
    const lane = this.nav.lanes[laneId]!;
    if (lane.oneWay) return 0.4;
    const base = Math.max(1.2, Math.min(2.4, lane.width / 4));
    return kind === "boda" || kind === "bajaji" ? base + 0.6 : base;
  }

  private spawn(a: Agent, px: number, pz: number, minDist: number) {
    const lanes = this.nav.lanes;
    for (let attempt = 0; attempt < 6; attempt++) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)]!;
      if (lane.cls >= 5) continue;
      const s = Math.random() * lane.length;
      this.nav.sample(lane.id, s, pt);
      const d = Math.hypot(pt.x - px, pt.z - pz);
      if (d < minDist || d > SPAWN_MAX) continue;
      const crowded = (this.byLane.get(lane.id) ?? []).some((o) => Math.abs(o.s - s) < 18);
      if (crowded) continue;
      const kind = pickKind(Math.random());
      const spec = VEHICLE_SPECS[kind];
      a.active = true;
      a.kind = kind;
      a.lane = lane.id;
      a.next = -1;
      a.s = s;
      a.temper = 0.85 + Math.random() * 0.3;
      a.v = lane.speed * spec.speed * a.temper * 0.7;
      a.color = spec.colors[Math.floor(Math.random() * spec.colors.length)]!;
      a.waiting = 0;
      a.stopTimer = 0;
      a.honkCooldown = 0;
      a.prevLong = Infinity;
      a.yaw = Math.atan2(-pt.dx, -pt.dz);
      a.x = pt.x;
      a.z = pt.z;
      (this.byLane.get(lane.id) ?? this.byLane.set(lane.id, []).get(lane.id)!).push(a);
      return;
    }
  }

  update(dt: number, bike: BikePhysics, stats: RideStats, obstacles: Obstacle[]) {
    const p = bike.state;
    const pfx = -Math.sin(p.heading);
    const pfz = -Math.cos(p.heading);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;

    // Lane occupancy (sorted by distance along the lane).
    this.byLane.clear();
    let active = 0;
    for (const a of this.agents) {
      if (!a.active) continue;
      if (Math.hypot(a.x - p.x, a.z - p.z) > DESPAWN) {
        a.active = false;
        continue;
      }
      active++;
      let list = this.byLane.get(a.lane);
      if (!list) this.byLane.set(a.lane, (list = []));
      list.push(a);
    }
    for (const list of this.byLane.values()) list.sort((x, y) => x.s - y.s);

    // Top up traffic: on the first frames fill close in, then only spawn out of sight.
    for (const a of this.agents) {
      if (active >= this.target) break;
      if (a.active) continue;
      this.spawn(a, p.x, p.z, this.warm ? 25 : SPAWN_MIN);
      if (a.active) active++;
    }
    this.warm = false;

    for (const a of this.agents) {
      if (!a.active) continue;
      const spec = VEHICLE_SPECS[a.kind];
      const lane = this.nav.lanes[a.lane]!;
      const remaining = lane.length - a.s;
      if (a.next < 0 && remaining < 30) a.next = this.nav.nextLane(a.lane, Math.random());

      // Gap to whatever is ahead: same lane, the next lane, obstacles in our path.
      let gap = 200;
      let leadV = 0;
      const list = this.byLane.get(a.lane)!;
      const idx = list.indexOf(a);
      const ahead = list[idx + 1];
      if (ahead) {
        gap = ahead.s - a.s - (spec.length + VEHICLE_SPECS[ahead.kind].length) / 2;
        leadV = ahead.v;
      } else if (a.next >= 0) {
        const first = this.byLane.get(a.next)?.[0];
        if (first) {
          gap = remaining + first.s - (spec.length + VEHICLE_SPECS[first.kind].length) / 2;
          leadV = first.v;
        }
      }
      for (const o of obstacles) {
        const ox = o.x - a.x, oz = o.z - a.z;
        const long = ox * a.dx + oz * a.dz;
        if (long <= 0 || long > 40) continue;
        const lat = Math.abs(ox * -a.dz + oz * a.dx);
        if (lat < spec.width / 2 + o.radius + 0.6) {
          const g = long - spec.length / 2 - o.radius;
          if (g < gap) {
            gap = g;
            leadV = 0;
          }
        }
      }
      // Player sharing the lane: treat as a slow leader and honk if they dawdle.
      {
        const ox = p.x - a.x, oz = p.z - a.z;
        const long = ox * a.dx + oz * a.dz;
        const lat = Math.abs(ox * -a.dz + oz * a.dx);
        if (long > 0 && long < 35 && lat < spec.width / 2 + 0.9) {
          const g = long - spec.length / 2 - 0.6;
          if (g < gap) {
            gap = g;
            leadV = Math.max(0, p.speed * (pfx * a.dx + pfz * a.dz));
          }
          if (g < 8 && Math.abs(p.speed) < 2 && a.honkCooldown <= 0) {
            a.honkCooldown = 4 + Math.random() * 4;
            events.emit("honked", { x: a.x, z: a.z });
          }
        }
      }

      // Junction right-of-way: bigger road first, then whoever is closer.
      if (remaining < 12 && a.next >= 0 && a.waiting < 4) {
        for (const [laneId, others] of this.byLane) {
          if (laneId === a.lane) continue;
          const other = this.nav.lanes[laneId]!;
          for (const b of others) {
            const bRemaining = other.length - b.s;
            const approaching = other.to === lane.to && bRemaining < 10 && (other.cls < lane.cls || (other.cls === lane.cls && bRemaining < remaining));
            const inside = other.from === lane.to && b.s < 6 && laneId !== a.next;
            if (approaching || inside) gap = Math.min(gap, remaining - 3);
          }
        }
      }
      if (gap < 1 && a.v < 0.5) a.waiting += dt;
      else a.waiting = Math.max(0, a.waiting - dt * 2);
      if (a.waiting > 4 && a.honkCooldown <= 0) {
        a.honkCooldown = 5;
        events.emit("honked", { x: a.x, z: a.z });
      }
      a.honkCooldown -= dt;

      // Daladalas pull over for passengers now and then.
      if (a.kind === "daladala" && a.stopTimer <= 0 && Math.random() < dt * 0.02 && lane.cls <= 3) a.stopTimer = 3 + Math.random() * 3;
      a.stopTimer -= dt;

      // Intelligent Driver Model.
      const v0 = a.stopTimer > 0 ? 0.01 : Math.min(lane.speed, 15) * spec.speed * a.temper;
      const T = 1.1;
      const s0 = 2;
      const b = 3;
      const sStar = s0 + a.v * T + (a.v * (a.v - leadV)) / (2 * Math.sqrt(spec.accel * b));
      let acc = spec.accel * (1 - (a.v / v0) ** 4 - (sStar / Math.max(gap, 0.1)) ** 2);
      acc = Math.max(-9, Math.min(spec.accel, acc));
      a.v = Math.max(0, a.v + acc * dt);
      a.s += a.v * dt;
      while (a.s > this.nav.lanes[a.lane]!.length) {
        a.s -= this.nav.lanes[a.lane]!.length;
        a.lane = a.next >= 0 ? a.next : this.nav.nextLane(a.lane, Math.random());
        a.next = -1;
      }

      // Pose: drive on the left of the lane centerline.
      this.nav.sample(a.lane, a.s, pt);
      const off = this.laneOffset(a.lane, a.kind) + (a.stopTimer > 0 ? 0.9 : 0);
      a.x = pt.x + pt.dz * off;
      a.z = pt.z - pt.dx * off;
      a.dx = pt.dx;
      a.dz = pt.dz;
      a.yaw = angleLerp(a.yaw, Math.atan2(-pt.dx, -pt.dz), Math.min(1, dt * 6));
      a.bounce += dt * (2 + a.v);

      this.interactWithPlayer(a, bike, stats);
    }

    // Instances.
    const counts: Record<VehicleKind, number> = { car: 0, daladala: 0, bajaji: 0, truck: 0, boda: 0 };
    for (const a of this.agents) {
      if (!a.active) continue;
      const mesh = this.meshes[a.kind];
      const i = counts[a.kind]++;
      dummy.position.set(a.x, Math.abs(Math.sin(a.bounce)) * 0.025, a.z);
      dummy.rotation.set(0, a.yaw, a.kind === "boda" ? Math.sin(a.bounce * 0.3) * 0.05 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      setInstanceHex(mesh, i, a.color);
    }
    for (const kind of VEHICLE_KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private interactWithPlayer(a: Agent, bike: BikePhysics, stats: RideStats) {
    const p = bike.state;
    const spec = VEHICLE_SPECS[a.kind];
    const ox = p.x - a.x, oz = p.z - a.z;
    if (ox * ox + oz * oz > 100) {
      a.prevLong = Infinity;
      return;
    }
    // Player position in the vehicle's frame.
    const long = ox * a.dx + oz * a.dz;
    const lat = ox * -a.dz + oz * a.dx;
    const hl = spec.length / 2 + 0.45;
    const hw = spec.width / 2 + 0.45;
    if (Math.abs(long) < hl && Math.abs(lat) < hw) {
      // Push the bike out along the shallowest axis.
      const penLong = hl - Math.abs(long);
      const penLat = hw - Math.abs(lat);
      if (penLat < penLong) {
        const sgn = Math.sign(lat) || 1;
        p.x += -a.dz * penLat * sgn;
        p.z += a.dx * penLat * sgn;
      } else {
        const sgn = Math.sign(long) || 1;
        p.x += a.dx * penLong * sgn;
        p.z += a.dz * penLong * sgn;
      }
      const pvx = -Math.sin(p.heading) * p.speed, pvz = -Math.cos(p.heading) * p.speed;
      const rel = Math.hypot(pvx - a.dx * a.v, pvz - a.dz * a.v);
      bike.impact(rel, "vehicle", { stats });
      p.speed *= 0.4;
      a.v *= 0.3;
      a.stopTimer = Math.max(a.stopTimer, 1.5);
      if (a.honkCooldown <= 0) {
        a.honkCooldown = 3;
        events.emit("honked", { x: a.x, z: a.z });
      }
      a.prevLong = Infinity;
      return;
    }
    // Near miss: we slip past a vehicle within ~1.6 m at speed.
    const pfx = -Math.sin(p.heading), pfz = -Math.cos(p.heading);
    const rel = -(ox * pfx + oz * pfz);
    const clearance = Math.abs(lat) - spec.width / 2;
    if (Number.isFinite(a.prevLong) && a.prevLong > 0 && rel <= 0 && clearance < 1.6 && Math.abs(p.speed) > 8) {
      this.combo++;
      this.comboTimer = COMBO_WINDOW;
      events.emit("nearMiss", { combo: this.combo });
    }
    a.prevLong = rel;
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
  }
}
