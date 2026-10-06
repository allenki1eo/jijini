/**
 * Directed lanes over the baked navigation graph, plus A* routing.
 * Two-way edges become two lanes; one-way edges a single lane.
 */
import { DM, type NavGraph } from "@/game/world/format";
import { fetchJson } from "@/lib/fetchJson";

export interface Lane {
  id: number;
  edge: number;
  from: number;
  to: number;
  /** Polyline (m), flat [x, z, ...]. */
  pts: Float32Array;
  /** Cumulative length at each point. */
  cum: Float32Array;
  length: number;
  cls: number;
  /** Road width (m). */
  width: number;
  /** Speed limit (m/s). */
  speed: number;
  oneWay: boolean;
}

export interface LanePoint {
  x: number;
  z: number;
  /** Unit direction of travel. */
  dx: number;
  dz: number;
}

export class NavNetwork {
  readonly lanes: Lane[] = [];
  readonly nodes: Float32Array;
  /** Outgoing lane ids per node. */
  readonly out: number[][];
  /** Lane id of the opposite direction (or -1). */
  readonly reverse: number[] = [];

  constructor(graph: NavGraph) {
    this.nodes = new Float32Array(graph.nodes.length);
    for (let i = 0; i < graph.nodes.length; i++) this.nodes[i] = graph.nodes[i]! / DM;
    this.out = Array.from({ length: graph.nodes.length / 2 }, () => []);
    graph.edges.forEach((e, edgeIndex) => {
      const flat = [graph.nodes[e.a * 2]!, graph.nodes[e.a * 2 + 1]!, ...(e.p ?? []), graph.nodes[e.b * 2]!, graph.nodes[e.b * 2 + 1]!].map((v) => v / DM);
      const forward = this.addLane(edgeIndex, e.a, e.b, flat, e.c, e.w / DM, e.s / 3.6, Boolean(e.o));
      if (!e.o) {
        const rev: number[] = [];
        for (let i = flat.length - 2; i >= 0; i -= 2) rev.push(flat[i]!, flat[i + 1]!);
        const backward = this.addLane(edgeIndex, e.b, e.a, rev, e.c, e.w / DM, e.s / 3.6, false);
        this.reverse[forward] = backward;
        this.reverse[backward] = forward;
      } else this.reverse[forward] = -1;
    });
  }

  private addLane(edge: number, from: number, to: number, flat: number[], cls: number, width: number, speed: number, oneWay: boolean) {
    const n = flat.length / 2;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(flat[i * 2]! - flat[i * 2 - 2]!, flat[i * 2 + 1]! - flat[i * 2 - 1]!);
    const id = this.lanes.length;
    this.lanes.push({ id, edge, from, to, pts: new Float32Array(flat), cum, length: Math.max(cum[n - 1]!, 0.1), cls, width, speed, oneWay });
    this.out[from]!.push(id);
    return id;
  }

  nodeX(n: number) {
    return this.nodes[n * 2]!;
  }

  nodeZ(n: number) {
    return this.nodes[n * 2 + 1]!;
  }

  /** Position and direction at distance `s` along a lane. Writes into `out`. */
  sample(laneId: number, s: number, out: LanePoint): LanePoint {
    const lane = this.lanes[laneId]!;
    const { pts, cum } = lane;
    const clamped = Math.max(0, Math.min(lane.length, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < clamped) i++;
    const seg = cum[i]! - cum[i - 1]! || 1;
    const t = (clamped - cum[i - 1]!) / seg;
    const ax = pts[i * 2 - 2]!, az = pts[i * 2 - 1]!, bx = pts[i * 2]!, bz = pts[i * 2 + 1]!;
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    const l = Math.hypot(bx - ax, bz - az) || 1;
    out.dx = (bx - ax) / l;
    out.dz = (bz - az) / l;
    return out;
  }

  /** Pick the next lane at the end of `laneId`, avoiding U-turns unless it's a dead end. */
  nextLane(laneId: number, random: number, preferMajor = 0.5): number {
    const lane = this.lanes[laneId]!;
    const options = this.out[lane.to]!.filter((id) => id !== this.reverse[laneId]);
    if (!options.length) return this.reverse[laneId] ?? laneId;
    // Traffic prefers staying on bigger roads.
    const weights = options.map((id) => 1 + (6 - this.lanes[id]!.cls) * preferMajor);
    let r = random * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return options[i]!;
    }
    return options[options.length - 1]!;
  }

  nearestNode(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i += 2) {
      const d = (this.nodes[i]! - x) ** 2 + (this.nodes[i + 1]! - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i / 2;
      }
    }
    return best;
  }

  /** Nearest point on any lane: lane id, distance along it and the point. */
  nearestOnNetwork(x: number, z: number): { lane: number; s: number; x: number; z: number; distance: number } {
    let best = { lane: 0, s: 0, x, z, distance: Infinity };
    for (const lane of this.lanes) {
      const { pts, cum } = lane;
      for (let i = 1; i < cum.length; i++) {
        const ax = pts[i * 2 - 2]!, az = pts[i * 2 - 1]!, bx = pts[i * 2]!, bz = pts[i * 2 + 1]!;
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < best.distance) best = { lane: lane.id, s: cum[i - 1]! + Math.sqrt(l2) * t, x: px, z: pz, distance: d };
      }
    }
    return best;
  }

  /** A* from node to node over lanes. Returns lane ids, or null if unreachable. */
  route(fromNode: number, toNode: number): number[] | null {
    if (fromNode === toNode) return [];
    const n = this.out.length;
    const g = new Float64Array(n).fill(Infinity);
    const via = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const tx = this.nodeX(toNode), tz = this.nodeZ(toNode);
    const h = (i: number) => Math.hypot(this.nodeX(i) - tx, this.nodeZ(i) - tz);
    // Small binary heap of [f, node].
    const heap: [number, number][] = [];
    const push = (f: number, node: number) => {
      heap.push([f, node]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    g[fromNode] = 0;
    push(h(fromNode), fromNode);
    while (heap.length) {
      const [, node] = pop();
      if (node === toNode) break;
      if (closed[node]) continue;
      closed[node] = 1;
      for (const laneId of this.out[node]!) {
        const lane = this.lanes[laneId]!;
        // Prefer main roads a little: they're faster on a boda too.
        const cost = g[node]! + lane.length * (1 + lane.cls * 0.04);
        if (cost < g[lane.to]!) {
          g[lane.to] = cost;
          via[lane.to] = laneId;
          push(cost + h(lane.to), lane.to);
        }
      }
    }
    if (via[toNode] === -1) return null;
    const lanes: number[] = [];
    for (let node = toNode; node !== fromNode; ) {
      const laneId = via[node]!;
      lanes.push(laneId);
      node = this.lanes[laneId]!.from;
    }
    return lanes.reverse();
  }
}

export const loadNavNetwork = async (baseUrl: string): Promise<NavNetwork> => new NavNetwork(await fetchJson<NavGraph>(`${baseUrl}/navgraph.json`));
