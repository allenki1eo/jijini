/**
 * Ghost of your best race on a course: a translucent boda replaying the
 * recorded path ([t, x, z, heading] samples).
 */
import * as THREE from "three";
import type { BikeState } from "./BikePhysics";
import { BikeModel } from "./BikeModel";

export const GHOST_SAMPLE_EVERY = 0.2;

export class GhostRider {
  readonly model = new BikeModel();
  private samples: number[] = [];
  private pose: BikeState = {
    x: 0, z: 0, heading: 0, speed: 8, slip: 0, lean: 0, pitch: 0, steerAngle: 0, boost: 1, fuel: 1, damage: 0,
    stumble: 0, surface: "tarmac", odometer: 0, lateralG: 0, longitudinalG: 0, wheelieMeters: 0, drifting: false,
  };

  constructor() {
    for (const mat of Object.values(this.model.mats)) {
      mat.transparent = true;
      mat.opacity = 0.42;
      mat.depthWrite = false;
      if (mat instanceof THREE.MeshLambertMaterial) mat.emissive.set("#1B6FA0");
    }
    this.model.root.visible = false;
  }

  play(samples: number[]) {
    this.samples = samples;
    this.model.root.visible = samples.length >= 8;
  }

  stop() {
    this.model.root.visible = false;
  }

  /** Pose at race time `t` seconds. */
  update(t: number, dt: number) {
    const s = this.samples;
    if (!this.model.root.visible || s.length < 8) return;
    let i = 0;
    while (i + 4 < s.length && s[i + 4]! <= t) i += 4;
    const j = Math.min(i + 4, s.length - 4);
    const span = s[j]! - s[i]! || 1;
    const k = Math.max(0, Math.min(1, (t - s[i]!) / span));
    const p = this.pose;
    const px = p.x, pz = p.z;
    p.x = s[i + 1]! + (s[j + 1]! - s[i + 1]!) * k;
    p.z = s[i + 2]! + (s[j + 2]! - s[i + 2]!) * k;
    const dh = Math.atan2(Math.sin(s[j + 3]! - s[i + 3]!), Math.cos(s[j + 3]! - s[i + 3]!));
    p.heading = s[i + 3]! + dh * k;
    p.speed = dt > 0 ? Math.hypot(p.x - px, p.z - pz) / dt : p.speed;
    this.model.update(p, dt);
  }

  dispose() {
    this.model.dispose();
  }
}
