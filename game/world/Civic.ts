/**
 * The places a town is built around, from OpenStreetMap: schools with their
 * name board, the national flag and pupils in uniform at the gate; churches
 * with a bell tower and cross, mosques with a minaret and crescent, each
 * with its name board; football pitches with goals laid out along the
 * mapped pitch, basketball courts with hoops; and playgrounds with swings,
 * a slide and a seesaw. Children are out in the daytime only; in the rain
 * pupils put up umbrellas and the ones out playing go home.
 *
 * Everything is checked against the whole road network: a school's walls
 * stop short of any road, and nobody stands on the carriageway.
 *
 * Local frame for roadside pieces: −z faces the road.
 */
import * as THREE from "three";
import { env } from "@/game/systems/environment";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { POI_KINDS, type Poi } from "./format";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { CrowdUmbrellas, PERSON_GEOMETRY } from "./people";
import { roadClearance } from "./roadClearance";

const MAX_SCHOOLS = 24;
const MAX_WORSHIP = 24;
const MAX_PITCHES = 10;
const MAX_PLAYGROUNDS = 8;
/** Gap kept between anything we build and the road edge (m). */
const VERGE = 1.2;
/** People stand at least this far from the road edge (m). */
const PEOPLE_VERGE = 1.6;
/** A school's boundary wall runs up to this far either side of the gate. */
const WING = 6;

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
    // Flagpole.
    part(new THREE.CylinderGeometry(0.05, 0.07, 7.5, 8).translate(4.2, 3.75, 1.5), "#D8D8D8"),
    part(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 10).translate(4.2, 0.15, 1.5), "#C9C2B2"),
  ]);

/** One metre of low boundary wall with its blue coping, centred on x; stretched to length per school. */
const wallRun = () => merge([part(block(1, 1.3, 0.25, 0, 0.65, 0.1), "#E9E4D8"), part(block(1, 0.12, 0.3, 0, 1.36, 0.1), "#2563EB")]);

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
  /** Pupils at the school gates, and children out playing on pitches and playgrounds. */
  private readonly pupils: THREE.InstancedMesh | null = null;
  private readonly players: THREE.InstancedMesh | null = null;
  private readonly umbrellas: CrowdUmbrellas | null = null;
  private checkTimer = 0;

  constructor(pois: Poi[], nav: NavNetwork) {
    this.group.name = "civic";
    const clear = roadClearance(nav);
    const kind = (k: string) => POI_KINDS.indexOf(k as (typeof POI_KINDS)[number]);
    const byDistance = (a: Poi, b: Poi) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
    type Spot = { x: number; z: number; yaw: number };
    const pupilSpots: Spot[] = [];
    const playerSpots: Spot[] = [];
    /** Only where a person is safely off the carriageway. */
    const stand = (list: Spot[], s: Spot) => {
      if (clear(s.x, s.z) >= PEOPLE_VERGE) list.push(s);
    };
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
    const put = (obj: THREE.Object3D, x: number, z: number, yaw: number) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = yaw;
      this.group.add(obj);
    };
    const toWorld = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

    /**
     * A roadside frame for a mapped place: `back` metres past the edge of its
     * nearest road, facing it (local −z toward the road). The local points in
     * `needs` ([x, z, margin]) must all be at least `margin` from every road;
     * if not, step further back a couple of times, then give up (null).
     */
    const frontOf = (p: Poi, back: number, needs: [number, number, number][]) => {
      const px = p.x / 10, pz = p.z / 10;
      const n = clear.nearest(px, pz);
      if (!n) return null;
      let dx = px - n.x, dz = pz - n.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        dx /= d;
        dz /= d;
      } else {
        // Mapped on the road itself: use the side with more room.
        const probe = n.half + back + 3;
        const left = clear(n.x + n.dz * probe, n.z - n.dx * probe) >= clear(n.x - n.dz * probe, n.z + n.dx * probe);
        dx = left ? n.dz : -n.dz;
        dz = left ? -n.dx : n.dx;
      }
      const yaw = Math.atan2(dx, dz);
      for (const extra of [0, 1.5, 3, 5]) {
        const off = n.half + back + extra;
        const x = n.x + dx * off, z = n.z + dz * off;
        if (needs.every(([lx, lz, margin]) => clear(...toWorld(x, z, yaw, lx, lz)) >= margin)) return { x, z, yaw };
      }
      return null;
    };

    // Schools: the gate on the verge, boundary walls either side that stop short of any road.
    const schools = pois.filter((q) => q.k === kind("school")).sort(byDistance);
    let placedSchools = 0;
    for (const p of schools) {
      if (placedSchools >= MAX_SCHOOLS) break;
      const at = frontOf(p, 1.8, [
        [-2.9, 0, VERGE],
        [2.9, 0, VERGE],
        [0, 0, VERGE + 0.4],
        [4.2, 1.5, VERGE],
      ]);
      if (!at || this.keepOut.some((k) => Math.hypot(k.x - at.x, k.z - at.z) < 14)) continue;
      placedSchools++;
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
      // Each wing runs out from the gate pillar until it would come within a verge of a road (a side street, a bend).
      for (const side of [-1, 1]) {
        let len = 0;
        for (let l = 0.5; l <= WING; l += 0.5) {
          const [wx, wz] = toWorld(at.x, at.z, at.yaw, side * (2.85 + l), 0.1);
          if (clear(wx, wz) < VERGE) break;
          len = l;
        }
        if (len < 1) continue;
        const wing = new THREE.Mesh(shared("wall-run", wallRun), this.material);
        wing.position.x = side * (2.85 + len / 2);
        wing.scale.x = len;
        g.add(wing);
        this.walls.push(...toWorld(at.x, at.z, at.yaw, side * 2.85, 0.1), ...toWorld(at.x, at.z, at.yaw, side * (2.85 + len), 0.1));
      }
      put(g, at.x, at.z, at.yaw);
      // Pupils inside the gate, facing out to the street.
      for (let i = 0; i < 6; i++) {
        const [kx, kz] = toWorld(at.x, at.z, at.yaw, (i - 2.5) * 0.9, 2.2 + (i % 2) * 0.8);
        stand(pupilSpots, { x: kx, z: kz, yaw: at.yaw + Math.PI + (i % 3) * 0.3 });
      }
      this.keepOut.push({ x: at.x, z: at.z, r: 10 });
    }

    // Churches and mosques: the name board on the verge, the tower behind it.
    for (const p of pois.filter((q) => q.k === kind("place_of_worship")).sort(byDistance).slice(0, MAX_WORSHIP)) {
      const faith = faithOf(p);
      const r = faith === "muslim" ? 1 : 1.3;
      const at = frontOf(p, 2.4, [
        [-2.9, 0, VERGE],
        [0.5, 0, VERGE],
        [3.4, 1.2, VERGE + r],
      ]);
      if (!at) continue;
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
        const [gx, gz] = toWorld(x, z, yaw, 0, end * half);
        if (clear(gx, gz) < VERGE + 1) continue;
        const mesh = new THREE.Mesh(basketball ? shared("hoop", hoop) : shared(l > 60 ? "goal-full" : "goal-small", () => (l > 60 ? goal(7.3, 2.44) : goal(3.6, 1.8))), this.material);
        put(mesh, gx, gz, yaw + (end > 0 ? 0 : Math.PI));
      }
      const players = basketball ? 6 : Math.min(14, Math.round(l / 6));
      for (let i = 0; i < players; i++) {
        const u = ((i * 0.618) % 1) - 0.5, v = ((i * 0.381 + 0.2) % 1) - 0.5;
        const [kx, kz] = toWorld(x, z, yaw, u * w * 0.7, v * l * 0.7);
        stand(playerSpots, { x: kx, z: kz, yaw: yaw + i * 1.7 });
      }
      this.keepOut.push({ x, z, r: l / 2 });
    }

    // Playgrounds (only where the swings and slide fit clear of the road).
    for (const p of pois.filter((q) => q.k === kind("playground")).sort(byDistance).slice(0, MAX_PLAYGROUNDS)) {
      const x = p.x / 10, z = p.z / 10;
      if (clear(x, z) < 5 + VERGE) continue;
      put(new THREE.Mesh(shared("playset", playset), this.material), x, z, 0);
      for (let i = 0; i < 5; i++) stand(playerSpots, { x: x + (i - 2) * 1.6, z: z + 2.2 + (i % 2), yaw: i * 1.3 });
      this.keepOut.push({ x, z, r: 8 });
    }

    // School uniforms: white or light-blue shirts, with the odd green or maroon jumper.
    const UNIFORMS = ["#FFFFFF", "#CFE3F7", "#FFFFFF", "#2E7D32", "#8B1E3F", "#FFFFFF"];
    const crowd = (spots: Spot[]) => {
      if (!spots.length) return null;
      const geometry = PERSON_GEOMETRY.kid();
      const mesh = new THREE.InstancedMesh(geometry, this.material, spots.length);
      const dummy = new THREE.Object3D();
      spots.forEach((k, i) => {
        dummy.position.set(k.x, 0, k.z);
        dummy.rotation.set(0, k.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        setInstanceHex(mesh, i, UNIFORMS[i % UNIFORMS.length]!);
      });
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.owned.push(geometry);
      return mesh;
    };
    this.pupils = crowd(pupilSpots);
    this.players = crowd(playerSpots);
    if (pupilSpots.length) {
      this.umbrellas = new CrowdUmbrellas(
        pupilSpots.map((s) => ({ ...s, kind: "kid" as const })),
        this.material,
        3,
      );
      if (this.umbrellas.mesh) this.group.add(this.umbrellas.mesh);
      this.owned.push(this.umbrellas);
    }
    this.update(1);
  }

  /** School's in from 7 in the morning until 6 in the evening. */
  private daytime() {
    return env.hour >= 7 && env.hour < 18;
  }

  update(dt: number) {
    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    // Often enough for the umbrellas to open smoothly as a shower starts.
    this.checkTimer = 0.25;
    const day = this.daytime();
    if (this.pupils) this.pupils.visible = day;
    // Rain sends the children playing outside home; pupils wait under umbrellas.
    if (this.players) this.players.visible = day && env.rain < 0.25;
    this.umbrellas?.update(env.rain, day);
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
