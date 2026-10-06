/**
 * Hand-built (procedural) landmark models placed from lat/lon in the city
 * config: Arusha's Clock Tower, Kariakoo market's umbrella roofs, Mwanza's
 * Bismarck Rock and Shinyanga's Nguzo Nane pillars. Each also returns wall
 * segments for collisions.
 */
import * as THREE from "three";
import { block, createInstancedMaterial, merge, part } from "./meshKit";

export interface LandmarkBuild {
  object: THREE.Object3D;
  /** Collision walls, flat [x1, z1, x2, z2, ...] in local space. */
  walls: number[];
}

const square = (half: number) => [-half, -half, half, -half, half, -half, half, half, half, half, -half, half, -half, half, -half, -half];
const circle = (r: number, n = 10) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    out.push(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r, Math.sin(b) * r);
  }
  return out;
};

const clockFace = (y: number) => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const rot = (i * Math.PI) / 2;
    parts.push(part(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 20).rotateX(Math.PI / 2).translate(0, y, 1.62).rotateY(rot), "#FFFDF2", { glow: true }));
    parts.push(part(block(0.08, 0.7, 0.06, 0, y + 0.3, 1.68).rotateY(rot), "#10131A"));
    parts.push(part(block(0.5, 0.08, 0.06, 0.22, y, 1.68).rotateY(rot), "#10131A"));
  }
  return parts;
};

const BUILDERS: Record<string, () => LandmarkBuild> = {
  "clock-tower": () => ({
    object: new THREE.Mesh(
      merge([
        part(new THREE.CylinderGeometry(4.5, 4.8, 0.5, 24).translate(0, 0.25, 0), "#C9C2B2"),
        part(block(3.6, 1.2, 3.6, 0, 1.1, 0), "#F2EDE3"),
        part(block(3.0, 9, 3.0, 0, 6.2, 0), "#F7F3EA"),
        part(block(3.3, 0.35, 3.3, 0, 10.8, 0), "#0B6E4F"),
        part(block(3.2, 2.2, 3.2, 0, 12.1, 0), "#F7F3EA"),
        ...clockFace(12.1),
        part(new THREE.ConeGeometry(2.5, 2.6, 4).rotateY(Math.PI / 4).translate(0, 14.5, 0), "#0B6E4F"),
        part(new THREE.SphereGeometry(0.3, 8, 6).translate(0, 15.9, 0), "#FFC72C", { glow: true }),
      ]),
      createInstancedMaterial({ glowStrength: 1.2 }),
    ),
    walls: square(1.6),
  }),
  "kariakoo-market": () => {
    // The market's famous inverted-umbrella concrete roofs.
    const parts: THREE.BufferGeometry[] = [part(block(38, 7, 38, 0, 3.5, 0), "#E9E1CF")];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const x = i * 12.5, z = j * 12.5;
        parts.push(part(new THREE.ConeGeometry(6.6, 3.2, 4).rotateX(Math.PI).rotateY(Math.PI / 4).translate(x, 9.4, z), "#D8D0BE"));
        parts.push(part(new THREE.CylinderGeometry(0.5, 0.6, 3, 8).translate(x, 7.6, z), "#C9C0AC"));
      }
    }
    parts.push(part(block(14, 1.6, 0.3, 0, 5.4, -19.2), "#0B6E4F"));
    parts.push(part(block(12, 0.7, 0.32, 0, 5.4, -19.25), "#FFC72C", { glow: true }));
    return { object: new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1.2 })), walls: square(19) };
  },
  "bismarck-rock": () => {
    const rock = (r: number, x: number, y: number, z: number, sy = 0.8) => part(new THREE.IcosahedronGeometry(r, 1).scale(1, sy, 1).translate(x, y, z), "#9C8A86");
    return {
      object: new THREE.Mesh(
        merge([
          rock(5.5, 0, 2.5, 0),
          rock(3.6, 1.2, 7.8, -0.6, 0.75),
          rock(2.4, 0.6, 11.2, -0.2, 0.9),
          rock(1.4, 0.8, 13.6, 0, 1),
          rock(3.2, -5.5, 1.4, 3, 0.6),
          rock(2.2, 5.6, 1, -2.6, 0.7),
        ]),
        createInstancedMaterial(),
      ),
      walls: circle(6),
    };
  },
  "nguzo-nane": () => {
    const parts: THREE.BufferGeometry[] = [part(new THREE.CylinderGeometry(7.5, 8, 0.6, 32).translate(0, 0.3, 0), "#C9C2B2")];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(new THREE.CylinderGeometry(0.45, 0.55, 6.5, 10).translate(Math.cos(a) * 5.5, 3.6, Math.sin(a) * 5.5), "#F7F3EA"));
    }
    parts.push(part(new THREE.TorusGeometry(5.5, 0.45, 8, 32).rotateX(Math.PI / 2).translate(0, 7, 0), "#0B6E4F"));
    parts.push(part(new THREE.SphereGeometry(0.6, 10, 8).translate(0, 7.8, 0), "#FFC72C", { glow: true }));
    return { object: new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1.2 })), walls: [] };
  },
};

export const buildLandmark = (id: string): LandmarkBuild | null => BUILDERS[id]?.() ?? null;
