/**
 * Vinyl banners strung across the main roads between two poles, the way
 * shops and events advertise in every Tanzanian town. Their artwork comes
 * from the city's ad atlas.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { AD_SLOTS, createAdMaterial } from "./adAtlas";
import { createInstancedMaterial, merge, part } from "./meshKit";

const SPACING = 240;
const HEIGHT = 5.4;
const BANNER_H = 1.3;

export class RoadBanners {
  readonly group = new THREE.Group();
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(nav: NavNetwork) {
    this.group.name = "road-banners";
    const spots: { x: number; z: number; dx: number; dz: number; width: number }[] = [];
    const seenEdges = new Set<number>();
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    for (const lane of nav.lanes) {
      if (lane.cls > 1 || seenEdges.has(lane.edge) || lane.length < 120) continue;
      seenEdges.add(lane.edge);
      for (let s = SPACING * 0.4; s < lane.length - 30; s += SPACING) {
        nav.sample(lane.id, s, p);
        if (spots.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 160)) continue;
        spots.push({ x: p.x, z: p.z, dx: p.dx, dz: p.dz, width: lane.width + 3 });
      }
    }

    const dummy = new THREE.Object3D();
    const poleGeometry = merge([part(new THREE.CylinderGeometry(0.07, 0.09, HEIGHT + 0.9, 6).translate(0, (HEIGHT + 0.9) / 2, 0), "#6B7280")]);
    const poleMaterial = createInstancedMaterial();
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, Math.max(1, spots.length * 2));
    // Printed on both sides, so it reads correctly from either direction.
    const strip = mergeGeometries([new THREE.PlaneGeometry(1, BANNER_H).translate(0, 0, 0.02), new THREE.PlaneGeometry(1, BANNER_H).rotateY(Math.PI).translate(0, 0, -0.02)])!;
    const cells = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, spots.length)), 1);
    strip.setAttribute("aCell", cells);
    const stripMaterial = createAdMaterial("strips");
    const banners = new THREE.InstancedMesh(strip, stripMaterial, Math.max(1, spots.length));

    spots.forEach((s, i) => {
      // Across the road: the banner faces along the traffic.
      const yaw = Math.atan2(s.dx, s.dz);
      const half = s.width / 2;
      for (const side of [-1, 1]) {
        dummy.position.set(s.x + s.dz * half * side, 0, s.z - s.dx * half * side);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        poles.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), dummy.matrix);
      }
      dummy.position.set(s.x, HEIGHT, s.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(s.width, 1, 1);
      dummy.updateMatrix();
      banners.setMatrixAt(i, dummy.matrix);
      cells.setX(i, (i * 5 + 3) % AD_SLOTS);
    });
    poles.count = spots.length * 2;
    banners.count = spots.length;
    poles.frustumCulled = banners.frustumCulled = false;
    this.group.add(poles, banners);
    this.owned.push(poleGeometry, poleMaterial, strip, stripMaterial);
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
  }
}
