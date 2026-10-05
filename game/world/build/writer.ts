/** Growable geometry writer used by the chunk builders (runs inside the worker). */

export interface MeshBuffers {
  position: Float32Array;
  /** Normalized int8 normals. */
  normal: Int8Array;
  /** Normalized uint8 RGB. */
  color: Uint8Array;
  index: Uint32Array;
  /** Building facades only: [u along wall (m), height (m), style] per vertex. */
  facade?: Float32Array;
}

export type RGB = readonly [number, number, number];

export const hexToRgb = (hex: string): RGB => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Cheap deterministic hash of a world position -> [0, 1). */
export const hash2 = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class GeometryWriter {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private fac: number[] | null;

  constructor(withFacade = false) {
    this.fac = withFacade ? [] : null;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB, shade = 1, facade?: readonly [number, number, number]): number {
    this.pos.push(x, y, z);
    this.nrm.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127));
    this.col.push(
      Math.min(255, Math.round(c[0] * shade)),
      Math.min(255, Math.round(c[1] * shade)),
      Math.min(255, Math.round(c[2] * shade)),
    );
    if (this.fac) this.fac.push(...(facade ?? [0, -1, 0]));
    return this.pos.length / 3 - 1;
  }

  /** Flat, upward-facing vertex with subtle color jitter so large surfaces don't look plastic. */
  ground(x: number, y: number, z: number, c: RGB, jitter = 0.06): number {
    return this.vertex(x, y, z, 0, 1, 0, c, 1 - jitter / 2 + hash2(x, z) * jitter);
  }

  /** Add a triangle, flipping it if needed so its face normal agrees with (nx, ny, nz). */
  triangle(a: number, b: number, c: number, nx = 0, ny = 1, nz = 0) {
    const p = this.pos;
    const ax = p[a * 3]!, ay = p[a * 3 + 1]!, az = p[a * 3 + 2]!;
    const ux = p[b * 3]! - ax, uy = p[b * 3 + 1]! - ay, uz = p[b * 3 + 2]! - az;
    const vx = p[c * 3]! - ax, vy = p[c * 3 + 1]! - ay, vz = p[c * 3 + 2]! - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  quad(a: number, b: number, c: number, d: number, nx = 0, ny = 1, nz = 0) {
    this.triangle(a, b, c, nx, ny, nz);
    this.triangle(a, c, d, nx, ny, nz);
  }

  finish(): MeshBuffers | null {
    if (!this.idx.length) return null;
    return {
      position: new Float32Array(this.pos),
      normal: new Int8Array(this.nrm),
      color: new Uint8Array(this.col),
      index: new Uint32Array(this.idx),
      ...(this.fac ? { facade: new Float32Array(this.fac) } : {}),
    };
  }
}

export const transferables = (m: MeshBuffers | null): ArrayBuffer[] =>
  m
    ? ([m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer, m.facade?.buffer].filter(Boolean) as ArrayBuffer[])
    : [];
