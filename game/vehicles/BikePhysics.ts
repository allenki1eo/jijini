/**
 * Arcade bodaboda physics on the ground plane. Forgiving by design: bumps
 * cost reputation and damage, only hard hits cause a short stumble.
 *
 * Heading convention matches the bake: forward = (-sin h, -cos h).
 */
import { events } from "@/game/core/events";
import type { ControlState } from "@/game/core/controls";
import type { WorldIndex } from "@/game/world/WorldIndex";
import type { RideStats } from "./bikes";

export const BIKE_RADIUS = 0.55;

export type SurfaceKind = "tarmac" | "dirt" | "path" | "earth" | "mud";

export interface BikeState {
  x: number;
  z: number;
  heading: number;
  /** Forward speed, m/s (negative when reversing). */
  speed: number;
  /** Sideways slip, m/s. */
  slip: number;
  /** Visual lean (rad, + = right). */
  lean: number;
  /** Wheelie pitch (rad). */
  pitch: number;
  steerAngle: number;
  boost: number;
  fuel: number;
  damage: number;
  /** Seconds left of a crash stumble. */
  stumble: number;
  surface: SurfaceKind;
  /** Meters ridden this session. */
  odometer: number;
  /** Lateral g for passenger comfort and drift detection. */
  lateralG: number;
  longitudinalG: number;
  wheelieMeters: number;
  drifting: boolean;
}

const SURFACE: Record<SurfaceKind, { top: number; grip: number; bump: number }> = {
  tarmac: { top: 1, grip: 1, bump: 0 },
  dirt: { top: 0.9, grip: 0.8, bump: 0.35 },
  path: { top: 0.75, grip: 0.82, bump: 0.5 },
  earth: { top: 0.62, grip: 0.7, bump: 1 },
  mud: { top: 0.55, grip: 0.5, bump: 0.8 },
};

const MAX_STEP = 0.2;
const resolved = { x: 0, z: 0, nx: 0, nz: 0, depth: 0 };

export interface PhysicsEnv {
  world: WorldIndex;
  stats: RideStats;
  /** 0..1 how wet the roads are. */
  wetness: number;
  /** Fuel burn multiplier (0 in the tutorial). */
  fuelUse: number;
}

export class BikePhysics {
  readonly state: BikeState = {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    slip: 0,
    lean: 0,
    pitch: 0,
    steerAngle: 0,
    boost: 1,
    fuel: 3,
    damage: 0,
    stumble: 0,
    surface: "tarmac",
    odometer: 0,
    lateralG: 0,
    longitudinalG: 0,
    wheelieMeters: 0,
    drifting: false,
  };
  private driftTime = 0;
  private hitCooldown = 0;

  place(x: number, z: number, heading: number) {
    const s = this.state;
    s.x = x;
    s.z = z;
    s.heading = heading;
    s.speed = 0;
    s.slip = 0;
    s.stumble = 0;
  }

  update(dt: number, input: ControlState, env: PhysicsEnv) {
    const s = this.state;
    const st = env.stats;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    // Surface under the wheels.
    const surf = env.world.surfaceAt(s.x, s.z);
    let kind: SurfaceKind = !surf.onRoad ? "earth" : surf.cls === 6 ? "path" : surf.unpaved ? "dirt" : "tarmac";
    if (env.wetness > 0.4 && (kind === "dirt" || kind === "earth")) kind = "mud";
    s.surface = kind;
    const sf = SURFACE[kind];
    const roughPenalty = 1 - (1 - sf.top) * (1 - st.suspension * 0.6);
    const wetGrip = 1 - env.wetness * (kind === "tarmac" ? 0.15 : 0.25);

    if (s.stumble > 0) {
      s.stumble -= dt;
      s.speed *= Math.exp(-6 * dt);
      s.slip *= Math.exp(-6 * dt);
      s.lean += (0 - s.lean) * Math.min(1, dt * 6);
      s.pitch = 0;
      this.integrate(dt, env);
      return;
    }

    const outOfFuel = s.fuel <= 0;
    const boosting = input.boost && s.boost > 0.02 && input.throttle > 0.1 && !outOfFuel;
    const damageFactor = 1 - Math.min(s.damage, 90) / 300;
    const top = st.topSpeed * roughPenalty * damageFactor * (boosting ? 1.28 : 1) * (outOfFuel ? 0.18 : 1);

    // Longitudinal.
    const prevSpeed = s.speed;
    if (input.throttle > 0 && s.speed >= -0.5) {
      const headroom = Math.max(0, 1 - (Math.max(s.speed, 0) / top) ** 2);
      s.speed += st.accel * (boosting ? 1.6 : 1) * input.throttle * headroom * dt;
    }
    if (input.brake > 0) {
      if (s.speed > 0.4) s.speed = Math.max(0, s.speed - st.brake * input.brake * wetGrip * dt);
      else if (input.throttle < 0.1) s.speed = Math.max(-3, s.speed - 2.5 * input.brake * dt); // walk it backwards
    }
    const drag = 0.25 + 0.012 * s.speed * s.speed + (input.throttle < 0.05 ? 0.6 : 0) + sf.bump * 0.4;
    s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), drag * dt);
    if (s.speed > top) s.speed += (top - s.speed) * Math.min(1, dt * 2);
    s.longitudinalG = (s.speed - prevSpeed) / dt / 9.81;

    s.boost = boosting ? Math.max(0, s.boost - dt / 3.5) : Math.min(1, s.boost + dt / 9);

    // Steering: sharp at walking pace, gentler at speed, softer mid-wheelie.
    const v = Math.abs(s.speed);
    const speedFactor = Math.min(1, v / 3) * (1 - 0.5 * Math.min(1, v / st.topSpeed));
    const wheelieSteer = s.pitch > 0.15 ? 0.45 : 1;
    s.steerAngle += (input.steer - s.steerAngle) * Math.min(1, dt * 10);
    const yawRate = -s.steerAngle * st.steer * speedFactor * wheelieSteer * Math.sign(s.speed || 1);
    s.heading += yawRate * dt;

    // Sideways slip: velocity lags the heading, so the bike drifts wide; more on loose ground.
    const grip = st.grip * sf.grip * wetGrip;
    const slipTarget = yawRate * v * (1 - grip) * 0.9;
    s.slip += (slipTarget - s.slip) * Math.min(1, dt * (2 + grip * 8));
    s.lateralG = (yawRate * v) / 9.81;
    const drifting = Math.abs(s.slip) > 1.6 && v > 7;
    if (drifting) this.driftTime += dt;
    else if (s.drifting && this.driftTime > 0.8) {
      events.emit("drift", { seconds: this.driftTime });
      this.driftTime = 0;
    } else this.driftTime = 0;
    s.drifting = drifting;

    // Lean into turns (visual only).
    const leanTarget = Math.max(-0.6, Math.min(0.6, -yawRate * v * 0.07));
    s.lean += (leanTarget - s.lean) * Math.min(1, dt * 7);

    // Wheelie: hold the button with throttle; brake or lifting off drops the front.
    const wantWheelie = input.wheelie && input.throttle > 0.3 && v > 4 && !outOfFuel;
    const pitchTarget = wantWheelie ? 0.42 + Math.sin(performance.now() / 260) * 0.04 : 0;
    s.pitch += (pitchTarget - s.pitch) * Math.min(1, dt * (wantWheelie ? 3 : 7));
    if (s.pitch > 0.25) s.wheelieMeters += v * dt;
    else if (s.wheelieMeters > 0) {
      if (s.wheelieMeters > 8) events.emit("wheelie", { meters: s.wheelieMeters });
      s.wheelieMeters = 0;
    }

    // Fuel: about 1 L per 3 km at full throttle (scaled so a tank lasts a handful of jobs).
    s.fuel = Math.max(0, s.fuel - env.fuelUse * (0.00002 + v * (0.00011 + 0.00022 * input.throttle) * (boosting ? 1.8 : 1)) * dt);

    this.integrate(dt, env);
  }

  private integrate(dt: number, env: PhysicsEnv) {
    const s = this.state;
    const fx = -Math.sin(s.heading);
    const fz = -Math.cos(s.heading);
    const rx = -fz;
    const rz = fx;
    const dx = (fx * s.speed + rx * s.slip) * dt;
    const dz = (fz * s.speed + rz * s.slip) * dt;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
    for (let i = 0; i < steps; i++) {
      s.x += dx / steps;
      s.z += dz / steps;
      if (env.world.resolveCircle(s.x, s.z, BIKE_RADIUS, resolved)) {
        s.x = resolved.x;
        s.z = resolved.z;
        this.hitWall(resolved.nx, resolved.nz, env);
      }
    }
    s.odometer += dist;
  }

  /** Slide along walls; a hard head-on hit costs damage and a stumble. */
  private hitWall(nx: number, nz: number, env: PhysicsEnv) {
    const s = this.state;
    const fx = -Math.sin(s.heading);
    const fz = -Math.cos(s.heading);
    const into = -(fx * nx + fz * nz) * s.speed;
    if (into <= 0) return;
    s.speed -= Math.sign(s.speed) * into * 0.9;
    s.slip *= 0.5;
    if (this.hitCooldown > 0) return;
    this.impact(into, "wall", env);
  }

  /** Shared crash handling (walls here, traffic and pedestrians from their systems). */
  impact(speed: number, kind: "wall" | "vehicle" | "pedestrian", env: Pick<PhysicsEnv, "stats">) {
    const s = this.state;
    if (speed < 2.5 || this.hitCooldown > 0) return;
    this.hitCooldown = 0.6;
    s.damage = Math.min(100, s.damage + speed * 1.4);
    events.emit("collision", { speed, kind });
    const threshold = 7 + env.stats.suspension * 4;
    if (speed > threshold) {
      s.stumble = 1.3;
      s.speed *= 0.2;
      events.emit("stumble", {});
    }
  }
}
