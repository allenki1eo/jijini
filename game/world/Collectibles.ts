/**
 * Hidden golden helmets: three per city, placed deterministically on quiet
 * streets. Ride through one to collect it (and a little cash).
 */
import * as THREE from "three";
import { events } from "@/game/core/events";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { merge, part } from "./meshKit";

export const HELMETS_PER_CITY = 3;
export const HELMET_REWARD = 2000;
const PICKUP_RADIUS = 2.6;

const helmetGeometry = () =>
  merge([
    part(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), "#FFD24A", { glow: true }),
    part(new THREE.TorusGeometry(0.42, 0.05, 6, 20).rotateX(Math.PI / 2).translate(0, 0.02, 0), "#E5A800", { glow: true }),
    part(new THREE.BoxGeometry(0.5, 0.16, 0.12).translate(0, 0.12, -0.36), "#1A2230"),
  ]);

interface Helmet {
  id: string;
  x: number;
  z: number;
  mesh: THREE.Mesh;
}

export class Collectibles {
  readonly group = new THREE.Group();
  private helmets: Helmet[] = [];
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: "#6B4A00" });
  private geometry = helmetGeometry();
  private time = 0;

  constructor(
    nav: NavNetwork,
    cityId: string,
    collected: string[],
    private readonly onCollect: (id: string) => void,
  ) {
    let seed = [...cityId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const quiet = nav.lanes.filter((l) => l.cls >= 3 && l.cls <= 5 && l.length > 40);
    for (let i = 0; i < HELMETS_PER_CITY && quiet.length; i++) {
      const lane = quiet[Math.floor(rand() * quiet.length)]!;
      const id = `${cityId}:${i}`;
      if (collected.includes(id)) continue;
      const p = nav.sample(lane.id, lane.length * (0.3 + rand() * 0.4), { x: 0, z: 0, dx: 0, dz: 0 });
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.position.set(p.x, 1.1, p.z);
      this.group.add(mesh);
      this.helmets.push({ id, x: p.x, z: p.z, mesh });
    }
  }

  update(dt: number, x: number, z: number) {
    this.time += dt;
    for (const h of this.helmets) {
      h.mesh.rotation.y = this.time * 2;
      h.mesh.position.y = 1.1 + Math.sin(this.time * 2.5 + h.x) * 0.15;
      if (h.mesh.visible && Math.hypot(h.x - x, h.z - z) < PICKUP_RADIUS) {
        h.mesh.visible = false;
        this.onCollect(h.id);
        events.emit("collectible", { id: h.id });
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
