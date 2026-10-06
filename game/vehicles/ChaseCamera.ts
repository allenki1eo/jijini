/**
 * Chase camera: spring-follows the bike with speed-based distance and FOV,
 * looks ahead into turns, and pulls in when a building would block the view.
 * Also drives the optional first-person (rider's eye) view.
 */
import * as THREE from "three";
import type { WorldIndex } from "@/game/world/WorldIndex";
import type { BikeState } from "./BikePhysics";

export type CameraView = "chase" | "fpv";

const look = new THREE.Vector3();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class ChaseCamera {
  private yaw = 0;
  private distance = 5;
  private shake = 0;
  private initialized = false;
  private readonly pos = new THREE.Vector3();

  /** Add a camera shake impulse (0..1). */
  kick(amount: number) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  snap() {
    this.initialized = false;
  }

  update(cam: THREE.PerspectiveCamera, s: BikeState, dt: number, world: WorldIndex, view: CameraView, boosting: boolean) {
    const v = Math.max(0, s.speed);
    if (!this.initialized) {
      this.yaw = s.heading;
      this.initialized = true;
    }
    // Heading follows with a little lag so turns read clearly.
    this.yaw += wrap(s.heading - this.yaw) * Math.min(1, dt * (view === "fpv" ? 14 : 4.5));
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.35;
    const sy = (Math.random() - 0.5) * this.shake * 0.25;

    let fov: number;
    if (view === "fpv") {
      cam.position.set(s.x + fx * 0.1 + sx, 1.62 + Math.sin(s.odometer * 0.9) * 0.01 + sy, s.z + fz * 0.1);
      look.set(s.x + fx * 10, 1.35, s.z + fz * 10);
      cam.lookAt(look);
      cam.rotateZ(-s.lean * 0.6);
      fov = 72 + Math.min(v, 28) * 0.35 + (boosting ? 6 : 0);
    } else {
      const want = 4.4 + Math.min(v, 30) * 0.075;
      this.distance += (want - this.distance) * Math.min(1, dt * 3);
      let d = this.distance;
      const tx = s.x - fx * d;
      const tz = s.z - fz * d;
      // Pull in when a wall sits between bike and camera.
      const t = world.raycastWalls(s.x, s.z, tx, tz);
      if (t < 1) d = Math.max(1.4, d * t - 0.5);
      const height = 1.75 + Math.min(v, 30) * 0.02 + (d < this.distance ? 0.6 : 0);
      this.pos.set(s.x - fx * d, height, s.z - fz * d);
      cam.position.lerp(this.pos, Math.min(1, dt * 9));
      cam.position.x += sx;
      cam.position.y += sy;
      const ahead = 2.5 + v * 0.22;
      look.set(s.x + fx * ahead, 0.9 + s.pitch * 0.8, s.z + fz * ahead);
      cam.lookAt(look);
      fov = 60 + Math.min(v, 28) * 0.5 + (boosting ? 8 : 0);
    }
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  }
}
