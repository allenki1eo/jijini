/**
 * Pooled soft particles (red-earth dust, exhaust puffs, rain spray) drawn as
 * one Points object. Fixed buffers, no allocations per frame.
 */
import * as THREE from "three";

const CAPACITY = 320;

export type ParticleKind = "dust" | "mud" | "exhaust" | "spray";

const STYLE: Record<ParticleKind, { color: [number, number, number]; life: number; size: number; grow: number; rise: number }> = {
  dust: { color: [0.78, 0.5, 0.33], life: 1.3, size: 1.1, grow: 2.2, rise: 0.5 },
  mud: { color: [0.42, 0.28, 0.18], life: 0.8, size: 0.7, grow: 0.8, rise: 0.2 },
  exhaust: { color: [0.72, 0.74, 0.78], life: 1.0, size: 0.35, grow: 1.4, rise: 0.6 },
  spray: { color: [0.85, 0.9, 0.95], life: 0.5, size: 0.6, grow: 1.6, rise: 0.4 },
};

export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(CAPACITY * 3);
  private vel = new Float32Array(CAPACITY * 3);
  private col = new Float32Array(CAPACITY * 3);
  /** [age, life, size, grow] */
  private meta = new Float32Array(CAPACITY * 4);
  private alpha = new Float32Array(CAPACITY);
  private size = new Float32Array(CAPACITY);
  private cursor = 0;
  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;

  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < CAPACITY; i++) this.pos[i * 3 + 1] = -100;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float size;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 320.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.15, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const s = STYLE[kind];
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % CAPACITY;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx + (Math.random() - 0.5) * 0.8, vy + s.rise * Math.random(), vz + (Math.random() - 0.5) * 0.8], i * 3);
    this.col.set(s.color, i * 3);
    this.meta.set([0, s.life * (0.7 + Math.random() * 0.6), s.size, s.grow], i * 4);
  }

  update(dt: number) {
    for (let i = 0; i < CAPACITY; i++) {
      const life = this.meta[i * 4 + 1]!;
      if (life <= 0) continue;
      const age = (this.meta[i * 4] = this.meta[i * 4]! + dt);
      const t = age / life;
      if (t >= 1) {
        this.meta[i * 4 + 1] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const drag = Math.exp(-2.2 * dt);
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k]! *= drag;
        this.pos[i * 3 + k]! += this.vel[i * 3 + k]! * dt;
      }
      this.alpha[i] = (1 - t) * (t < 0.1 ? t * 10 : 1) * 0.55;
      this.size[i] = this.meta[i * 4 + 2]! * (1 + t * this.meta[i * 4 + 3]!);
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.alpha!.needsUpdate = true;
    this.geometry.attributes.size!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
