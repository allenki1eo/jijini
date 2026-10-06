/**
 * The places a town is built around, from OpenStreetMap: schools with their
 * name board, the national flag and pupils in uniform at the gate; churches
 * with a bell tower and cross, mosques with a minaret and crescent, each
 * with its name board; football pitches with goals laid out along the
 * mapped pitch, basketball courts with hoops; and playgrounds with swings,
 * a slide and a seesaw. Children are out in the daytime only.
 *
 * Local frame for roadside pieces: −z faces the road.
 */
import * as THREE from "three";
import { env } from "@/game/systems/environment";
import { POI_KINDS, type Poi } from "./format";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { PERSON_GEOMETRY } from "./people";

const MAX_SCHOOLS = 24;
const MAX_WORSHIP = 24;
const MAX_PITCHES = 10;
const MAX_PLAYGROUNDS = 8;

/** Canvas-painted board, front face toward local −z. */
const board = (w: number, h: number, title: string, sub: string, bg: string, fg: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round((512 * h) / w);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = (px: number) => `800 ${px}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
  let size = canvas.height * 0.32;
  ctx.font = font(size);
  while (ctx.measureText(title).width > canvas.width * 0.88 && size > 14) ctx.font = font((size -= 2));
  ctx.fillText(title, canvas.width / 2, canvas.height * 0.42);
  ctx.font = `600 ${Math.round(canvas.height * 0.15)}px "Inter Variable", Inter, system-ui, sans-serif`;
  ctx.fillText(sub, canvas.width / 2, canvas.height * 0.76);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  mesh.rotation.y = Math.PI;
  return mesh;
};

/** The Tanzanian flag: green and blue triangles, a black diagonal edged in gold. */
let flagTexture: THREE.CanvasTexture | null = null;
const tanzaniaFlag = () => {
  if (flagTexture) return flagTexture;
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1EB53A";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(192, 0);
  ctx.lineTo(0, 128);
  ctx.fill();
  ctx.fillStyle = "#00A3DD";
  ctx.beginPath();
  ctx.moveTo(192, 0);
  ctx.lineTo(192, 128);
  ctx.lineTo(0, 128);
  ctx.fill();
  ctx.strokeStyle = "#FCD116";
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.moveTo(-10, 138);
  ctx.lineTo(202, -10);
  ctx.stroke();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 30;
  ctx.stroke();
  flagTexture = new THREE.CanvasTexture(c);
  flagTexture.colorSpace = THREE.SRGBColorSpace;
  return flagTexture;
};

const RELIGION = { christian: /kanisa|church|catholic|katoliki|lutheran|kkkt|anglican|pentecost|assembl|adventist|sabato|parish|parokia|cathedral|chapel|t\.?a\.?g|moravian|baptist|mennonite/i, muslim: /msikiti|mosque|masjid|jamia|jamii|islam/i };
const faithOf = (p: Poi): "christian" | "muslim" => (p.t === "muslim" || (p.t !== "christian" && RELIGION.muslim.test(p.n ?? "")) ? "muslim" : "christian");

/** A bell tower with a pitched cap and a cross (white walls, red roof). */
const bellTower = () =>
  merge([
    part(block(2.8, 0.4, 2.8, 0, 0.2, 0), "#C9C2B2"),
    part(block(2.4, 8, 2.4, 0, 4.4, 0), "#F7F3EA"),
    ...[0, 1, 2, 3].map((i) => part(block(0.7, 1.3, 0.1, 0, 6.6, 1.22).rotateY((i * Math.PI) / 2), "#3A3F4A")),
    part(new THREE.ConeGeometry(2.0, 2.4, 4).rotateY(Math.PI / 4).translate(0, 9.6, 0), "#B5452B"),
    part(block(0.16, 1.6, 0.16, 0, 11.6, 0), "#F2C94C", { glow: true }),
    part(block(0.9, 0.16, 0.16, 0, 11.9, 0), "#F2C94C", { glow: true }),
  ]);

/** A minaret: white shaft, green bands, a balcony ring, a dome and a crescent. */
const minaret = () =>
  merge([
    part(new THREE.CylinderGeometry(1.2, 1.3, 0.5, 16).translate(0, 0.25, 0), "#C9C2B2"),
    part(new THREE.CylinderGeometry(0.75, 0.9, 11, 12).translate(0, 6, 0), "#F7F3EA"),
    ...[3.5, 7.5].map((y) => part(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12).translate(0, y, 0), "#0B6E4F")),
    part(new THREE.CylinderGeometry(1.25, 1.1, 0.35, 16).translate(0, 11.3, 0), "#E9E4D8"),
    part(new THREE.CylinderGeometry(0.6, 0.7, 1.8, 12).translate(0, 12.4, 0), "#F7F3EA"),
    part(new THREE.SphereGeometry(0.75, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 13.3, 0), "#0B6E4F"),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6).translate(0, 14.4, 0), "#F2C94C"),
    part(new THREE.TorusGeometry(0.3, 0.07, 6, 16, Math.PI * 1.4).rotateZ(-0.4).translate(0, 15.0, 0), "#F2C94C", { glow: true }),
  ]);

/** School gate: two pillars and a crossbar; the name board hangs on it. */
const schoolGate = () =>
  merge([
    ...[-2.6, 2.6].map((x) => part(block(0.5, 2.8, 0.5, x, 1.4, 0), "#E9E4D8")),
    ...[-2.6, 2.6].map((x) => part(block(0.6, 0.2, 0.6, x, 2.9, 0), "#2563EB")),
    // Low walls either side.
    ...[-5.8, 5.8].map((x) => part(block(6, 1.3, 0.25, x, 0.65, 0.1), "#E9E4D8")),
    ...[-5.8, 5.8].map((x) => part(block(6, 0.12, 0.3, x, 1.36, 0.1), "#2563EB")),
    // Flagpole.
    part(new THREE.CylinderGeometry(0.05, 0.07, 7.5, 8).translate(4.2, 3.75, 1.5), "#D8D8D8"),
    part(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 10).translate(4.2, 0.15, 1.5), "#C9C2B2"),
  ]);

/** Football goal (two posts and a bar), centred on local x, facing ±z. */
const goal = (w: number, h: number) =>
  merge([
    ...[-w / 2, w / 2].map((x) => part(new THREE.CylinderGeometry(0.06, 0.06, h, 6).translate(x, h / 2, 0), "#F4F6F8")),
    part(new THREE.CylinderGeometry(0.06, 0.06, w, 6).rotateZ(Math.PI / 2).translate(0, h, 0), "#F4F6F8"),
    part(block(w, 0.03, 1.2, 0, 0.02, 0.6), "#E9ECF0"),
  ]);

/** Basketball hoop on a pole, the board facing local −z. */
const hoop = () =>
  merge([
    part(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8).translate(0, 1.7, 0.6), "#4B5563"),
    part(block(1.8, 1.05, 0.06, 0, 3.4, 0.3), "#F4F6F8"),
    part(new THREE.TorusGeometry(0.23, 0.025, 6, 16).rotateX(Math.PI / 2).translate(0, 3.05, 0), "#F37021"),
  ]);

const playset = () =>
  merge([
    // Swing frame with two swings.
    ...[-1.6, 1.6].flatMap((x) => [part(block(0.1, 2.6, 0.1, x, 1.3, -0.7).rotateX(0), "#1E5AA8"), part(block(0.1, 2.6, 0.1, x, 1.3, 0.7), "#1E5AA8")]),
    part(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6).rotateZ(Math.PI / 2).translate(0, 2.6, 0), "#1E5AA8"),
    ...[-0.7, 0.7].flatMap((x) => [part(block(0.02, 1.9, 0.02, x - 0.2, 1.65, 0), "#9AA3AD"), part(block(0.02, 1.9, 0.02, x + 0.2, 1.65, 0), "#9AA3AD"), part(block(0.5, 0.05, 0.2, x, 0.7, 0), "#D7261E")]),
    // Slide.
    part(block(0.9, 0.08, 3.2, 4, 1.0, 0).rotateX(0), "#FFC72C"),
    part(block(0.9, 0.08, 3.4, 0, 0, 0).rotateX(0.55).translate(4, 1.0, 0.2), "#FFC72C"),
    part(block(0.9, 1.8, 0.9, 4, 0.9, -1.6), "#2E9E5B"),
    // Seesaw.
    part(block(0.3, 0.45, 0.3, -4, 0.22, 0), "#4B5563"),
    part(block(0.3, 0.06, 3.4, -4, 0.48, 0).rotateX(0), "#E0457B"),
  ]);

export class Civic {
  readonly group = new THREE.Group();
  readonly walls: number[] = [];
  /** Places the shop rows and other props should leave clear. */
  readonly keepOut: { x: number; z: number; r: number }[] = [];
  private readonly material = createInstancedMaterial({ glowStrength: 1.4 });
  private readonly owned: { dispose(): void }[] = [];
  private readonly kids: THREE.InstancedMesh | null = null;
  private checkTimer = 0;

  constructor(pois: Poi[]) {
    this.group.name = "civic";
    const kind = (k: string) => POI_KINDS.indexOf(k as (typeof POI_KINDS)[number]);
    const byDistance = (a: Poi, b: Poi) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
    const kidSpots: { x: number; z: number; yaw: number }[] = [];
    const geometries = new Map<string, THREE.BufferGeometry>();
    const shared = (key: string, make: () => THREE.BufferGeometry) => {
      let g = geometries.get(key);
      if (!g) {
        g = make();
        geometries.set(key, g);
        this.owned.push(g);
      }
      return g;
    };

    /** Roadside frame: at the kerb point, facing the road, `back` metres toward the place. */
    const roadside = (p: Poi, back: number) => {
      const px = p.x / 10, pz = p.z / 10;
      const cx = p.r ? p.r[0] / 10 : px, cz = p.r ? p.r[1] / 10 : pz;
      let dx = px - cx, dz = pz - cz;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        dx = 0;
        dz = 1;
      } else {
        dx /= d;
        dz /= d;
      }
      const step = Math.min(back, Math.max(0, d - 1));
      return { x: cx + dx * step, z: cz + dz * step, yaw: Math.atan2(dx, dz) };
    };
    const put = (obj: THREE.Object3D, x: number, z: number, yaw: number) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = yaw;
      this.group.add(obj);
    };
    const toWorld = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

    // Schools.
    for (const p of pois.filter((q) => q.k === kind("school")).sort(byDistance).slice(0, MAX_SCHOOLS)) {
      const at = roadside(p, 2.5);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shared("gate", schoolGate), this.material));
      const name = (p.n ?? "Shule ya Msingi").toUpperCase();
      const sign = board(5, 1.1, name, "ELIMU NI UFUNGUO WA MAISHA", "#1E3A8A", "#FFFFFF");
      sign.position.set(0, 3.55, -0.1);
      g.add(sign);
      this.owned.push(sign.geometry, sign.material as THREE.Material, (sign.material as THREE.MeshBasicMaterial).map!);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshBasicMaterial({ map: tanzaniaFlag(), side: THREE.DoubleSide }));
      flag.position.set(4.2 + 0.78, 6.9, 1.5);
      g.add(flag);
      this.owned.push(flag.geometry, flag.material as THREE.Material);
      put(g, at.x, at.z, at.yaw);
      this.walls.push(...toWorld(at.x, at.z, at.yaw, -8.8, 0.1), ...toWorld(at.x, at.z, at.yaw, -2.9, 0.1), ...toWorld(at.x, at.z, at.yaw, 2.9, 0.1), ...toWorld(at.x, at.z, at.yaw, 8.8, 0.1));
      for (let i = 0; i < 6; i++) {
        const [kx, kz] = toWorld(at.x, at.z, at.yaw, (i - 2.5) * 0.9, 2.2 + (i % 2) * 0.8);
        kidSpots.push({ x: kx, z: kz, yaw: at.yaw + Math.PI + (i % 3) * 0.3 });
      }
      this.keepOut.push({ x: at.x, z: at.z, r: 10 });
    }

    // Churches and mosques.
    for (const p of pois.filter((q) => q.k === kind("place_of_worship")).sort(byDistance).slice(0, MAX_WORSHIP)) {
      const faith = faithOf(p);
      const at = roadside(p, 4);
      const g = new THREE.Group();
      const tower = new THREE.Mesh(shared(faith, faith === "muslim" ? minaret : bellTower), this.material);
      tower.position.set(3.4, 0, 1.2);
      g.add(tower);
      const name = (p.n ?? (faith === "muslim" ? "Msikiti" : "Kanisa")).toUpperCase();
      const sign = board(3.6, 1.1, name, faith === "muslim" ? "KARIBUNI KWA SALA" : "KARIBUNI KWA IBADA", faith === "muslim" ? "#0B6E4F" : "#5B2A86", "#FFFFFF");
      sign.position.set(-1.2, 1.9, 0);
      g.add(sign);
      const legs = new THREE.Mesh(shared("sign-legs", () => merge([-2.9, 0.5].map((x) => part(block(0.12, 2.5, 0.12, x, 1.25, 0.05), "#4B5563")))), this.material);
      g.add(legs);
      this.owned.push(sign.geometry, sign.material as THREE.Material, (sign.material as THREE.MeshBasicMaterial).map!);
      put(g, at.x, at.z, at.yaw);
      const [tx, tz] = toWorld(at.x, at.z, at.yaw, 3.4, 1.2);
      const r = faith === "muslim" ? 1 : 1.3;
      this.walls.push(tx - r, tz - r, tx + r, tz - r, tx + r, tz - r, tx + r, tz + r, tx + r, tz + r, tx - r, tz + r, tx - r, tz + r, tx - r, tz - r);
      this.keepOut.push({ x: tx, z: tz, r: 8 });
    }

    // Pitches: goals (or hoops) along the mapped pitch, kids playing in the daytime.
    for (const p of pois.filter((q) => q.k === kind("pitch")).sort(byDistance).slice(0, MAX_PITCHES)) {
      const x = p.x / 10, z = p.z / 10;
      const yaw = ((p.a ?? 0) * Math.PI) / 180;
      const [w, l] = p.s ?? [30, 50];
      if (l < 12 || l > 140) continue;
      const basketball = p.t === "basketball";
      const half = l / 2 - (basketball ? 1.4 : 0.6);
      for (const end of [-1, 1]) {
        const mesh = new THREE.Mesh(basketball ? shared("hoop", hoop) : shared(l > 60 ? "goal-full" : "goal-small", () => (l > 60 ? goal(7.3, 2.44) : goal(3.6, 1.8))), this.material);
        const [gx, gz] = toWorld(x, z, yaw, 0, end * half);
        put(mesh, gx, gz, yaw + (end > 0 ? 0 : Math.PI));
      }
      const players = basketball ? 6 : Math.min(14, Math.round(l / 6));
      for (let i = 0; i < players; i++) {
        const u = ((i * 0.618) % 1) - 0.5, v = ((i * 0.381 + 0.2) % 1) - 0.5;
        const [kx, kz] = toWorld(x, z, yaw, u * w * 0.7, v * l * 0.7);
        kidSpots.push({ x: kx, z: kz, yaw: yaw + i * 1.7 });
      }
      this.keepOut.push({ x, z, r: l / 2 });
    }

    // Playgrounds.
    for (const p of pois.filter((q) => q.k === kind("playground")).sort(byDistance).slice(0, MAX_PLAYGROUNDS)) {
      const x = p.x / 10, z = p.z / 10;
      put(new THREE.Mesh(shared("playset", playset), this.material), x, z, 0);
      for (let i = 0; i < 5; i++) kidSpots.push({ x: x + (i - 2) * 1.6, z: z + 2.2 + (i % 2), yaw: i * 1.3 });
      this.keepOut.push({ x, z, r: 8 });
    }

    if (kidSpots.length) {
      const geometry = PERSON_GEOMETRY.kid();
      const kids = new THREE.InstancedMesh(geometry, this.material, kidSpots.length);
      const dummy = new THREE.Object3D();
      // School uniforms: white or light-blue shirts, with the odd green or maroon jumper.
      const UNIFORMS = ["#FFFFFF", "#CFE3F7", "#FFFFFF", "#2E7D32", "#8B1E3F", "#FFFFFF"];
      kidSpots.forEach((k, i) => {
        dummy.position.set(k.x, 0, k.z);
        dummy.rotation.set(0, k.yaw, 0);
        dummy.updateMatrix();
        kids.setMatrixAt(i, dummy.matrix);
        setInstanceHex(kids, i, UNIFORMS[i % UNIFORMS.length]!);
      });
      kids.frustumCulled = false;
      this.group.add(kids);
      this.owned.push(geometry);
      this.kids = kids;
      this.kids.visible = this.daytime();
    }
  }

  /** Children are about from 7 in the morning until 6 in the evening. */
  private daytime() {
    return env.hour >= 7 && env.hour < 18;
  }

  update(dt: number) {
    this.checkTimer -= dt;
    if (this.checkTimer > 0 || !this.kids) return;
    this.checkTimer = 2;
    this.kids.visible = this.daytime();
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
