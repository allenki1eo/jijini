/**
 * Bank branches from OpenStreetMap, at the kerb: an ATM lobby in the bank's
 * colours with its name lit above the door, a glowing ATM screen and an
 * askari (guard) at the door. Stop in front to deposit or withdraw.
 *
 * Local frame: −z faces the road.
 */
import * as THREE from "three";
import { BANKS, bankOf, type BankId } from "@/data/banks";
import { POI_KINDS, type Poi } from "./format";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { PERSON_GEOMETRY } from "./people";

const MAX_BRANCHES = 24;

/** The ATM lobby, in one bank's colours. */
const lobby = (color: string, accent: string) =>
  merge([
    part(block(4.2, 0.14, 2.6, 0, 0.07, -0.3), "#C9C2B2"),
    // Walls in brand colour, glass front with a door.
    part(block(3.4, 3.0, 2.2, 0, 1.5, 1.1), color),
    part(block(3.0, 2.3, 0.05, 0, 1.25, -0.02), "#22313F", { glow: true }),
    part(block(0.08, 2.3, 0.08, 0.3, 1.25, -0.05), "#C9D0DC"),
    // ATM set into the front, screen lit.
    part(block(0.75, 1.5, 0.35, -0.95, 0.75, -0.2), "#9AA3AD"),
    part(block(0.5, 0.36, 0.03, -0.95, 1.22, -0.38), "#7FD1FF", { glow: true }),
    part(block(0.4, 0.06, 0.12, -0.95, 0.95, -0.42), "#3A3F4A"),
    // Canopy with the accent band, and the sign box.
    part(block(4.0, 0.18, 2.0, 0, 3.05, -0.4), color),
    part(block(4.02, 0.12, 2.02, 0, 2.92, -0.4), accent),
    part(block(3.2, 0.8, 0.14, 0, 3.6, -0.04), "#15171C"),
    // Lights under the canopy.
    ...[-1.2, 1.2].map((x) => part(block(0.6, 0.04, 0.3, x, 2.85, -0.9), "#FFF8E1", { glow: true })),
  ]);

/** The lit name board above the door. */
const signTexture = (bank: BankId) => {
  const b = BANKS[bank];
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = b.color;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = b.accent;
  ctx.fillRect(0, 112, 512, 16);
  ctx.fillStyle = b.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 74;
  const font = (px: number) => `800 ${px}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
  ctx.font = font(size);
  while (ctx.measureText(b.name.toUpperCase()).width > 470 && size > 20) ctx.font = font((size -= 2));
  ctx.fillText(b.name.toUpperCase(), 256, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

export interface Branch {
  bank: BankId;
  name: string;
  /** Where to stop: in front of the ATM. */
  x: number;
  z: number;
}

export class BankBranches {
  readonly group = new THREE.Group();
  readonly branches: Branch[] = [];
  readonly walls: number[] = [];
  private readonly material = createInstancedMaterial({ glowStrength: 1.6 });
  private readonly owned: { dispose(): void }[] = [];

  constructor(pois: Poi[]) {
    this.group.name = "banks";
    const bankKind = POI_KINDS.indexOf("bank");
    const sites = pois
      .filter((p) => p.k === bankKind && p.r)
      .map((p) => ({ p, bank: bankOf(p.n ?? p.b) }))
      .filter((s): s is { p: Poi; bank: BankId } => s.bank !== null)
      .sort((a, b) => Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z));
    const models = new Map<BankId, { geometry: THREE.BufferGeometry; sign: THREE.MeshBasicMaterial }>();
    const guards: { x: number; z: number; yaw: number }[] = [];
    const signGeometry = new THREE.PlaneGeometry(3.1, 0.72);
    this.owned.push(signGeometry);

    for (const { p, bank } of sites) {
      if (this.branches.length >= MAX_BRANCHES) break;
      const px = p.x / 10, pz = p.z / 10, cx = p.r![0] / 10, cz = p.r![1] / 10;
      let dx = px - cx, dz = pz - cz;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      // A couple of metres back from the kerb, toward the mapped branch.
      const x = cx + dx * Math.min(2, d), z = cz + dz * Math.min(2, d);
      if (this.branches.some((b) => Math.hypot(b.x - x, b.z - z) < 12)) continue;
      const yaw = Math.atan2(dx, dz);
      let model = models.get(bank);
      if (!model) {
        const sign = new THREE.MeshBasicMaterial({ map: signTexture(bank), toneMapped: false });
        model = { geometry: lobby(BANKS[bank].color, BANKS[bank].accent), sign };
        models.set(bank, model);
        this.owned.push(model.geometry, sign, sign.map!);
      }
      const g = new THREE.Group();
      g.add(new THREE.Mesh(model.geometry, this.material));
      const sign = new THREE.Mesh(signGeometry, model.sign);
      sign.position.set(0, 3.6, -0.12);
      sign.rotation.y = Math.PI;
      g.add(sign);
      g.position.set(x, 0, z);
      g.rotation.y = yaw;
      this.group.add(g);

      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
      this.walls.push(...at(-1.7, 0), ...at(1.7, 0), ...at(-1.7, 0), ...at(-1.7, 2.2), ...at(1.7, 0), ...at(1.7, 2.2));
      const [sx, sz] = at(-0.95, -2.2);
      this.branches.push({ bank, name: p.n ?? BANKS[bank].name, x: sx, z: sz });
      const [gx, gz] = at(1.2, -0.7);
      guards.push({ x: gx, z: gz, yaw });
    }

    if (guards.length) {
      const geometry = PERSON_GEOMETRY.man();
      const mesh = new THREE.InstancedMesh(geometry, this.material, guards.length);
      const dummy = new THREE.Object3D();
      guards.forEach((g, i) => {
        dummy.position.set(g.x, 0.14, g.z);
        dummy.rotation.set(0, g.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        setInstanceHex(mesh, i, "#2B3A55");
      });
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.owned.push(geometry);
    }
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
