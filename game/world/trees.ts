/**
 * Low-poly procedural trees (mango, acacia, palm) drawn as one InstancedMesh
 * per species. The streamer feeds instances from whichever chunks are loaded.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TREE_KINDS } from "./format";

const paint = (geometry: THREE.BufferGeometry, hex: string, variation = 0.08, seed = 1) => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const base = new THREE.Color(hex);
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 3) {
    // One tone per face gives the faceted low-poly look.
    const s = Math.sin((i + 1) * 12.9898 * seed) * 43758.5453;
    const f = 1 - variation / 2 + (s - Math.floor(s)) * variation;
    for (let k = 0; k < 3 && i + k < count; k++) {
      colors[(i + k) * 3] = base.r * f;
      colors[(i + k) * 3 + 1] = base.g * f;
      colors[(i + k) * 3 + 2] = base.b * f;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  return g;
};

const trunk = (height: number, radius: number, color = "#6B4A33") =>
  paint(new THREE.CylinderGeometry(radius * 0.75, radius, height, 5).translate(0, height / 2, 0), color, 0.1);

const mango = () => {
  const crown = new THREE.IcosahedronGeometry(2.7, 1).scale(1, 0.78, 1).translate(0, 4.1, 0);
  const side = new THREE.IcosahedronGeometry(1.8, 0).scale(1, 0.8, 1).translate(1.3, 3.5, 0.6);
  return mergeGeometries([trunk(2.8, 0.28), paint(crown, "#4E8F3A", 0.24, 2), paint(side, "#5E9E42", 0.24, 3)])!;
};

const acacia = () => {
  const stem = new THREE.CylinderGeometry(0.12, 0.2, 3.8, 5).translate(0, 1.9, 0).rotateZ(0.12);
  const canopy = new THREE.CylinderGeometry(3.4, 2.6, 0.7, 8).translate(0.45, 4.15, 0);
  const upper = new THREE.CylinderGeometry(2.2, 2.8, 0.45, 7).translate(0.3, 4.6, 0.2);
  return mergeGeometries([paint(stem, "#5A4030", 0.1), paint(canopy, "#8AA84B", 0.2, 4), paint(upper, "#9BB654", 0.2, 5)])!;
};

const palm = () => {
  const parts: THREE.BufferGeometry[] = [trunk(6.2, 0.2, "#7A6450")];
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const leaf = new THREE.BufferGeometry();
    // A drooping frond: three quads in a gentle arc.
    const pts = [
      [0, 0, -0.18], [0, 0, 0.18],
      [1.3, 0.25, -0.4], [1.3, 0.25, 0.4],
      [2.6, -0.1, -0.3], [2.6, -0.1, 0.3],
      [3.4, -0.8, 0], [3.4, -0.8, 0],
    ].flat();
    leaf.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    leaf.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 4, 6, 5, 5, 6, 7]);
    leaf.computeVertexNormals();
    leaf.rotateZ(0.15).rotateY((i / leaves) * Math.PI * 2 + i * 0.3).translate(0, 6.1, 0);
    parts.push(paint(leaf, i % 2 ? "#6BA548" : "#5A9640", 0.18, 6 + i));
  }
  return mergeGeometries(parts)!;
};

const BUILDERS: Record<(typeof TREE_KINDS)[number], () => THREE.BufferGeometry> = { mango, acacia, palm };

export class TreeField {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[];
  private dummy = new THREE.Object3D();

  constructor(material: THREE.Material, capacity: number) {
    this.group.name = "trees";
    this.meshes = TREE_KINDS.map((kind) => {
      const geometry = BUILDERS[kind]();
      geometry.computeVertexNormals();
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `trees-${kind}`;
      mesh.count = 0;
      // Instances are spread over the whole view; culling the batch would never help.
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
  }

  /** Rebuild instance buffers from flat [x, z, kind, scale] arrays (one per loaded chunk). */
  rebuild(sources: Iterable<Float32Array>) {
    const counts = this.meshes.map(() => 0);
    for (const trees of sources) {
      for (let i = 0; i < trees.length; i += 4) {
        const kind = trees[i + 2]!;
        const mesh = this.meshes[kind];
        if (!mesh || counts[kind]! >= mesh.instanceMatrix.count) continue;
        const x = trees[i]!;
        const z = trees[i + 1]!;
        const s = trees[i + 3]!;
        const yaw = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        this.dummy.position.set(x, 0, z);
        this.dummy.rotation.set(0, (yaw - Math.floor(yaw)) * Math.PI * 2, 0);
        this.dummy.scale.set(s, s * (0.9 + (yaw - Math.floor(yaw)) * 0.2), s);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(counts[kind]!++, this.dummy.matrix);
      }
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k]!;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  get count() {
    return this.meshes.reduce((sum, m) => sum + m.count, 0);
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}
