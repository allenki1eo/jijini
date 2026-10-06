/**
 * Traffic lights at the big junctions, where two or more main roads meet.
 * Approaches are split into two crossing axes that take turns: green,
 * amber, a short all-red, then the other way. Traffic stops on red (and on
 * amber when it can), and a rider who runs a red near a police officer gets
 * waved down.
 */
import * as THREE from "three";
import { block, createInstancedMaterial, merge, part } from "@/game/world/meshKit";
import type { NavNetwork } from "./NavNetwork";

export type Signal = "green" | "amber" | "red";

const GREEN = 13;
const AMBER = 3;
const ALL_RED = 1.5;
const CYCLE = (GREEN + AMBER + ALL_RED) * 2;
const SPACING = 140;
/** Where vehicles wait, short of the junction centre (m). */
export const STOP_BACK = 7;

interface Junction {
  node: number;
  x: number;
  z: number;
  offset: number;
  /** Incoming lane id → axis 0 or 1. */
  axis: Map<number, 0 | 1>;
}

const LENS_ON: Record<Signal, THREE.Color> = { red: new THREE.Color("#FF2D2D"), amber: new THREE.Color("#FFB020"), green: new THREE.Color("#2EE27A") };
const LENS_OFF = new THREE.Color("#1C2026");

const headGeometry = () =>
  merge([
    part(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8).translate(0, 1.7, 0), "#3A3F4A"),
    part(block(0.42, 1.18, 0.3, 0, 3.75, 0), "#15171C"),
    // Sun visors over each lamp.
    ...[4.12, 3.75, 3.38].map((y) => part(block(0.34, 0.04, 0.16, 0, y + 0.15, -0.22), "#15171C")),
    // Yellow and black backboard.
    part(block(0.62, 1.4, 0.04, 0, 3.75, 0.17), "#FFC72C"),
  ]);

export class TrafficLights {
  readonly group = new THREE.Group();
  private readonly junctions: Junction[] = [];
  /** lane id → junction index, for every signalled approach. */
  private readonly byLane = new Map<number, number>();
  private readonly lenses: THREE.InstancedMesh;
  private readonly lensSlots: { lane: number; signal: Signal }[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private time = 0;
  private sinceRecolour = 1;

  /** `max`: how many junctions get lights (big cities have more). */
  constructor(
    private readonly nav: NavNetwork,
    max: number,
  ) {
    this.group.name = "traffic-lights";
    // Incoming lanes per node, and how many of them are main roads.
    const incoming = new Map<number, number[]>();
    nav.lanes.forEach((lane) => incoming.set(lane.to, [...(incoming.get(lane.to) ?? []), lane.id]));
    const candidates = [...incoming.entries()]
      .map(([node, lanes]) => ({ node, lanes, major: new Set(lanes.filter((id) => nav.lanes[id]!.cls <= 2).map((id) => nav.lanes[id]!.edge)).size, edges: new Set(lanes.map((id) => nav.lanes[id]!.edge)).size }))
      .filter((c) => c.edges >= 3 && c.major >= 2)
      // Busiest first; among equals, the ones nearest the town centre.
      .sort((a, b) => b.major - a.major || b.edges - a.edges || Math.hypot(nav.nodeX(a.node), nav.nodeZ(a.node)) - Math.hypot(nav.nodeX(b.node), nav.nodeZ(b.node)));

    for (const c of candidates) {
      if (this.junctions.length >= max) break;
      const x = nav.nodeX(c.node), z = nav.nodeZ(c.node);
      if (this.junctions.some((j) => Math.hypot(j.x - x, j.z - z) < SPACING)) continue;
      // Split approaches into two crossing axes by their direction of travel.
      const dirs = c.lanes.map((id) => ({ id, ...this.approachDir(id) }));
      const ref = dirs[0]!;
      const axis = new Map<number, 0 | 1>();
      for (const d of dirs) axis.set(d.id, Math.abs(d.dx * ref.dx + d.dz * ref.dz) > 0.6 ? 0 : 1);
      if (![...axis.values()].includes(1)) continue;
      const index = this.junctions.length;
      this.junctions.push({ node: c.node, x, z, offset: (c.node * 7.3) % CYCLE, axis });
      for (const id of c.lanes) this.byLane.set(id, index);
    }

    // A signal head on the left verge of each approach (traffic keeps left), facing oncoming drivers.
    const heads: THREE.Matrix4[] = [];
    const lensMatrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (const [laneId] of this.byLane) {
      const lane = nav.lanes[laneId]!;
      const { dx, dz } = this.approachDir(laneId);
      const end = lane.pts.length - 2;
      const ex = lane.pts[end]!, ez = lane.pts[end + 1]!;
      const side = lane.width / 2 + 0.9;
      const x = ex - dx * (STOP_BACK - 1) + dz * side, z = ez - dz * (STOP_BACK - 1) - dx * side;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, Math.atan2(dx, dz), 0);
      dummy.updateMatrix();
      heads.push(dummy.matrix.clone());
      for (const [i, signal] of (["red", "amber", "green"] as const).entries()) {
        const lens = new THREE.Object3D();
        lens.position.set(0, 4.12 - i * 0.37, -0.16);
        lens.updateMatrix();
        lensMatrices.push(dummy.matrix.clone().multiply(lens.matrix));
        this.lensSlots.push({ lane: laneId, signal });
      }
    }
    const material = createInstancedMaterial();
    const headGeo = headGeometry();
    const poles = new THREE.InstancedMesh(headGeo, material, Math.max(1, heads.length));
    heads.forEach((m, i) => poles.setMatrixAt(i, m));
    poles.count = heads.length;
    const lensGeo = new THREE.CircleGeometry(0.13, 14).rotateY(Math.PI);
    const lensMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.lenses = new THREE.InstancedMesh(lensGeo, lensMat, Math.max(1, lensMatrices.length));
    lensMatrices.forEach((m, i) => {
      this.lenses.setMatrixAt(i, m);
      this.lenses.setColorAt(i, LENS_OFF);
    });
    this.lenses.count = lensMatrices.length;
    poles.frustumCulled = this.lenses.frustumCulled = false;
    this.group.add(poles, this.lenses);
    this.owned.push(headGeo, material, lensGeo, lensMat);
  }

  /** Direction of travel at the end of a lane (normalized). */
  private approachDir(laneId: number) {
    const p = this.nav.lanes[laneId]!.pts;
    const n = p.length;
    const dx = p[n - 2]! - p[n - 4]!, dz = p[n - 1]! - p[n - 3]!;
    const l = Math.hypot(dx, dz) || 1;
    return { dx: dx / l, dz: dz / l };
  }

  /** Signal for an approach lane, or null when the lane isn't signalled. */
  signal(laneId: number): Signal | null {
    const j = this.byLane.get(laneId);
    if (j === undefined) return null;
    const junction = this.junctions[j]!;
    const t = (this.time + junction.offset) % CYCLE;
    const axis = junction.axis.get(laneId)!;
    const local = axis === 0 ? t : (t + CYCLE / 2) % CYCLE;
    return local < GREEN ? "green" : local < GREEN + AMBER ? "amber" : "red";
  }

  /** Should a vehicle `remaining` metres from the end of this lane hold at the stop line? */
  holds(laneId: number, remaining: number): boolean {
    const s = this.signal(laneId);
    if (s === null || s === "green" || remaining < STOP_BACK - 1) return false;
    // On amber, only stop if there's room to.
    return s === "red" || remaining > STOP_BACK + 10;
  }

  /** Junctions (minimap). */
  get points() {
    return this.junctions;
  }

  /** The signalled approach a rider at (x, z) heading (fx, fz) is on, if near a junction. */
  approachAt(x: number, z: number, fx: number, fz: number): { lane: number; distance: number } | null {
    for (const [laneId, j] of this.byLane) {
      const junction = this.junctions[j]!;
      const d = Math.hypot(junction.x - x, junction.z - z);
      if (d > 14) continue;
      const { dx, dz } = this.approachDir(laneId);
      if (dx * fx + dz * fz > 0.8) return { lane: laneId, distance: d };
    }
    return null;
  }

  /** The nearest signal ahead of a rider within `range` metres, if any. */
  ahead(x: number, z: number, fx: number, fz: number, range = 70): { signal: Signal; distance: number } | null {
    let best: { signal: Signal; distance: number } | null = null;
    for (const [laneId, j] of this.byLane) {
      const junction = this.junctions[j]!;
      const vx = junction.x - x, vz = junction.z - z;
      const d = Math.hypot(vx, vz);
      if (d > range || d < 4 || (vx * fx + vz * fz) / d < 0.75) continue;
      const { dx, dz } = this.approachDir(laneId);
      if (dx * fx + dz * fz < 0.75) continue;
      if (!best || d < best.distance) best = { signal: this.signal(laneId)!, distance: d };
    }
    return best;
  }

  update(dt: number) {
    this.time += dt;
    // Phases last seconds, so a few recolours a second is plenty.
    this.sinceRecolour += dt;
    if (this.sinceRecolour < 0.25) return;
    this.sinceRecolour = 0;
    this.lensSlots.forEach(({ lane, signal }, i) => this.lenses.setColorAt(i, this.signal(lane) === signal ? LENS_ON[signal] : LENS_OFF));
    if (this.lenses.instanceColor) this.lenses.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
  }
}
