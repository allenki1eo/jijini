/**
 * Street frontage: the rows of dukas the bake lays along streets where the
 * map has no buildings. Each shop has painted walls, a shutter-framed
 * opening with a lit interior, an awning, its trade's goods out front
 * (crates and sacks, phones and a wakala counter, a barber's chair, iron
 * sheets and pipes, clothes racks, plastic tables), a signboard with its
 * name, upper storeys with windows and balconies, and often the shopkeeper
 * at the door. All instanced: a few draw calls for the whole town.
 *
 * Local frame: the front face is at z = 0 facing −z (the road); the body runs back along +z.
 */
import * as THREE from "three";
import { FRONTAGE_STRIDE, SHOP_KINDS, type FrontageFile, type ShopKind } from "./format";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { CLOTHES, PERSON_GEOMETRY } from "./people";

/** Shop fronts are modelled 5 m wide and stretched to each shop's width. */
const BASE_W = 5;
const STOREY = 3.2;
const GROUND = 3.4;

/** Wall colours of Tanzanian shop rows: limewash, telecom brights, pastel and earth. */
const WALLS = ["#F4EFE2", "#F2C94C", "#7FD1AE", "#E57373", "#4FC3F7", "#F48FB1", "#FFB74D", "#C5E1A5", "#E0E0E0", "#B39DDB", "#D7A86E", "#80CBC4"];

/** Awning and sign colours per trade. */
const TRADE: Record<ShopKind, { awning: string[]; sign: string; text: string; label: string }> = {
  duka: { awning: ["#D7261E", "#1E5AA8", "#2E9E5B", "#F2994A"], sign: "#1F3A63", text: "#FFFFFF", label: "DUKA" },
  phone: { awning: ["#2E9E5B", "#D7261E", "#1E5AA8"], sign: "#0B6E4F", text: "#FFC72C", label: "WAKALA · SIMU" },
  salon: { awning: ["#E0457B", "#7C3AED"], sign: "#E0457B", text: "#FFFFFF", label: "SALUNI" },
  pharmacy: { awning: ["#2E9E5B", "#FFFFFF"], sign: "#FFFFFF", text: "#0B6E4F", label: "DUKA LA DAWA" },
  hardware: { awning: ["#F37021", "#4B5563"], sign: "#F37021", text: "#10131A", label: "HARDWARE" },
  clothes: { awning: ["#7C3AED", "#00A3DD", "#E0457B"], sign: "#6A1B9A", text: "#FFFFFF", label: "NGUO · VIATU" },
  food: { awning: ["#FFC72C", "#D7261E"], sign: "#FFC72C", text: "#10131A", label: "CHAKULA" },
};

const crate = (x: number, y: number, z: number, c: string) => [part(block(0.42, 0.3, 0.32, x, y + 0.15, z), c), ...[-0.1, 0.1].map((o) => part(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6).translate(x + o, y + 0.4, z), "#2B2B2B"))];
const sack = (x: number, z: number, c = "#E9E1CF") => part(new THREE.CapsuleGeometry(0.22, 0.25, 3, 8).translate(x, 0.38, z), c);
const chair = (x: number, z: number, c: string) => [part(block(0.42, 0.05, 0.42, x, 0.45, z), c), part(block(0.42, 0.45, 0.05, x, 0.7, z + 0.19), c), ...[-0.18, 0.18].flatMap((dx) => [-0.18, 0.18].map((dz) => part(block(0.04, 0.45, 0.04, x + dx, 0.22, z + dz), c)))];

/** Goods and furniture out front, per trade (z < 0 is the pavement). */
const GOODS: Record<ShopKind, () => THREE.BufferGeometry[]> = {
  duka: () => [
    ...crate(-1.9, 0, -0.45, "#D7261E"),
    ...crate(-1.9, 0.3, -0.45, "#FFC72C"),
    ...crate(-1.4, 0, -0.45, "#1E5AA8"),
    sack(1.6, -0.5),
    sack(2.05, -0.45, "#D9C9A8"),
    part(block(0.7, 1.7, 0.6, 1.4, 0.85, -0.4), "#F4F6F8"),
    part(block(0.6, 1.3, 0.02, 1.4, 1.0, -0.71), "#BFE6FF", { glow: true }),
    ...[-0.6, -0.2, 0.2, 0.6].map((x, i) => part(block(0.18, 0.28, 0.04, x, 2.2, -0.06), ["#F2994A", "#2E9E5B", "#D7261E", "#FFC72C"][i]!)),
  ],
  phone: () => [
    part(block(2.2, 1.0, 0.6, 0, 0.5, -0.35), "#2E9E5B"),
    part(block(2.2, 0.06, 0.66, 0, 1.03, -0.35), "#F4F6F8"),
    ...[-0.7, -0.35, 0, 0.35, 0.7].map((x) => part(block(0.16, 0.26, 0.03, x, 1.2, -0.45), "#15171C", { glow: true })),
    part(block(1.2, 0.5, 0.05, -1.9, 1.7, -0.06), "#FFC72C"),
    ...chair(1.8, -0.7, "#D7261E"),
  ],
  salon: () => [
    part(block(1.1, 1.3, 0.04, -0.9, 1.5, -0.08), "#BFE6FF", { glow: true }),
    part(block(0.55, 0.12, 0.55, -0.9, 0.55, -0.55), "#15171C"),
    part(block(0.55, 0.6, 0.1, -0.9, 0.9, -0.3), "#15171C"),
    part(new THREE.CylinderGeometry(0.05, 0.12, 0.5, 8).translate(-0.9, 0.25, -0.55), "#9AA3AD"),
    part(block(0.7, 0.9, 0.05, 1.5, 1.6, -0.06), "#F48FB1"),
    ...chair(1.9, -0.7, "#4B5563"),
  ],
  pharmacy: () => [
    part(block(2.4, 1.0, 0.5, 0, 0.5, -0.35), "#F4F6F8"),
    part(block(0.75, 0.24, 0.06, 1.8, 2.2, -0.08), "#2EE27A", { glow: true }),
    part(block(0.24, 0.75, 0.06, 1.8, 2.2, -0.08), "#2EE27A", { glow: true }),
    ...[-0.8, -0.3, 0.2, 0.7].map((x) => part(block(0.35, 0.5, 0.05, x, 1.7, -0.07), "#BDE0C9")),
  ],
  hardware: () => [
    ...[0, 1, 2].map((i) => part(block(0.9, 2.2, 0.03, -1.9 + i * 0.12, 1.1, -0.2 - i * 0.05).rotateX(-0.12), "#AEB4BC")),
    ...[0, 1, 2, 3].map((i) => part(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).rotateX(-0.25).translate(1.4 + i * 0.12, 1.15, -0.3), i % 2 ? "#1E5AA8" : "#E9ECF0")),
    ...[0, 1].map((i) => part(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 10).translate(0.4 + i * 0.45, 0.15, -0.55), ["#F2994A", "#2E9E5B"][i]!)),
    part(block(0.5, 0.5, 0.5, -0.4, 0.25, -0.5), "#B9BCC2"),
  ],
  clothes: () => [
    ...[-1.6, 1.6].flatMap((x) => [
      part(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6).translate(x - 0.6, 0.9, -0.5), "#4B5563"),
      part(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6).translate(x + 0.6, 0.9, -0.5), "#4B5563"),
      part(block(1.3, 0.03, 0.03, x, 1.78, -0.5), "#4B5563"),
      ...[-0.45, -0.15, 0.15, 0.45].map((o, i) => part(block(0.26, 0.75, 0.06, x + o, 1.35, -0.5), ["#1F4E8C", "#E0457B", "#F4F1EA", "#2E9E5B"][(i + (x > 0 ? 2 : 0)) % 4]!)),
    ]),
    part(new THREE.CapsuleGeometry(0.16, 0.7, 3, 8).translate(0, 1.0, -0.35), "#C62828"),
  ],
  food: () => [
    ...[-1.3, 1.3].flatMap((x) => [
      part(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14).translate(x, 0.72, -1.0), x < 0 ? "#F4F6F8" : "#D7261E"),
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6).translate(x, 0.36, -1.0), "#B9BCC2"),
      ...chair(x - 0.55, -1.0, x < 0 ? "#1E5AA8" : "#F4F6F8"),
      ...chair(x + 0.55, -1.0, x < 0 ? "#1E5AA8" : "#F4F6F8"),
    ]),
    part(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 10).translate(0, 0.18, -0.4), "#3A3F4A"),
    part(new THREE.SphereGeometry(0.12, 6, 4).translate(0, 0.42, -0.4), "#FF6A1F", { glow: true }),
    part(new THREE.CylinderGeometry(0.24, 0.2, 0.2, 12).translate(0, 0.5, -0.4), "#C9D0DC"),
  ],
};

/** Ground-floor storefront for a trade; the tinted parts take the awning colour. */
const storefront = (kind: ShopKind) =>
  merge([
    // Pavement slab and step.
    part(block(BASE_W, 0.14, 2.6, 0, 0.07, -1.3), "#B9B4A8"),
    // Opening: pillars, header, dark interior with a lit back wall.
    ...[-2.35, 2.35].map((x) => part(block(0.3, GROUND - 0.4, 0.2, x, (GROUND - 0.4) / 2, -0.1), "#E9E4D8")),
    part(block(BASE_W, 0.35, 0.22, 0, GROUND - 0.55, -0.11), "#5A5F6A"),
    part(block(4.4, GROUND - 0.75, 0.04, 0, (GROUND - 0.75) / 2, -0.03), "#2B2420"),
    part(block(4.0, 0.08, 0.04, 0, GROUND - 0.85, -0.06), "#FFF1C1", { glow: true }),
    // Rolled-up shutter.
    part(new THREE.CylinderGeometry(0.16, 0.16, 4.5, 10).rotateZ(Math.PI / 2).translate(0, GROUND - 0.3, -0.28), "#9AA3AD"),
    // Awning on two poles.
    // Tilted down toward the road (built at the origin, then moved, so the tilt pivots on its own centre).
    part(block(BASE_W + 0.2, 0.06, 1.6).rotateX(-0.18).translate(0, GROUND - 0.6, -0.85), "#FFFFFF", { tint: true }),
    ...[-2.4, 2.4].map((x) => part(new THREE.CylinderGeometry(0.035, 0.035, GROUND - 0.75, 6).translate(x, (GROUND - 0.75) / 2, -1.6), "#4B5563")),
    // Signboard frame on the parapet.
    part(block(BASE_W * 0.94, 0.78, 0.1, 0, GROUND + 0.2, -0.06), "#15171C"),
    ...GOODS[kind](),
  ]);

/** One upper storey's front: two windows, a balcony slab and railing. */
const upperFront = () =>
  merge([
    ...[-1.2, 1.2].flatMap((x) => [part(block(1.3, 1.4, 0.06, x, 1.6, -0.03), "#33414D", { glow: true }), part(block(1.5, 0.12, 0.12, x, 0.84, -0.08), "#E9E4D8")]),
    part(block(BASE_W, 0.12, 0.9, 0, 0.12, -0.45), "#D8D2C4"),
    part(block(BASE_W, 0.06, 0.06, 0, 1.0, -0.88), "#4B5563"),
    ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => part(block(0.05, 0.9, 0.05, x, 0.55, -0.88), "#4B5563")),
  ]);

interface Shop {
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  floors: number;
  kind: ShopKind;
  wall: string;
  sign: number;
}

export class Frontage {
  readonly group = new THREE.Group();
  /** Collision segments (shop fronts and sides), flat [x1, z1, x2, z2, ...]. */
  readonly walls: number[] = [];
  readonly count: number;
  private readonly material = createInstancedMaterial({ glowStrength: 1.4 });
  private readonly owned: { dispose(): void }[] = [];

  /** `keepOut`: circles (landmarks, petrol stations, the kijiwe) the shops must leave clear. */
  constructor(data: FrontageFile, keepOut: { x: number; z: number; r: number }[]) {
    this.group.name = "frontage";
    const shops: Shop[] = [];
    for (let i = 0; i + FRONTAGE_STRIDE <= data.shops.length; i += FRONTAGE_STRIDE) {
      const [x, z, yaw, w, d, floors, kind, wall, sign] = data.shops.slice(i, i + FRONTAGE_STRIDE) as number[];
      const shop: Shop = { x: x! / 10, z: z! / 10, yaw: yaw! / 1000, w: w! / 10, d: d! / 10, floors: Math.max(1, Math.min(3, floors!)), kind: SHOP_KINDS[kind!] ?? "duka", wall: WALLS[wall! % WALLS.length]!, sign: sign! };
      // Centre of the footprint, for the keep-out test.
      const fx = Math.sin(shop.yaw), fz = Math.cos(shop.yaw);
      const cx = shop.x + fx * shop.d * 0.5, cz = shop.z + fz * shop.d * 0.5;
      if (keepOut.some((k) => Math.hypot(k.x - cx, k.z - cz) < k.r + shop.w / 2)) continue;
      shops.push(shop);
    }
    this.count = shops.length;
    if (!shops.length) return;

    const dummy = new THREE.Object3D();
    const place = (mesh: THREE.InstancedMesh, i: number, s: Shop, sx: number, sy: number, sz: number, y = 0) => {
      dummy.position.set(s.x, y, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    const instanced = (geometry: THREE.BufferGeometry, n: number) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, n);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.owned.push(geometry);
      return mesh;
    };

    // Bodies: a unit box (front face at z = 0) stretched to each shop, in its wall colour.
    const bodies = instanced(part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5), "#FFFFFF", { tint: true }), shops.length);
    shops.forEach((s, i) => {
      place(bodies, i, s, s.w, GROUND + 0.6 + (s.floors - 1) * STOREY, s.d);
      setInstanceHex(bodies, i, s.wall);
    });

    // Storefronts, one instanced mesh per trade, tinted with the awning colour.
    for (const kind of SHOP_KINDS) {
      const mine = shops.filter((s) => s.kind === kind);
      if (!mine.length) continue;
      const mesh = instanced(storefront(kind), mine.length);
      const awnings = TRADE[kind].awning;
      mine.forEach((s, i) => {
        place(mesh, i, s, s.w / BASE_W, 1, 1);
        setInstanceHex(mesh, i, awnings[(s.sign + i) % awnings.length]!);
      });
    }

    // Upper storeys.
    const uppers = shops.flatMap((s) => Array.from({ length: s.floors - 1 }, (_, k) => ({ s, y: GROUND + 0.6 + k * STOREY })));
    if (uppers.length) {
      const mesh = instanced(upperFront(), uppers.length);
      uppers.forEach(({ s, y }, i) => place(mesh, i, s, s.w / BASE_W, 1, 1, y - 0.6));
    }

    // Shopkeepers at the door of most shops.
    const keepers = shops.filter((_, i) => i % 3 !== 2);
    if (keepers.length) {
      const mesh = instanced(PERSON_GEOMETRY.man(), keepers.length);
      keepers.forEach((s, i) => {
        const side = ((i % 5) - 2) * 0.35;
        dummy.position.set(s.x - Math.sin(s.yaw) * 0.9 + Math.cos(s.yaw) * side, 0.14, s.z - Math.cos(s.yaw) * 0.9 - Math.sin(s.yaw) * side);
        dummy.rotation.set(0, s.yaw + (i % 2 ? 0.4 : -0.3), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        setInstanceHex(mesh, i, CLOTHES.man[i % CLOTHES.man.length]!);
      });
    }

    this.buildSigns(shops, data.signs);

    // Shop fronts and sides are solid; the pavement in front is open.
    for (const s of shops) {
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const at = (lx: number, lz: number): [number, number] => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
      const hw = s.w / 2;
      this.walls.push(...at(-hw, 0.1), ...at(hw, 0.1), ...at(-hw, 0.1), ...at(-hw, s.d), ...at(hw, 0.1), ...at(hw, s.d));
    }
  }

  /** Every signboard in one mesh, drawn from a canvas atlas of names. */
  private buildSigns(shops: Shop[], texts: string[]) {
    const COLS = 4, ROWS = 16, CW = 512, CH = 112;
    const canvas = document.createElement("canvas");
    canvas.width = COLS * CW;
    canvas.height = ROWS * CH;
    const ctx = canvas.getContext("2d")!;
    // Each atlas cell is a (text, trade) pair; the first COLS×ROWS distinct ones get their own cell.
    const cells = new Map<string, number>();
    const cellFor = (s: Shop) => {
      const key = `${s.sign}|${s.kind}`;
      let cell = cells.get(key);
      if (cell !== undefined) return cell;
      if (cells.size >= COLS * ROWS) return [...cells.entries()].find(([k]) => k.endsWith(`|${s.kind}`))?.[1] ?? 0;
      cell = cells.size;
      cells.set(key, cell);
      const trade = TRADE[s.kind];
      const x0 = (cell % COLS) * CW, y0 = Math.floor(cell / COLS) * CH;
      ctx.fillStyle = trade.sign;
      ctx.fillRect(x0, y0, CW, CH);
      ctx.fillStyle = trade.text;
      ctx.fillRect(x0, y0 + CH - 10, CW, 4);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const title = (texts[s.sign] ?? trade.label).toUpperCase();
      let size = 54;
      const font = (px: number) => `800 ${px}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
      ctx.font = font(size);
      while (ctx.measureText(title).width > CW * 0.92 && size > 18) ctx.font = font((size -= 2));
      ctx.fillText(title, x0 + CW / 2, y0 + CH * 0.42);
      ctx.globalAlpha = 0.8;
      ctx.font = `700 20px "Inter Variable", Inter, system-ui, sans-serif`;
      ctx.fillText(trade.label, x0 + CW / 2, y0 + CH * 0.8);
      ctx.globalAlpha = 1;
      return cell;
    };

    const positions: number[] = [], uvs: number[] = [], index: number[] = [];
    shops.forEach((s) => {
      const cell = cellFor(s);
      const u0 = (cell % COLS) / COLS, u1 = u0 + 1 / COLS;
      const v1 = 1 - Math.floor(cell / COLS) / ROWS, v0 = v1 - 1 / ROWS;
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const hw = (s.w * 0.94) / 2 - 0.05;
      const z = -0.14, y0 = GROUND - 0.15, y1 = GROUND + 0.55;
      // Seen from the road the shop's local +x is on the viewer's left, so the text runs from +x to −x.
      const corners: [number, number, number, number][] = [
        [hw, y0, u0, v0],
        [-hw, y0, u1, v0],
        [-hw, y1, u1, v1],
        [hw, y1, u0, v1],
      ];
      const base = positions.length / 3;
      for (const [lx, y, u, v] of corners) {
        positions.push(s.x + lx * c + z * sn, y, s.z - lx * sn + z * c);
        uvs.push(u, v);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.owned.push(geometry, material, texture);
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
