/**
 * Traffic police with speed guns ("tochi") on the main roads. Ride past one
 * over the limit and they wave you down: stop and pay the TSh 30,000 fine,
 * or run and the police pickup comes after you with lights and siren.
 * Escape by breaking line of sight and putting distance between you; get
 * caught and you pay for speeding and for running. Riding on an expired
 * licence costs the day's hesabu on top.
 */
import * as THREE from "three";
import { events } from "@/game/core/events";
import type { BikeState } from "@/game/vehicles/BikePhysics";
import { block, createInstancedMaterial, merge, part } from "@/game/world/meshKit";
import { ROAD_CLASSES, ROAD_SPEED } from "@/game/world/format";
import type { WorldIndex } from "@/game/world/WorldIndex";
import type { NavNetwork } from "./NavNetwork";

export type PoliceState = "none" | "flagged" | "chase" | "caught" | "escaped" | "paid";

/** Read by the HUD. */
export const policeHud = {
  state: "none" as PoliceState,
  /** Seconds left to stop when flagged. */
  timeLeft: 0,
  /** Measured speed and the limit when the tochi caught you (km/h). */
  measured: 0,
  limit: 0,
  /** Pursuer distance (m) and escape progress 0..1. */
  distance: 0,
  escape: 0,
  /** Last fine, for the result banner. */
  fine: 0,
  licenceFine: 0,
  /** Pursuer position for the minimap. */
  px: 0,
  pz: 0,
};

/** Tanzanian traffic offences are fined TSh 30,000 each. */
export const OFFENCE_FINE = 30_000;
const TOLERANCE_KMH = 10;
const RADAR_RANGE = 65;
const STOP_RADIUS = 18;
const STOP_TIME = 7;
const CHASE_SPEED = 17;
const CATCH_RADIUS = 7;
const ESCAPE_DISTANCE = 170;
const ESCAPE_TIME = 9;
const TRAP_COOLDOWN = 120;

interface Trap {
  x: number;
  z: number;
  yaw: number;
  cooldown: number;
}

export interface PoliceContext {
  licenceValid: boolean;
  /** The day's hesabu, charged on top when the licence has expired. */
  hesabu: number;
  /** Take a fine (capped at what's in the wallet). */
  fine: (amount: number, reason: "speeding" | "evading") => void;
  adjustRep: (delta: number) => void;
  /** Mission passengers hate police chases. */
  scare: () => void;
}

const officerGeometry = () =>
  merge([
    part(block(0.15, 0.85, 0.16, -0.1, 0.42, 0), "#1F2A44"),
    part(block(0.15, 0.85, 0.16, 0.1, 0.42, 0), "#1F2A44"),
    part(block(0.46, 0.64, 0.28, 0, 1.15, 0), "#F4F4F2"),
    // Reflective vest.
    part(block(0.48, 0.42, 0.3, 0, 1.12, 0), "#C6F432", { glow: true }),
    part(block(0.11, 0.5, 0.12, 0.3, 1.32, -0.24).rotateX(-1.1), "#F4F4F2"),
    // The tochi (speed gun), pointed at traffic.
    part(block(0.12, 0.12, 0.3, 0.3, 1.5, -0.5), "#202530"),
    part(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.62, 0), "#3E2618"),
    part(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10).translate(0, 1.76, 0), "#F4F4F2"),
    // "TRAFIKI" sign.
    part(block(0.08, 1.4, 0.08, -1.3, 0.7, 0.6), "#4B5563"),
    part(block(1.3, 0.5, 0.06, -1.3, 1.5, 0.6), "#FFFFFF"),
    part(block(1.1, 0.16, 0.07, -1.3, 1.52, 0.58), "#0D3B66", { glow: true }),
  ]);

const pickupGeometry = () =>
  merge([
    part(block(1.9, 0.75, 4.8, 0, 0.75, 0), "#F4F4F2"),
    part(block(1.86, 0.7, 2.1, 0, 1.45, -0.6), "#F4F4F2"),
    part(block(1.88, 0.5, 1.6, 0, 1.5, -0.6), "#2A3240"),
    part(block(1.92, 0.22, 4.82, 0, 0.82, 0), "#0D3B66"),
    part(block(1.6, 0.4, 1.9, 0, 1.25, 1.35), "#E2E2DE"),
    ...[-0.9, 0.9].flatMap((x) => [-1.5, 1.5].map((z) => part(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12).rotateZ(Math.PI / 2).translate(x, 0.38, z), "#15181E"))),
    part(block(1.6, 0.2, 0.08, 0, 0.75, -2.42), "#FFF3C4", { glow: true }),
  ]);

export class Police {
  readonly group = new THREE.Group();
  readonly traps: Trap[] = [];
  private readonly material = createInstancedMaterial({ glowStrength: 2 });
  private readonly pursuer: THREE.Group;
  private readonly lights: [THREE.Mesh, THREE.Mesh];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private flaggedBy: Trap | null = null;
  private chase = { x: 0, z: 0, yaw: 0, speed: 0, path: [] as number[], pathIndex: 0, sinceRoute: 9, escape: 0, closeFor: 0, t: 0 };
  /** After an escape, the police look harder for a while (seconds). */
  private heat = 0;

  constructor(
    private readonly nav: NavNetwork,
    private readonly index: WorldIndex,
    spawn: { x: number; z: number },
    avoid: { x: number; z: number }[],
    seed: number,
  ) {
    this.group.name = "police";
    // Deterministic picks: main roads, away from spawn, checkpoints and each other.
    let r = seed;
    const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    const lanes = nav.lanes.filter((l) => l.cls <= 2 && l.length > 90);
    for (let i = 0; i < 60 && this.traps.length < 3 && lanes.length; i++) {
      const lane = lanes[Math.floor(rand() * lanes.length)]!;
      const p = nav.sample(lane.id, lane.length * (0.35 + rand() * 0.3), { x: 0, z: 0, dx: 0, dz: 0 });
      const off = lane.width / 2 + 1.6;
      const x = p.x + p.dz * off, z = p.z - p.dx * off;
      const far = (o: { x: number; z: number }, d: number) => Math.hypot(o.x - x, o.z - z) > d;
      if (!far(spawn, 200) || !avoid.every((o) => far(o, 140)) || !this.traps.every((o) => far(o, 320))) continue;
      this.traps.push({ x, z, yaw: Math.atan2(p.dx, p.dz), cooldown: 0 });
    }

    const officer = officerGeometry();
    const pickup = pickupGeometry();
    for (const t of this.traps) {
      const o = new THREE.Mesh(officer, this.material);
      o.position.set(t.x, 0, t.z);
      o.rotation.y = t.yaw + Math.PI;
      const car = new THREE.Mesh(pickup, this.material);
      // Parked a little back along the verge.
      car.position.set(t.x - Math.sin(t.yaw) * 7 + Math.cos(t.yaw) * 1.2, 0, t.z - Math.cos(t.yaw) * 7 - Math.sin(t.yaw) * 1.2);
      car.rotation.y = t.yaw;
      this.group.add(o, car);
    }

    // The pursuit pickup, with a red/blue light bar that flashes during a chase.
    this.pursuer = new THREE.Group();
    this.pursuer.add(new THREE.Mesh(pickup, this.material));
    const red = new THREE.MeshBasicMaterial({ color: "#FF2D3A" });
    const blue = new THREE.MeshBasicMaterial({ color: "#2D6BFF" });
    const bar = new THREE.BoxGeometry(0.62, 0.16, 0.3);
    this.lights = [new THREE.Mesh(bar, red), new THREE.Mesh(bar, blue)];
    this.lights[0].position.set(-0.35, 1.9, -0.6);
    this.lights[1].position.set(0.35, 1.9, -0.6);
    this.pursuer.add(...this.lights);
    this.pursuer.visible = false;
    this.group.add(this.pursuer);
    this.owned.push(officer, pickup, bar, red, blue, this.material);
  }

  /** Where the officers stand (minimap). */
  get points() {
    return this.traps;
  }

  get chasing() {
    return policeHud.state === "chase";
  }

  update(dt: number, bike: BikeState, ctx: PoliceContext) {
    for (const t of this.traps) t.cooldown = Math.max(0, t.cooldown - dt);
    this.heat = Math.max(0, this.heat - dt);
    const speedKmh = Math.abs(bike.speed) * 3.6;

    if (policeHud.state === "none" || policeHud.state === "escaped" || policeHud.state === "caught" || policeHud.state === "paid") {
      const trap = this.traps.find((t) => t.cooldown <= 0 && Math.hypot(t.x - bike.x, t.z - bike.z) < RADAR_RANGE);
      if (!trap) return;
      const surface = this.index.surfaceAt(bike.x, bike.z);
      const limit = surface.cls >= 0 ? ROAD_SPEED[ROAD_CLASSES[surface.cls]!] : 30;
      const tolerance = this.heat > 0 ? TOLERANCE_KMH / 2 : TOLERANCE_KMH;
      const seen = this.index.raycastWalls(trap.x, trap.z, bike.x, bike.z) >= 1;
      if (speedKmh <= limit + tolerance || !seen) return;
      // Caught on the tochi: you're being waved down.
      trap.cooldown = TRAP_COOLDOWN;
      this.flaggedBy = trap;
      policeHud.state = "flagged";
      policeHud.timeLeft = STOP_TIME;
      policeHud.measured = Math.round(speedKmh);
      policeHud.limit = limit;
      events.emit("police", { kind: "flagged" });
      return;
    }

    if (policeHud.state === "flagged") {
      const t = this.flaggedBy!;
      const d = Math.hypot(t.x - bike.x, t.z - bike.z);
      policeHud.timeLeft -= dt;
      policeHud.distance = d;
      if (d < STOP_RADIUS && Math.abs(bike.speed) < 2.5) {
        // Pulled over: pay the fine (and the licence penalty).
        this.charge(ctx, "speeding", false);
        policeHud.state = "paid";
        ctx.adjustRep(-0.08);
        events.emit("police", { kind: "fined" });
        this.clearLater("paid");
        return;
      }
      if (policeHud.timeLeft <= 0 || d > RADAR_RANGE + 25) this.startChase(t, bike);
      return;
    }

    if (policeHud.state === "chase") this.updateChase(dt, bike, ctx);
  }

  private startChase(trap: Trap, bike: BikeState) {
    const c = this.chase;
    c.x = trap.x - Math.sin(trap.yaw) * 7;
    c.z = trap.z - Math.cos(trap.yaw) * 7;
    c.yaw = Math.atan2(bike.x - c.x, bike.z - c.z);
    c.speed = 4;
    c.path = [];
    c.sinceRoute = 9;
    c.escape = 0;
    c.closeFor = 0;
    policeHud.state = "chase";
    policeHud.escape = 0;
    this.pursuer.visible = true;
    events.emit("police", { kind: "chase" });
  }

  private updateChase(dt: number, bike: BikeState, ctx: PoliceContext) {
    const c = this.chase;
    c.t += dt;
    const dx = bike.x - c.x, dz = bike.z - c.z;
    const d = Math.hypot(dx, dz);
    const sees = d < 120 && this.index.raycastWalls(c.x, c.z, bike.x, bike.z) >= 1;

    // Steer: straight at the rider when in sight, otherwise along the road network.
    let tx = bike.x, tz = bike.z;
    if (!sees || d > 45) {
      c.sinceRoute += dt;
      if (c.sinceRoute > 1.2 || c.pathIndex >= c.path.length) this.reroute(bike);
      while (c.pathIndex < c.path.length - 2 && Math.hypot(c.path[c.pathIndex]! - c.x, c.path[c.pathIndex + 1]! - c.z) < 4) c.pathIndex += 2;
      if (c.pathIndex < c.path.length) {
        tx = c.path[c.pathIndex]!;
        tz = c.path[c.pathIndex + 1]!;
      }
    } else {
      // Aim a little ahead of where the rider is going.
      const lead = Math.min(1.2, d / 20);
      tx += -Math.sin(bike.heading) * bike.speed * lead;
      tz += -Math.cos(bike.heading) * bike.speed * lead;
    }
    const want = Math.atan2(tx - c.x, tz - c.z);
    let turn = want - c.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    c.yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, turn));
    // Rubber band: keep the chase tense on fast bikes, slow down for tight turns.
    const top = Math.max(CHASE_SPEED, Math.abs(bike.speed) * 0.93);
    const target = Math.abs(turn) > 0.9 ? top * 0.45 : top;
    c.speed += Math.max(-9 * dt, Math.min(5.5 * dt, target - c.speed));
    const nx = c.x + Math.sin(c.yaw) * c.speed * dt;
    const nz = c.z + Math.cos(c.yaw) * c.speed * dt;
    // Don't drive through buildings: stop at walls and swing round.
    if (this.index.raycastWalls(c.x, c.z, nx, nz) < 1) {
      c.speed *= 0.3;
      c.sinceRoute = 9;
    } else {
      c.x = nx;
      c.z = nz;
    }
    this.pursuer.position.set(c.x, 0, c.z);
    this.pursuer.rotation.y = c.yaw + Math.PI;
    const flash = Math.floor(c.t * 6) % 2 === 0;
    this.lights[0].visible = flash;
    this.lights[1].visible = !flash;

    // Caught: the pickup boxes you in.
    if (d < CATCH_RADIUS && Math.abs(bike.speed) < 3.5) c.closeFor += dt;
    else c.closeFor = Math.max(0, c.closeFor - dt);
    if (d < 2.4 && Math.abs(bike.speed) > 4) {
      bike.speed *= 0.35;
      c.closeFor += 0.5;
      events.emit("collision", { speed: 5, kind: "vehicle" });
    }
    if (c.closeFor > 1.2) {
      this.charge(ctx, "evading", true);
      ctx.adjustRep(-0.4);
      this.endChase("caught");
      return;
    }

    // Escaping: out of sight and far enough, for long enough.
    const hidden = !sees || d > ESCAPE_DISTANCE;
    c.escape = Math.max(0, Math.min(ESCAPE_TIME, c.escape + (hidden && d > 60 ? dt : -dt * 1.5)));
    if (d < 25) ctx.scare();
    policeHud.distance = d;
    policeHud.escape = c.escape / ESCAPE_TIME;
    policeHud.px = c.x;
    policeHud.pz = c.z;
    if (c.escape >= ESCAPE_TIME) {
      ctx.adjustRep(-0.12);
      this.heat = 240;
      this.endChase("escaped");
    }
  }

  private reroute(bike: BikeState) {
    const c = this.chase;
    c.sinceRoute = 0;
    const from = this.nav.nearestNode(c.x, c.z);
    const to = this.nav.nearestNode(bike.x, bike.z);
    const lanes = this.nav.route(from, to) ?? [];
    const pts: number[] = [this.nav.nodeX(from), this.nav.nodeZ(from)];
    for (const id of lanes) {
      const l = this.nav.lanes[id]!;
      for (let i = 2; i < l.pts.length; i += 2) pts.push(l.pts[i]!, l.pts[i + 1]!);
    }
    pts.push(bike.x, bike.z);
    c.path = pts;
    // Skip points behind us.
    c.pathIndex = Math.hypot(pts[0]! - c.x, pts[1]! - c.z) < 12 ? 2 : 0;
  }

  private charge(ctx: PoliceContext, reason: "speeding" | "evading", evaded: boolean) {
    const fine = OFFENCE_FINE * (evaded ? 2 : 1);
    const licence = ctx.licenceValid ? 0 : ctx.hesabu;
    policeHud.fine = fine;
    policeHud.licenceFine = licence;
    ctx.fine(fine + licence, reason);
  }

  private endChase(state: "caught" | "escaped") {
    policeHud.state = state;
    this.pursuer.visible = false;
    events.emit("police", { kind: state });
    this.clearLater(state);
  }

  /** Result banners clear themselves after a few seconds. */
  private clearLater(state: PoliceState) {
    window.setTimeout(() => policeHud.state === state && (policeHud.state = "none"), 4500);
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
  }
}
