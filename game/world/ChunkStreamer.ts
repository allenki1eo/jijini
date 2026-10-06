/**
 * Streams city chunks around a focus point. Geometry is built in a worker;
 * this class only wraps the returned buffers in meshes and disposes chunks
 * that drift out of range (with hysteresis so borders don't thrash).
 */
import * as THREE from "three";
import type { BuiltChunk, MeshBuffers } from "./build";
import type { ChunkRequest, ChunkResponse } from "./chunk.worker";
import type { ChunkRef, CityManifest } from "./format";
import type { WorldMaterials } from "./materials";
import { TreeField } from "./trees";
import type { WorldIndex } from "./WorldIndex";

export interface StreamProgress {
  /** Desired chunks that are loaded. */
  loaded: number;
  /** Chunks currently desired around the focus. */
  total: number;
  /** Keys of every chunk in the scene. */
  keys: string[];
  triangles: number;
}

interface LoadedChunk {
  ref: ChunkRef;
  meshes: THREE.Mesh[];
  trees: Float32Array;
  triangles: number;
}

const MAX_IN_FLIGHT = 2;
const UNLOAD_MARGIN = 140;
const TREE_CAPACITY = 6000;

const toGeometry = (b: MeshBuffers) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(b.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(b.normal, 3, true));
  g.setAttribute("color", new THREE.BufferAttribute(b.color, 3, true));
  if (b.facade) g.setAttribute("facade", new THREE.BufferAttribute(b.facade, 3));
  g.setIndex(new THREE.BufferAttribute(b.index, 1));
  g.computeBoundingSphere();
  return g;
};

const rectDistance = (ref: ChunkRef, size: number, x: number, z: number) => {
  const minX = ref.cx * size;
  const minZ = ref.cz * size;
  const dx = Math.max(minX - x, 0, x - (minX + size));
  const dz = Math.max(minZ - z, 0, z - (minZ + size));
  return Math.hypot(dx, dz);
};

export class ChunkStreamer {
  readonly root = new THREE.Group();
  private readonly trees: TreeField;
  private readonly worker: Worker;
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly inFlight = new Map<number, ChunkRef>();
  private desired: ChunkRef[] = [];
  private nextId = 1;
  private lastReport = "";
  private focus = { x: 0, z: 0 };
  private disposed = false;

  constructor(
    private readonly manifest: CityManifest,
    private readonly baseUrl: string,
    private readonly materials: WorldMaterials,
    private radius: number,
    private readonly onProgress: (p: StreamProgress) => void,
    private readonly onError: (message: string) => void,
    private readonly index?: WorldIndex,
  ) {
    this.root.name = `city-${manifest.id}`;
    this.trees = new TreeField(materials.trees, TREE_CAPACITY);
    this.root.add(this.trees.group);
    this.worker = new Worker(new URL("./chunk.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<ChunkResponse>) => this.receive(e.data);
    this.worker.onerror = (e) => this.onError(e.message || "Chunk worker crashed");
  }

  setRadius(radius: number) {
    this.radius = radius;
    this.refresh();
  }

  /** Re-plan around a new focus point. Cheap; call a few times per second. */
  update(x: number, z: number) {
    this.focus = { x, z };
    this.refresh();
  }

  private refresh() {
    const { chunkSize, chunks } = this.manifest;
    const { x, z } = this.focus;
    this.desired = chunks
      .map((ref) => ({ ref, d: rectDistance(ref, chunkSize, x, z) }))
      .filter((c) => c.d <= this.radius)
      .sort((a, b) => a.d - b.d)
      .map((c) => c.ref);

    let changed = false;
    for (const [key, chunk] of this.loaded) {
      if (rectDistance(chunk.ref, chunkSize, x, z) > this.radius + UNLOAD_MARGIN) {
        this.unload(key);
        changed = true;
      }
    }
    if (changed) this.trees.rebuild(this.treeSources());
    this.pump();
    this.report();
  }

  private pump() {
    const busy = new Set([...this.inFlight.values()].map((r) => r.key));
    for (const ref of this.desired) {
      if (this.inFlight.size >= MAX_IN_FLIGHT) break;
      if (this.loaded.has(ref.key) || busy.has(ref.key)) continue;
      const id = this.nextId++;
      this.inFlight.set(id, ref);
      this.worker.postMessage({ id, url: `${this.baseUrl}/chunks/${ref.key}.json` } satisfies ChunkRequest);
    }
  }

  private receive(msg: ChunkResponse) {
    const ref = this.inFlight.get(msg.id);
    this.inFlight.delete(msg.id);
    if (this.disposed || !ref) return;
    if (!msg.ok) {
      this.onError(`${ref.key}: ${msg.error}`);
      return;
    }
    // Drop results for chunks we no longer want (the focus moved on).
    const stillWanted = rectDistance(ref, this.manifest.chunkSize, this.focus.x, this.focus.z) <= this.radius + UNLOAD_MARGIN;
    if (stillWanted && !this.loaded.has(ref.key)) this.mount(ref, msg.chunk);
    this.pump();
    this.report();
  }

  private mount(ref: ChunkRef, built: BuiltChunk) {
    const meshes: THREE.Mesh[] = [];
    let triangles = 0;
    const add = (buffers: MeshBuffers | null, material: THREE.Material, name: string) => {
      if (!buffers) return;
      const mesh = new THREE.Mesh(toGeometry(buffers), material);
      mesh.name = `${ref.key}-${name}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      triangles += buffers.index.length / 3;
      meshes.push(mesh);
      this.root.add(mesh);
    };
    add(built.ground, this.materials.ground, "ground");
    add(built.water, this.materials.water, "water");
    add(built.buildings, this.materials.buildings, "buildings");
    this.loaded.set(ref.key, { ref, meshes, trees: built.trees, triangles });
    this.index?.addChunk(ref.key, built.walls, built.roads);
    this.trees.rebuild(this.treeSources());
  }

  private unload(key: string) {
    const chunk = this.loaded.get(key);
    if (!chunk) return;
    for (const mesh of chunk.meshes) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
    }
    this.loaded.delete(key);
    this.index?.removeChunk(key);
  }

  private *treeSources() {
    for (const chunk of this.loaded.values()) yield chunk.trees;
  }

  private report() {
    const loaded = this.desired.filter((r) => this.loaded.has(r.key)).length;
    const keys = [...this.loaded.keys()];
    const signature = `${loaded}/${this.desired.length}/${keys.join(",")}`;
    if (signature === this.lastReport) return;
    this.lastReport = signature;
    let triangles = 0;
    for (const c of this.loaded.values()) triangles += c.triangles;
    this.onProgress({ loaded, total: this.desired.length, keys, triangles });
  }

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    for (const key of [...this.loaded.keys()]) this.unload(key);
    this.trees.dispose();
  }
}
