/**
 * In-world wayfinding: glowing chevrons painted along the route ahead of the
 * rider and a light beam over the current stop.
 */
import * as THREE from "three";
import { block, createInstancedMaterial, merge, part } from "@/game/world/meshKit";
import type { StopKind } from "./types";

const CHEVRONS = 18;
const SPACING = 7;
/** Meters ahead of the rider where the first chevron sits. */
const LEAD = 6;

const STOP_COLORS: Record<StopKind, string> = {
  pickup: "#FFC72C",
  dropoff: "#2ED47A",
  checkpoint: "#FF5A4F",
  photo: "#00A3DD",
  buy: "#F59E0B",
};

const chevronGeometry = () =>
  merge([
    part(block(0.35, 0.04, 1.6, -0.45, 0, 0).rotateY(-0.7), "#FFC72C", { glow: true }),
    part(block(0.35, 0.04, 1.6, 0.45, 0, 0).rotateY(0.7), "#FFC72C", { glow: true }),
  ]);

export class RouteGuide {
  readonly group = new THREE.Group();
  private chevrons: THREE.InstancedMesh;
  private material = createInstancedMaterial({ glowStrength: 1.2 });
  private beam: THREE.Mesh;
  private ring: THREE.Mesh;
  private beamMaterial: THREE.ShaderMaterial;
  private ringMaterial: THREE.MeshBasicMaterial;
  private dummy = new THREE.Object3D();
  private time = 0;

  constructor() {
    this.chevrons = new THREE.InstancedMesh(chevronGeometry(), this.material, CHEVRONS);
    this.chevrons.count = 0;
    this.chevrons.frustumCulled = false;
    this.beamMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; varying float vY;
        void main() {
          float fade = 1.0 - smoothstep(0.0, 34.0, vY);
          float pulse = 0.75 + 0.25 * sin(uTime * 3.0 - vY * 0.4);
          gl_FragColor = vec4(uColor * pulse, 0.55 * fade);
        }`,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 34, 20, 1, true).translate(0, 17, 0), this.beamMaterial);
    this.ringMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 32).rotateX(-Math.PI / 2), this.ringMaterial);
    this.ring.position.y = 0.36;
    this.group.add(this.chevrons, this.beam, this.ring);
    this.setStop(null);
  }

  setStop(stop: { x: number; z: number; kind: StopKind } | null) {
    this.beam.visible = this.ring.visible = Boolean(stop);
    if (!stop) {
      this.chevrons.count = 0;
      return;
    }
    const color = new THREE.Color(STOP_COLORS[stop.kind]);
    (this.beamMaterial.uniforms.uColor!.value as THREE.Color).copy(color);
    this.ringMaterial.color.copy(color);
    this.beam.position.set(stop.x, 0, stop.z);
    this.ring.position.set(stop.x, 0.36, stop.z);
  }

  /** Lay chevrons along the route polyline starting near the rider. */
  update(dt: number, route: Float32Array | null, fromX: number, fromZ: number, loading: number) {
    this.time += dt;
    this.beamMaterial.uniforms.uTime!.value = this.time;
    const s = 1 + Math.sin(this.time * 4) * 0.06 + loading * 0.4;
    this.ring.scale.set(s, 1, s);
    if (!route || route.length < 4) {
      this.chevrons.count = 0;
      return;
    }
    // Project the rider onto the route, then lay chevrons from a few meters ahead.
    let seg = 0;
    let along = 0;
    let best = Infinity;
    for (let i = 0; i + 3 < route.length; i += 2) {
      const ax = route[i]!, az = route[i + 1]!, dx = route[i + 2]! - ax, dz = route[i + 3]! - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((fromX - ax) * dx + (fromZ - az) * dz) / l2));
      const d = (ax + dx * t - fromX) ** 2 + (az + dz * t - fromZ) ** 2;
      if (d < best) {
        best = d;
        seg = i;
        along = t * Math.sqrt(l2);
      }
    }
    let count = 0;
    let carry = along + LEAD;
    for (let i = seg; i + 3 < route.length && count < CHEVRONS; i += 2) {
      const ax = route[i]!, az = route[i + 1]!, bx = route[i + 2]!, bz = route[i + 3]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      let t = carry;
      for (; t < len && count < CHEVRONS; t += SPACING) {
        this.dummy.position.set(ax + dx * t, 0.37, az + dz * t);
        this.dummy.rotation.set(0, Math.atan2(-dx, -dz), 0);
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 6 - count * 0.7);
        this.dummy.scale.setScalar(pulse * 0.75);
        this.dummy.updateMatrix();
        this.chevrons.setMatrixAt(count++, this.dummy.matrix);
      }
      carry = t - len;
    }
    this.chevrons.count = count;
    this.chevrons.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.chevrons.geometry.dispose();
    this.material.dispose();
    this.beam.geometry.dispose();
    this.beamMaterial.dispose();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
  }
}
