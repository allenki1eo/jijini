/**
 * Police checkpoints (Afande Salum and friends). Roll up slowly, show your
 * leseni, get waved on. Blast through and pay a small, comedic fine.
 */
import * as THREE from "three";
import { controls } from "@/game/core/controls";
import { events } from "@/game/core/events";
import { block, createInstancedMaterial, merge, part } from "@/game/world/meshKit";
import type { BikeState } from "@/game/vehicles/BikePhysics";
import type { NavNetwork } from "./NavNetwork";

export type CheckpointPhase = "none" | "approach" | "show" | "passed" | "fined";

/** Read by the HUD prompt. */
export const checkpointState = {
  phase: "none" as CheckpointPhase,
  timeLeft: 0,
  /** Set by the HUD button. */
  showRequested: false,
};

export const CHECKPOINT_FINE = 2000;
const ZONE = 32;
const STOP_ZONE = 12;
const STOP_SPEED = 3.5;
const COOLDOWN = 150;

const checkpointGeometry = () =>
  merge([
    ...[-2.4, -1.2, 1.2, 2.4].map((x) => part(new THREE.ConeGeometry(0.22, 0.7, 8).translate(x, 0.35, -4), "#FF6A1F")),
    ...[-2.4, -1.2, 1.2, 2.4].map((x) => part(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 8).translate(x, 0.42, -4), "#FFFFFF")),
    // Afande: white shirt, dark trousers, white cap.
    part(block(0.15, 0.85, 0.16, -0.1, 0.42, 0), "#1F2A44"),
    part(block(0.15, 0.85, 0.16, 0.1, 0.42, 0), "#1F2A44"),
    part(block(0.44, 0.62, 0.26, 0, 1.15, 0), "#F4F4F2"),
    part(block(0.11, 0.55, 0.12, 0.28, 1.2, -0.2), "#F4F4F2"),
    part(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.62, 0), "#3E2618"),
    part(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10).translate(0, 1.76, 0), "#F4F4F2"),
    // "POLISI" sign on a stand.
    part(block(0.08, 1.4, 0.08, 1.4, 0.7, 0.8), "#4B5563"),
    part(block(1.3, 0.55, 0.06, 1.4, 1.5, 0.8), "#0D3B66"),
    part(block(1.1, 0.16, 0.07, 1.4, 1.52, 0.78), "#FFFFFF", { glow: true }),
  ]);

interface Checkpoint {
  x: number;
  z: number;
  yaw: number;
  cooldown: number;
  minDist: number;
  waited: number;
}

export class Checkpoints {
  readonly group = new THREE.Group();
  private list: Checkpoint[] = [];
  private material = createInstancedMaterial({ glowStrength: 2 });
  private active: Checkpoint | null = null;

  constructor(nav: NavNetwork, spawn: { x: number; z: number }, seed: number) {
    // Deterministic picks: busy junctions on main roads, away from spawn and each other.
    const candidates: { x: number; z: number; yaw: number }[] = [];
    for (const lane of nav.lanes) {
      if (lane.cls > 2 || lane.length < 60) continue;
      const mid = Math.floor(lane.pts.length / 4) * 2;
      const x = lane.pts[mid]!, z = lane.pts[mid + 1]!;
      const dx = lane.pts[mid + 2] !== undefined ? lane.pts[mid + 2]! - x : 0;
      const dz = lane.pts[mid + 3] !== undefined ? lane.pts[mid + 3]! - z : -1;
      if (Math.hypot(x - spawn.x, z - spawn.z) < 180) continue;
      // Stand on the left verge, facing oncoming traffic.
      const l = Math.hypot(dx, dz) || 1;
      const off = lane.width / 2 + 1.5;
      candidates.push({ x: x + (dz / l) * off, z: z - (dx / l) * off, yaw: Math.atan2(dx / l, dz / l) });
    }
    let r = seed;
    const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 40 && this.list.length < 3 && candidates.length; i++) {
      const c = candidates[Math.floor(rand() * candidates.length)]!;
      if (this.list.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 350)) continue;
      this.list.push({ ...c, cooldown: 0, minDist: Infinity, waited: 0 });
    }
    const geometry = checkpointGeometry();
    for (const c of this.list) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.position.set(c.x, 0, c.z);
      mesh.rotation.y = c.yaw;
      this.group.add(mesh);
    }
  }

  /** Checkpoint positions (minimap). */
  get points() {
    return this.list;
  }

  update(dt: number, bike: BikeState, fine: (amount: number) => void, adjustRep: (d: number) => void) {
    for (const c of this.list) c.cooldown = Math.max(0, c.cooldown - dt);
    const st = checkpointState;
    if (!this.active) {
      st.phase = st.phase === "passed" || st.phase === "fined" ? st.phase : "none";
      const near = this.list.find((c) => c.cooldown <= 0 && Math.hypot(c.x - bike.x, c.z - bike.z) < ZONE);
      if (!near) return;
      this.active = near;
      near.minDist = Infinity;
      near.waited = 0;
      st.phase = "approach";
      st.timeLeft = 8;
      st.showRequested = false;
    }
    const c = this.active;
    const d = Math.hypot(c.x - bike.x, c.z - bike.z);
    c.minDist = Math.min(c.minDist, d);
    st.timeLeft -= dt;
    const slow = Math.abs(bike.speed) < STOP_SPEED;
    if (d < STOP_ZONE && slow) {
      st.phase = "show";
      c.waited += dt;
      if (st.showRequested || controls.pressed.action) {
        this.finish(c, "passed");
        adjustRep(0.05);
        events.emit("checkpoint", { passed: true });
      }
    }
    // Rode past without stopping, or left the zone.
    const leaving = d > c.minDist + 4 && c.minDist < STOP_ZONE + 4;
    if ((leaving && st.phase !== "passed") || st.timeLeft < -6 || d > ZONE + 15) {
      if (c.minDist < STOP_ZONE + 4) {
        fine(CHECKPOINT_FINE);
        adjustRep(-0.2);
        this.finish(c, "fined");
        events.emit("checkpoint", { passed: false });
      } else {
        this.finish(c, "none");
      }
    }
  }

  private finish(c: Checkpoint, phase: CheckpointPhase) {
    c.cooldown = COOLDOWN;
    this.active = null;
    checkpointState.phase = phase;
    checkpointState.showRequested = false;
    if (phase !== "none") window.setTimeout(() => checkpointState.phase === phase && (checkpointState.phase = "none"), 3500);
  }

  dispose() {
    this.group.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
    this.material.dispose();
  }
}
