/**
 * Instanced street furniture: lamp posts (with warm light pools at night),
 * painted kiosks, umbrella vendors, crate stacks and billboards.
 */
import * as THREE from "three";
import { envUniforms } from "@/game/systems/environment";
import { PROP_KINDS, PROP_STRIDE, type PropKind } from "./build/props";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";

const cyl = (r: number, h: number, x = 0, y = 0, z = 0, seg = 6) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);

const GEOMETRY: Record<PropKind, () => THREE.BufferGeometry> = {
  lamp: () =>
    merge([
      part(cyl(0.09, 6.2, 0, 3.1, 0), "#6B7280"),
      part(block(1.7, 0.1, 0.12, -0.8, 6.1, 0), "#6B7280"),
      part(block(0.55, 0.14, 0.3, -1.55, 6.0, 0), "#FFF1C9", { glow: true }),
    ]),
  kiosk: () =>
    merge([
      part(block(1.9, 2.3, 1.5, 0, 1.15, 0), "#FFFFFF", { tint: true }),
      part(block(1.5, 0.9, 0.06, 0, 1.4, -0.76), "#2A2F3A"),
      part(block(1.5, 0.08, 0.5, 0, 0.95, -0.95), "#F4EFE2"),
      part(block(2.2, 0.08, 0.9, 0, 2.38, -0.4), "#FFFFFF", { tint: true }),
      part(block(1.5, 0.35, 0.04, 0, 2.05, -0.8), "#FFF1C9", { glow: true }),
    ]),
  umbrella: () =>
    merge([
      part(cyl(0.035, 2.3, 0, 1.15, 0), "#4B5563"),
      part(new THREE.ConeGeometry(1.5, 0.6, 8).translate(0, 2.35, 0), "#FFFFFF", { tint: true }),
      part(block(1.3, 0.08, 0.8, 0, 0.8, -0.3), "#8B5E3C"),
      part(block(0.08, 0.8, 0.08, 0.55, 0.4, -0.3), "#6B4A33"),
      part(block(0.08, 0.8, 0.08, -0.55, 0.4, -0.3), "#6B4A33"),
      part(block(0.35, 0.18, 0.3, -0.35, 0.93, -0.3), "#D7261E"),
      part(block(0.35, 0.18, 0.3, 0.05, 0.93, -0.3), "#F2C230"),
      part(block(0.3, 0.16, 0.28, 0.42, 0.92, -0.3), "#4E9A3A"),
      // The vendor on a stool.
      part(block(0.42, 0.55, 0.28, 0, 0.75, 0.45), "#E0457B"),
      part(block(0.36, 0.45, 0.3, 0, 0.25, 0.45), "#3B2A4A"),
      part(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.17, 0.45), "#4A2E1E"),
    ]),
  crates: () =>
    merge([
      part(block(0.6, 0.4, 0.45, 0, 0.2, 0), "#FFFFFF", { tint: true }),
      part(block(0.6, 0.4, 0.45, 0, 0.6, 0.02), "#FFFFFF", { tint: true }),
      part(block(0.6, 0.4, 0.45, 0.66, 0.2, 0), "#B9854E"),
      part(block(0.5, 0.35, 0.4, 0.66, 0.57, 0), "#C9955E"),
      part(block(0.42, 0.18, 0.38, 0.66, 0.84, 0), "#E85A2A"),
    ]),
  billboard: () =>
    merge([
      part(cyl(0.1, 4.4, -1.6, 2.2, 0), "#4B5563"),
      part(cyl(0.1, 4.4, 1.6, 2.2, 0), "#4B5563"),
      part(block(4.6, 2.3, 0.14, 0, 4.6, 0), "#FFFFFF", { tint: true }),
      part(block(4.2, 0.5, 0.16, 0, 4.0, 0), "#FFF6E5", { glow: true }),
    ]),
};

const COLORS: Record<PropKind, string[]> = {
  lamp: ["#FFFFFF"],
  // Phone-network reds and blues, plus the yellows and greens of mitumba stalls.
  kiosk: ["#E60000", "#00377B", "#ED1C24", "#F37021", "#FFC72C", "#0B6E4F", "#00A3DD"],
  umbrella: ["#FF5A4F", "#FFC72C", "#00A3DD", "#2E9E5B", "#FFFFFF", "#E0457B"],
  crates: ["#D7261E", "#1E5AA8", "#F2C230", "#2E9E5B"],
  billboard: ["#E60000", "#00377B", "#FFC72C", "#0B6E4F", "#6A1B9A"],
};

const CAPACITY: Record<PropKind, number> = { lamp: 900, kiosk: 500, umbrella: 900, crates: 500, billboard: 80 };

export class PropField {
  readonly group = new THREE.Group();
  private meshes: Record<PropKind, THREE.InstancedMesh>;
  private pools: THREE.InstancedMesh;
  private poolMaterial: THREE.MeshBasicMaterial;
  private material = createInstancedMaterial({ doubleSide: true, glowStrength: 3 });
  private dummy = new THREE.Object3D();

  constructor() {
    this.group.name = "props";
    const make = (kind: PropKind) => {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), this.material, CAPACITY[kind]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `props-${kind}`;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { lamp: make("lamp"), kiosk: make("kiosk"), umbrella: make("umbrella"), crates: make("crates"), billboard: make("billboard") };
    // Warm light pools under the lamps; their opacity follows nightfall.
    this.poolMaterial = new THREE.MeshBasicMaterial({ color: "#FFB65C", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    const pool = new THREE.CircleGeometry(6.5, 20).rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pool, this.poolMaterial, CAPACITY.lamp);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.group.add(this.pools);
  }

  rebuild(sources: Iterable<Float32Array>) {
    const counts = Object.fromEntries(PROP_KINDS.map((k) => [k, 0])) as Record<PropKind, number>;
    let pools = 0;
    for (const props of sources) {
      for (let i = 0; i < props.length; i += PROP_STRIDE) {
        const kind = PROP_KINDS[props[i + 3]!]!;
        const mesh = this.meshes[kind];
        if (counts[kind] >= CAPACITY[kind]) continue;
        const x = props[i]!, z = props[i + 1]!, yaw = props[i + 2]!, seed = props[i + 4]!;
        this.dummy.position.set(x, 0, z);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.setScalar(kind === "umbrella" || kind === "crates" ? 0.9 + seed * 0.25 : 1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(counts[kind], this.dummy.matrix);
        const palette = COLORS[kind];
        setInstanceHex(mesh, counts[kind], palette[Math.floor(seed * palette.length) % palette.length]!);
        counts[kind]++;
        if (kind === "lamp") {
          // The pool sits under the lamp head, out over the road.
          this.dummy.position.set(x - Math.cos(yaw) * 1.5, 0.33, z + Math.sin(yaw) * 1.5);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.setScalar(1);
          this.dummy.updateMatrix();
          this.pools.setMatrixAt(pools++, this.dummy.matrix);
        }
      }
    }
    for (const kind of PROP_KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.pools.count = pools;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  /** Light pools fade in at dusk. */
  update() {
    this.poolMaterial.opacity = envUniforms.uNight.value * 0.32;
    this.pools.visible = this.poolMaterial.opacity > 0.01;
  }

  dispose() {
    for (const mesh of [...Object.values(this.meshes), this.pools]) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
    this.poolMaterial.dispose();
  }
}
