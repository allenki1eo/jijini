/**
 * Wahi Basi: the bus your passenger just missed, driving out of town along
 * its route. Get close and it pulls over at the roadside so the passenger
 * can jump on; reach the end of its route first and it's gone.
 */
import * as THREE from "three";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { VEHICLE_GEOMETRY } from "@/game/traffic/vehicleMeshes";
import { createInstancedMaterial, setInstanceHex } from "@/game/world/meshKit";

const CRUISE = 10.5;
/** The bus is this far down the road when you pick the passenger up. */
const HEAD_START = 140;
const SCALE = 1.3;

export class BusChase {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly material = createInstancedMaterial({ glowStrength: 2 });
  private pts: number[] = [];
  private cum: number[] = [];
  private s = HEAD_START;
  private speed = CRUISE;
  private stopping = false;
  x = 0;
  z = 0;
  heading = 0;

  constructor(nav: NavNetwork, route: number[]) {
    for (const id of route) {
      const l = nav.lanes[id]!;
      for (let i = this.pts.length ? 2 : 0; i < l.pts.length; i += 2) this.pts.push(l.pts[i]!, l.pts[i + 1]!);
    }
    this.cum = [0];
    for (let i = 2; i < this.pts.length; i += 2) this.cum.push(this.cum[this.cum.length - 1]! + Math.hypot(this.pts[i]! - this.pts[i - 2]!, this.pts[i + 1]! - this.pts[i - 1]!));
    this.s = Math.min(HEAD_START, this.length * 0.3);
    this.mesh = new THREE.InstancedMesh(VEHICLE_GEOMETRY.daladala(), this.material, 1);
    setInstanceHex(this.mesh, 0, "#F2C230");
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.place();
  }

  get length() {
    return this.cum[this.cum.length - 1] ?? 0;
  }

  /** True once it has driven off the end of its route. */
  get gone() {
    return this.s >= this.length - 1;
  }

  get stopped() {
    return this.stopping && this.speed < 0.3;
  }

  /** Flagged down: brake and wait at the side of the road. */
  pullOver() {
    this.stopping = true;
  }

  update(dt: number) {
    const target = this.stopping ? 0 : CRUISE;
    this.speed += Math.max(-4 * dt, Math.min(1.5 * dt, target - this.speed));
    this.s = Math.min(this.length, this.s + this.speed * dt);
    this.place();
  }

  private place() {
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i]! < this.s) i++;
    const seg = this.cum[i]! - this.cum[i - 1]! || 1;
    const t = Math.min(1, Math.max(0, (this.s - this.cum[i - 1]!) / seg));
    const ax = this.pts[(i - 1) * 2]!, az = this.pts[(i - 1) * 2 + 1]!, bx = this.pts[i * 2]!, bz = this.pts[i * 2 + 1]!;
    const dx = (bx - ax) / seg, dz = (bz - az) / seg;
    // Keep left, and tuck into the verge when stopped.
    const off = this.stopping ? 3.6 : 2.2;
    this.x = ax + (bx - ax) * t + dz * off;
    this.z = az + (bz - az) * t - dx * off;
    this.heading = Math.atan2(dx, dz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(this.x, 0, this.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading + Math.PI), new THREE.Vector3(SCALE, SCALE, SCALE));
    this.mesh.setMatrixAt(0, m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
