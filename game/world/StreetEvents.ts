/**
 * Things that happen on the street now and then, so no two rides feel the
 * same:
 *  - after a proper storm, potholes (mashimo) open up and fill with water:
 *    hit one fast and the bike takes a knock (good suspension helps);
 *  - a herd of ng'ombe crosses the road with their herder, and everyone waits;
 *  - a wedding convoy (msafara wa harusi) rolls through, ribbons on the cars,
 *    horns going the whole way.
 * One of the last two at a time, announced with a toast.
 */
import * as THREE from "three";
import { events } from "@/game/core/events";
import { env } from "@/game/systems/environment";
import { currentDictionary } from "@/i18n";
import type { LanePoint, NavNetwork } from "@/game/traffic/NavNetwork";
import type { Obstacle } from "@/game/traffic/TrafficSystem";
import { VEHICLE_GEOMETRY } from "@/game/traffic/vehicleMeshes";
import type { BikePhysics } from "@/game/vehicles/BikePhysics";
import type { RideStats } from "@/game/vehicles/bikes";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { PERSON_GEOMETRY } from "./people";

const MAX_POTHOLES = 22;
const HERD = 6;
const CONVOY = 5;
const pt: LanePoint = { x: 0, z: 0, dx: 0, dz: 0 };
const dummy = new THREE.Object3D();

/** A muddy, water-filled pothole: a dark rim and a sky-tinted puddle. */
const potholeGeometry = () =>
  merge([
    part(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2).translate(0, 0.39, 0), "#3B2E26"),
    part(new THREE.CircleGeometry(0.72, 14).rotateX(-Math.PI / 2).translate(0, 0.395, 0), "#6F7F8C", { glow: false }),
  ]);

/** A humped zebu cow (ng'ombe), its coat in the tint. */
const cowGeometry = () =>
  merge([
    part(block(0.62, 0.62, 1.45, 0, 1.0, 0), "#FFFFFF", { tint: true }),
    part(new THREE.SphereGeometry(0.24, 10, 8).scale(1, 0.8, 1.1).translate(0, 1.38, -0.45), "#FFFFFF", { tint: true }),
    part(block(0.36, 0.38, 0.52, 0, 1.15, -0.95), "#FFFFFF", { tint: true }),
    part(block(0.26, 0.2, 0.14, 0, 1.06, -1.24), "#3A2A20"),
    ...[-0.2, 0.2].map((x) => part(new THREE.ConeGeometry(0.04, 0.32, 6).rotateZ(x > 0 ? -0.9 : 0.9).translate(x * 1.3, 1.42, -0.95), "#EDE6D6")),
    ...[-0.22, 0.22].flatMap((x) => [-0.55, 0.55].map((z) => part(block(0.12, 0.72, 0.12, x, 0.36, z), "#FFFFFF", { tint: true }))),
    part(block(0.05, 0.6, 0.05, 0, 0.85, 0.75).rotateX(0.25), "#3A2A20"),
  ]);

/** Ribbons and a bow on a wedding car's bonnet and roof. */
const ribbonGeometry = () =>
  merge([
    part(block(0.08, 0.04, 3.6, 0, 1.53, 0.1), "#FFFFFF", { tint: true }),
    part(block(1.6, 0.04, 0.08, 0, 1.53, 0.4), "#FFFFFF", { tint: true }),
    part(new THREE.SphereGeometry(0.2, 8, 6).scale(1.6, 0.6, 1).translate(0, 1.0, -1.85), "#FFFFFF", { tint: true }),
  ]);

interface Pothole {
  x: number;
  z: number;
}

interface Walker {
  x: number;
  z: number;
  /** Seconds before this one sets off. */
  delay: number;
  /** Metres walked across so far. */
  walked: number;
}

interface Car {
  lane: number;
  s: number;
  x: number;
  z: number;
  yaw: number;
}

export class StreetEvents {
  readonly group = new THREE.Group();
  private readonly material = createInstancedMaterial({ glowStrength: 1.4 });
  private readonly owned: { dispose(): void }[] = [];
  private readonly potholeMesh: THREE.InstancedMesh;
  private readonly cowMesh: THREE.InstancedMesh;
  private readonly herder: THREE.Mesh;
  private readonly carMesh: THREE.InstancedMesh;
  private readonly ribbonMesh: THREE.InstancedMesh;
  private potholes: Pothole[] = [];
  private storm = 0;
  private sincePothole = 0;
  private bump = 0;
  private nextEvent = 120 + Math.random() * 120;
  private herd: { walkers: Walker[]; dir: [number, number]; span: number; age: number } | null = null;
  private stats: RideStats | null = null;
  private convoy: { cars: Car[]; age: number; sinceHonk: number } | null = null;

  constructor(private readonly nav: NavNetwork) {
    this.group.name = "street-events";
    const add = <T extends THREE.BufferGeometry>(g: T) => (this.owned.push(g), g);
    this.potholeMesh = new THREE.InstancedMesh(add(potholeGeometry()), this.material, MAX_POTHOLES);
    this.cowMesh = new THREE.InstancedMesh(add(cowGeometry()), this.material, HERD);
    this.herder = new THREE.Mesh(add(PERSON_GEOMETRY.mzee()), this.material);
    this.carMesh = new THREE.InstancedMesh(add(VEHICLE_GEOMETRY.car()), this.material, CONVOY);
    this.ribbonMesh = new THREE.InstancedMesh(add(ribbonGeometry()), this.material, CONVOY);
    const COATS = ["#F1EDE4", "#5B3A26", "#1F1A17", "#A0522D", "#D9CBB0", "#7A4A2A"];
    COATS.forEach((hex, i) => setInstanceHex(this.cowMesh, i, hex));
    ["#FFFFFF", "#F4F1EA", "#10131A", "#FFFFFF", "#C0C6CF"].forEach((hex, i) => setInstanceHex(this.carMesh, i, hex));
    ["#E0457B", "#FFFFFF", "#E0457B", "#F2C94C", "#E0457B"].forEach((hex, i) => setInstanceHex(this.ribbonMesh, i, hex));
    for (const m of [this.potholeMesh, this.cowMesh, this.carMesh, this.ribbonMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    setInstanceHex(this.potholeMesh, 0, "#FFFFFF");
    this.herder.visible = false;
    this.group.add(this.herder);
  }

  /** Cows and convoy cars block the traffic like anything else in the road. */
  obstacles(out: Obstacle[]) {
    for (const w of this.herd?.walkers ?? []) out.push({ x: w.x, z: w.z, radius: 1.3 });
    for (const c of this.convoy?.cars ?? []) out.push({ x: c.x, z: c.z, radius: 1.8 });
  }

  update(dt: number, bike: BikePhysics, stats: RideStats, busyAhead: boolean) {
    const b = bike.state;
    this.stats = stats;
    this.updatePotholes(dt, bike, stats);
    if (this.herd) this.updateHerd(dt, bike);
    if (this.convoy) this.updateConvoy(dt, bike);
    // Something new now and then, by day (not while a race or a chase needs a clear road).
    this.nextEvent -= dt;
    if (this.nextEvent <= 0 && !this.herd && !this.convoy) {
      this.nextEvent = 150 + Math.random() * 180;
      if (env.night > 0.6 || busyAhead || Math.abs(b.speed) < 1) return;
      if (Math.random() < 0.55) this.startHerd(b.x, b.z, b.heading);
      else this.startConvoy(b.x, b.z, b.heading);
    }
  }

  // ── Potholes ────────────────────────────────────────────────────────────

  private updatePotholes(dt: number, bike: BikePhysics, stats: RideStats) {
    const b = bike.state;
    this.storm = env.rain > 0.6 ? this.storm + dt : Math.max(0, this.storm - dt * 0.2);
    this.sincePothole += dt;
    // A real downpour opens the road up; they stay while it's wet, then get patched one by one.
    if (this.storm > 30 && this.sincePothole > 2.5) {
      this.sincePothole = 0;
      const ahead = 60 + Math.random() * 120;
      const n = this.nav.nearestOnNetwork(b.x - Math.sin(b.heading) * ahead, b.z - Math.cos(b.heading) * ahead);
      const lane = this.nav.lanes[n.lane]!;
      this.nav.sample(n.lane, n.s, pt);
      const side = (Math.random() - 0.5) * Math.max(0, lane.width - 1.6);
      const p = { x: pt.x + pt.dz * side, z: pt.z - pt.dx * side };
      if (this.potholes.length >= MAX_POTHOLES) this.potholes.shift();
      if (!this.potholes.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 6)) this.potholes.push(p);
    } else if (env.wetness < 0.12 && this.potholes.length && this.sincePothole > 5) {
      this.sincePothole = 0;
      this.potholes.shift();
    }
    // Riding through one: a jolt and some damage (softer with suspension upgrades).
    this.bump = Math.max(0, this.bump - dt);
    const speed = Math.abs(b.speed);
    if (this.bump <= 0 && speed > 4.5) {
      for (const p of this.potholes) {
        if (Math.hypot(p.x - b.x, p.z - b.z) > 0.95) continue;
        this.bump = 0.8;
        b.damage = Math.min(100, b.damage + (1 + speed * 0.3) * (1 - Math.min(0.6, stats.suspension * 0.12)));
        b.speed *= 0.82;
        events.emit("pothole", { speed });
        break;
      }
    }
    this.potholes.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.1, 1, 0.8);
      dummy.updateMatrix();
      this.potholeMesh.setMatrixAt(i, dummy.matrix);
      setInstanceHex(this.potholeMesh, i, "#FFFFFF");
    });
    dummy.scale.set(1, 1, 1);
    this.potholeMesh.count = this.potholes.length;
    this.potholeMesh.instanceMatrix.needsUpdate = true;
    if (this.potholeMesh.instanceColor) this.potholeMesh.instanceColor.needsUpdate = true;
  }

  // ── Cows crossing ───────────────────────────────────────────────────────

  private startHerd(x: number, z: number, heading: number) {
    const ahead = 90 + Math.random() * 40;
    const n = this.nav.nearestOnNetwork(x - Math.sin(heading) * ahead, z - Math.cos(heading) * ahead);
    const lane = this.nav.lanes[n.lane]!;
    this.nav.sample(n.lane, n.s, pt);
    // From one verge to the other, across the lane direction.
    const half = lane.width / 2 + 2.5;
    const dir: [number, number] = [pt.dz, -pt.dx];
    const walkers: Walker[] = [];
    for (let i = 0; i < HERD; i++) {
      const along = (i - HERD / 2) * 1.6 + (Math.random() - 0.5);
      walkers.push({ x: pt.x - dir[0] * (half + (i % 2) * 1.5) + pt.dx * along, z: pt.z - dir[1] * (half + (i % 2) * 1.5) + pt.dz * along, delay: i * 0.8 + Math.random(), walked: 0 });
    }
    this.herd = { walkers, dir, span: half * 2 + 3, age: 0 };
    this.herder.visible = true;
    events.emit("toast", { text: currentDictionary().events.cows, tone: "sun" });
  }

  private updateHerd(dt: number, bike: BikePhysics) {
    const h = this.herd!;
    h.age += dt;
    const step = 0.75 * dt;
    let moving = 0;
    h.walkers.forEach((w, i) => {
      w.delay -= dt;
      if (w.delay <= 0 && w.walked < h.span) {
        w.x += h.dir[0] * step;
        w.z += h.dir[1] * step;
        w.walked += step;
        moving++;
      }
      dummy.position.set(w.x, 0, w.z);
      dummy.rotation.set(0, Math.atan2(-h.dir[0], -h.dir[1]) + Math.sin(h.age * 2 + i) * 0.08, 0);
      dummy.updateMatrix();
      this.cowMesh.setMatrixAt(i, dummy.matrix);
    });
    this.cowMesh.count = h.walkers.length;
    this.cowMesh.instanceMatrix.needsUpdate = true;
    const last = h.walkers[h.walkers.length - 1]!;
    this.herder.position.set(last.x - h.dir[0] * 1.6, 0, last.z - h.dir[1] * 1.6);
    this.herder.rotation.y = Math.atan2(-h.dir[0], -h.dir[1]);
    // Riding into a cow is like riding into a wall.
    const b = bike.state;
    for (const w of h.walkers) if (Math.hypot(w.x - b.x, w.z - b.z) < 1.1) bike.impact(Math.abs(b.speed), "wall", { stats: this.stats! });
    if ((moving === 0 && h.age > 8) || h.age > 90) {
      this.herd = null;
      this.cowMesh.count = 0;
      this.herder.visible = false;
    }
  }

  // ── Wedding convoy ──────────────────────────────────────────────────────

  private startConvoy(x: number, z: number, heading: number) {
    const ahead = 140;
    const n = this.nav.nearestOnNetwork(x - Math.sin(heading) * ahead, z - Math.cos(heading) * ahead);
    const lane = this.nav.lanes[n.lane]!;
    if (lane.cls > 3) return;
    const cars: Car[] = [];
    for (let i = 0; i < CONVOY; i++) cars.push({ lane: n.lane, s: Math.max(0, n.s - i * 9), x: 0, z: 0, yaw: 0 });
    this.convoy = { cars, age: 0, sinceHonk: 0 };
    events.emit("toast", { text: currentDictionary().events.wedding, tone: "forest" });
  }

  private updateConvoy(dt: number, bike: BikePhysics) {
    const c = this.convoy!;
    c.age += dt;
    c.sinceHonk += dt;
    const b = bike.state;
    c.cars.forEach((car, i) => {
      car.s += 6.5 * dt;
      let lane = this.nav.lanes[car.lane]!;
      while (car.s > lane.length) {
        car.s -= lane.length;
        // The lead car picks the way; the rest follow it.
        car.lane = i === 0 ? this.nav.nextLane(car.lane, Math.random(), 0.8) : (c.cars[i - 1]!.lane ?? car.lane);
        lane = this.nav.lanes[car.lane]!;
      }
      this.nav.sample(car.lane, car.s, pt);
      // Keep left, like everyone in Tanzania.
      const off = -lane.width / 4;
      car.x = pt.x + pt.dz * off;
      car.z = pt.z - pt.dx * off;
      car.yaw = Math.atan2(-pt.dx, -pt.dz);
      dummy.position.set(car.x, 0, car.z);
      dummy.rotation.set(0, car.yaw, 0);
      dummy.updateMatrix();
      this.carMesh.setMatrixAt(i, dummy.matrix);
      this.ribbonMesh.setMatrixAt(i, dummy.matrix);
      if (Math.hypot(car.x - b.x, car.z - b.z) < 1.7) bike.impact(Math.abs(b.speed), "vehicle", { stats: this.stats! });
    });
    this.carMesh.count = this.ribbonMesh.count = c.cars.length;
    this.carMesh.instanceMatrix.needsUpdate = this.ribbonMesh.instanceMatrix.needsUpdate = true;
    // Horns all the way, when you're near enough to hear.
    const lead = c.cars[0]!;
    if (c.sinceHonk > 1.4 && Math.hypot(lead.x - b.x, lead.z - b.z) < 90) {
      c.sinceHonk = Math.random() * 0.6;
      const car = c.cars[Math.floor(Math.random() * c.cars.length)]!;
      events.emit("honked", { x: car.x, z: car.z, kind: "car", mood: "friendly" });
    }
    if (c.age > 70 || Math.hypot(lead.x - b.x, lead.z - b.z) > 320) {
      this.convoy = null;
      this.carMesh.count = this.ribbonMesh.count = 0;
    }
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
