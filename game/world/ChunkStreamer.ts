/**
 * Streams city chunks around a focus point. Geometry is built in a worker;
 * this class only wraps the returned buffers in meshes and disposes chunks
 * that drift out of range (with hysteresis so borders don't thrash).
 *
 * Loading is built for patchy mobile data: a failed chunk is retried with
 * backoff instead of failing the city, and if the worker can't start (or
 * dies) chunks are built on the main thread instead.
 */
import * as THREE from "three";
import { fetchJson } from "@/lib/fetchJson";
import type { BuiltChunk, MeshBuffers } from "./build";
import type { ChunkRequest, ChunkResponse } from "./chunk.worker";
import type { ChunkData, ChunkRef, CityManifest } from "./format";
import type { WorldMaterials } from "./materials";
import { PropField } from "./props";
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
  props: Float32Array;
  triangles: number;
}

const MAX_IN_FLIGHT = 2;
const UNLOAD_MARGIN = 140;
const TREE_CAPACITY = 6000;
/** A chunk that keeps failing waits 2 s, 4 s, 8 s … (capped) before the next try. */
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;
/** Before any chunk has loaded, this many failed rounds on one chunk is fatal (each round already retries). */
const FATAL_ROUNDS = 2;

interface Failure {
  rounds: number;
  retryAt: number;
}

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
  private readonly props = new PropField();
  private worker: Worker | null = null;
  private readonly failures = new Map<string, Failure>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.root.add(this.props.group);
    try {
      const worker = new Worker(new URL("./chunk.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<ChunkResponse>) => this.receive(e.data);
      worker.onerror = (e) => {
        e.preventDefault();
        console.warn("[chunks] worker failed, building on the main thread:", e.message || "script did not load");
        this.dropWorker();
      };
      this.worker = worker;
    } catch (error) {
      console.warn("[chunks] no worker, building on the main thread:", error);
    }
  }

  /** Switch to main-thread building and re-send whatever the worker was holding. */
  private dropWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    for (const [id, ref] of this.inFlight) void this.buildInline(id, this.chunkUrl(ref));
  }

  private async buildInline(id: number, url: string) {
    let msg: ChunkResponse;
    try {
      const [{ buildChunk }, data] = await Promise.all([import("./build"), fetchJson<ChunkData>(url)]);
      msg = { id, ok: true, chunk: buildChunk(data) };
    } catch (error) {
      msg = { id, ok: false, error: (error as Error).message };
    }
    this.receive(msg);
  }

  private chunkUrl(ref: ChunkRef) {
    return `${this.baseUrl}/chunks/${ref.key}.json`;
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
    if (changed) this.rebuildInstances();
    this.pump();
    this.report();
  }

  private pump() {
    if (this.disposed) return;
    const busy = new Set([...this.inFlight.values()].map((r) => r.key));
    const now = performance.now();
    let nextRetry = Infinity;
    for (const ref of this.desired) {
      if (this.inFlight.size >= MAX_IN_FLIGHT) break;
      if (this.loaded.has(ref.key) || busy.has(ref.key)) continue;
      const failure = this.failures.get(ref.key);
      if (failure && failure.retryAt > now) {
        nextRetry = Math.min(nextRetry, failure.retryAt);
        continue;
      }
      const id = this.nextId++;
      this.inFlight.set(id, ref);
      const url = this.chunkUrl(ref);
      if (this.worker) this.worker.postMessage({ id, url } satisfies ChunkRequest);
      else void this.buildInline(id, url);
    }
    // Nothing else wakes the streamer while the only pending chunks are backing off.
    if (nextRetry !== Infinity && this.retryTimer === null) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.pump();
      }, nextRetry - now);
    }
  }

  private receive(msg: ChunkResponse) {
    const ref = this.inFlight.get(msg.id);
    this.inFlight.delete(msg.id);
    if (this.disposed || !ref) return;
    if (!msg.ok) {
      const failure = this.failures.get(ref.key) ?? { rounds: 0, retryAt: 0 };
      failure.rounds++;
      failure.retryAt = performance.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failure.rounds - 1));
      this.failures.set(ref.key, failure);
      console.warn(`[chunks] ${ref.key} failed (round ${failure.rounds}): ${msg.error}`);
      // Give up only while the city is still empty; once riding, keep retrying quietly.
      if (this.loaded.size === 0 && failure.rounds >= FATAL_ROUNDS) this.onError(msg.error);
      else this.pump();
      return;
    }
    this.failures.delete(ref.key);
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
    this.loaded.set(ref.key, { ref, meshes, trees: built.trees, props: built.props, triangles });
    this.index?.addChunk(ref.key, built.walls, built.roads);
    this.rebuildInstances();
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

  private rebuildInstances() {
    const chunks = [...this.loaded.values()];
    this.trees.rebuild(chunks.map((c) => c.trees));
    this.props.rebuild(chunks.map((c) => c.props));
  }

  /** Per-frame cosmetic updates (lamp light pools). */
  tick() {
    this.props.update();
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
    this.worker?.terminate();
    this.worker = null;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    for (const key of [...this.loaded.keys()]) this.unload(key);
    this.trees.dispose();
    this.props.dispose();
  }
}
