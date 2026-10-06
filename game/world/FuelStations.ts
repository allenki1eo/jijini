/**
 * Petrol stations (sheli): every mapped fuel station gets a forecourt at the
 * roadside — a canopy in the brand's colours with the station's name on the
 * fascia, two pump islands, an attendant in overalls, the kiosk, and a price
 * totem showing today's pump price for the city. Riding in under the canopy
 * and stopping opens the refuel panel.
 *
 * Local frame: −z faces the road; the forecourt runs back along +z.
 */
import * as THREE from "three";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";
import { PERSON_GEOMETRY } from "./people";

const MAX_STATIONS = 14;
/** How far back from the kerb the canopy's centre sits (m). */
const SETBACK = 7.5;

/** Canopy colours by brand, matched loosely on the OSM brand/name; anything else gets the house blue. */
const BRANDS: [RegExp, string, string][] = [
  [/puma/i, "#E30613", "#FFFFFF"],
  [/total/i, "#ED1C24", "#0055A4"],
  [/oryx/i, "#F37021", "#FFFFFF"],
  [/lake/i, "#0B6E4F", "#FFC72C"],
  [/camel/i, "#FFC72C", "#10131A"],
  [/gbp/i, "#1F3A63", "#FFC72C"],
  [/moil|mogas/i, "#7C3AED", "#FFFFFF"],
  [/engen/i, "#004B93", "#E30613"],
];

const colorsFor = (name: string): [string, string] => {
  for (const [re, a, b] of BRANDS) if (re.test(name)) return [a, b];
  return ["#00A3DD", "#FFFFFF"];
};

/** A canvas-painted plane, front face toward local −z. */
const painted = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, cw: number, ch: number) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.max(64, Math.round((512 * h) / w));
  draw(canvas.getContext("2d")!, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  mesh.rotation.y = Math.PI;
  return mesh;
};

const fitText = (ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number) => {
  ctx.font = `${weight} ${size}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxW && size > 10) ctx.font = `${weight} ${(size -= 2)}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
};

const forecourt = (main: string, trim: string) =>
  merge([
    // Concrete apron with painted bays.
    part(block(20, 0.06, 17, 0, 0.03, SETBACK), "#B9BCC2"),
    ...[-3.2, 3.2].map((x) => part(block(0.15, 0.07, 10, x + 1.6, 0.035, SETBACK), "#F4F1EA")),
    // Canopy: four columns, the deck, and a coloured fascia all round.
    ...[-5.2, 5.2].flatMap((x) => [SETBACK - 3, SETBACK + 3].map((z) => part(block(0.4, 5, 0.4, x, 2.5, z), "#E9ECF0"))),
    part(block(13, 0.35, 9, 0, 5.15, SETBACK), "#F4F6F8"),
    part(block(13.2, 0.9, 9.2, 0, 5.6, SETBACK), main, { tint: true }),
    part(block(13.25, 0.18, 9.25, 0, 5.1, SETBACK), trim),
    // Lights under the canopy.
    ...[-3, 3].flatMap((x) => [SETBACK - 2, SETBACK + 2].map((z) => part(block(1.4, 0.06, 0.5, x, 4.95, z), "#FFF8E1", { glow: true }))),
    // Pump islands with two pumps each.
    ...[-2.6, 2.6].flatMap((x) => [
      part(block(1.2, 0.25, 5.2, x, 0.125, SETBACK), "#FFC72C"),
      ...[SETBACK - 1.3, SETBACK + 1.3].flatMap((z) => [
        part(block(0.7, 1.7, 0.5, x, 1.1, z), "#F4F6F8"),
        part(block(0.72, 0.5, 0.52, x, 1.65, z), main, { tint: true }),
        part(block(0.5, 0.28, 0.02, x, 1.3, z - 0.26), "#1B2B22", { glow: true }),
        part(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5).rotateZ(0.5).translate(x + 0.42, 1.0, z), "#15171C"),
      ]),
    ]),
    // Kiosk with a glass front, an awning and a tyre stack.
    part(block(9, 3.4, 4.5, 0, 1.7, SETBACK + 9.5), "#F4F1EA"),
    part(block(6, 2.1, 0.08, -0.8, 1.35, SETBACK + 7.22), "#2B4A5E", { glow: true }),
    part(block(9.2, 0.5, 4.7, 0, 3.6, SETBACK + 9.5), main, { tint: true }),
    ...[0, 1, 2].map((i) => part(new THREE.TorusGeometry(0.34, 0.13, 6, 12).rotateX(Math.PI / 2).translate(3.6, 0.13 + i * 0.26, SETBACK + 6.8), "#15171C")),
    // Price totem at the kerb.
    part(block(0.5, 6.4, 0.5, 8.6, 3.2, 0.6), "#E9ECF0"),
    part(block(2.3, 4.2, 0.36, 8.6, 4.3, 0.6), main, { tint: true }),
    // Air and water stand, and a fire bucket.
    part(block(0.4, 1.1, 0.4, -7.6, 0.55, SETBACK + 2), "#D7261E"),
    part(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 10).translate(-7.6, 0.2, SETBACK + 3), "#D7261E"),
  ]);

export interface FuelStation {
  x: number;
  z: number;
  /** Where to stop: under the canopy. */
  bayX: number;
  bayZ: number;
  yaw: number;
  /** Canopy colour; the attendant's overalls match it. */
  main: string;
  name: string;
}

export class FuelStations {
  readonly group = new THREE.Group();
  readonly stations: FuelStation[] = [];
  /** Collision segments (kiosk, islands, totem), flat [x1, z1, x2, z2, ...] in world space. */
  readonly walls: number[] = [];
  private readonly material = createInstancedMaterial({ glowStrength: 1.6 });
  private readonly owned: { dispose(): void }[] = [];

  constructor(nav: NavNetwork, points: { x: number; z: number; name: string }[], price: number, priceLabel: string) {
    this.group.name = "fuel-stations";
    // Busiest first: the ones nearest the centre; never two forecourts on top of each other.
    const sorted = [...points].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const models = new Map<string, THREE.BufferGeometry>();
    // Every pump in town charges the same capped price, so the totem face is shared.
    const totem = painted(2, 3.6, (ctx, w, h) => {
      ctx.fillStyle = "#10131A";
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFFFFF";
      fitText(ctx, "PETROL", 800, h * 0.09, w * 0.86);
      ctx.fillText("PETROL", w / 2, h * 0.12);
      ctx.fillStyle = "#FFB020";
      fitText(ctx, price.toLocaleString("en-US"), 800, h * 0.16, w * 0.9);
      ctx.fillText(price.toLocaleString("en-US"), w / 2, h * 0.3);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      fitText(ctx, priceLabel, 600, h * 0.05, w * 0.86);
      ctx.fillText(priceLabel, w / 2, h * 0.42);
      ctx.fillStyle = "#FFFFFF";
      fitText(ctx, "DIESEL", 800, h * 0.09, w * 0.86);
      ctx.fillText("DIESEL", w / 2, h * 0.6);
      ctx.fillStyle = "#2EE27A";
      const diesel = Math.round((price * 0.97) / 10) * 10;
      fitText(ctx, diesel.toLocaleString("en-US"), 800, h * 0.16, w * 0.9);
      ctx.fillText(diesel.toLocaleString("en-US"), w / 2, h * 0.78);
    });
    this.owned.push(totem.geometry, totem.material as THREE.Material, (totem.material as THREE.MeshBasicMaterial).map!);

    for (const p of sorted) {
      if (this.stations.length >= MAX_STATIONS) break;
      // Face the nearest road.
      const n = nav.nearestOnNetwork(p.x, p.z);
      if (n.distance > 45) continue;
      let dx = p.x - n.x, dz = p.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        // Mapped on the road itself: use the lane's left verge.
        const lane = nav.lanes[n.lane]!;
        const i = Math.min(lane.pts.length - 4, Math.max(0, Math.floor((n.s / Math.max(lane.length, 1)) * (lane.pts.length / 2 - 1)) * 2));
        const tx = lane.pts[i + 2]! - lane.pts[i]!, tz = lane.pts[i + 3]! - lane.pts[i + 1]!;
        const tl = Math.hypot(tx, tz) || 1;
        dx = tz / tl;
        dz = -tx / tl;
      } else {
        dx /= d;
        dz /= d;
      }
      // The mapped point is usually the forecourt itself, which is clear of buildings: centre the canopy on it,
      // but never closer to the road than the kerb.
      const off = Math.max(nav.lanes[n.lane]!.width / 2 + 1.2, d - SETBACK);
      const x = n.x + dx * off, z = n.z + dz * off;
      if (this.stations.some((s) => Math.hypot(s.x - x, s.z - z) < 40)) continue;
      const yaw = Math.atan2(dx, dz);

      // OSM sometimes lists several names ("TotalEnergies;Total"): show the first.
      const label = p.name.split(";")[0]!.trim() || "Sheli";
      const [main, trim] = colorsFor(label);
      let geometry = models.get(main);
      if (!geometry) {
        geometry = forecourt(main, trim);
        models.set(main, geometry);
        this.owned.push(geometry);
      }
      const station = new THREE.Group();
      station.position.set(x, 0, z);
      station.rotation.y = yaw;
      station.add(new THREE.Mesh(geometry, this.material));

      // The station's name on the fascia, facing the road.
      const fascia = painted(10, 0.8, (ctx, w, h) => {
        ctx.fillStyle = main;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = trim;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fitText(ctx, label.toUpperCase(), 800, h * 0.72, w * 0.94);
        ctx.fillText(label.toUpperCase(), w / 2, h * 0.55);
      });
      fascia.position.set(0, 5.6, SETBACK - 4.62);
      station.add(fascia);
      this.owned.push(fascia.geometry, fascia.material as THREE.Material, (fascia.material as THREE.MeshBasicMaterial).map!);

      const face = totem.clone();
      face.position.set(8.6, 4.3, 0.41);
      station.add(face);

      this.group.add(station);
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const toWorld = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
      const [bayX, bayZ] = toWorld(0, SETBACK);
      this.stations.push({ x, z, bayX, bayZ, yaw, main, name: label });
      const seg = (ax: number, az: number, bx: number, bz: number) => this.walls.push(...toWorld(ax, az), ...toWorld(bx, bz));
      // Kiosk outline, the islands' spines and the totem.
      seg(-4.5, SETBACK + 7.25, 4.5, SETBACK + 7.25);
      seg(-4.5, SETBACK + 7.25, -4.5, SETBACK + 11.75);
      seg(4.5, SETBACK + 7.25, 4.5, SETBACK + 11.75);
      for (const ix of [-2.6, 2.6]) seg(ix, SETBACK - 2.6, ix, SETBACK + 2.6);
      seg(7.4, 0.6, 9.8, 0.6);
    }

    // Pump attendants in overalls the colour of their station, waiting between the islands facing the road.
    if (this.stations.length) {
      const geometry = PERSON_GEOMETRY.man();
      const attendants = new THREE.InstancedMesh(geometry, this.material, this.stations.length);
      const dummy = new THREE.Object3D();
      this.stations.forEach((s, i) => {
        dummy.position.set(s.bayX - Math.sin(s.yaw) * 0.5, 0, s.bayZ - Math.cos(s.yaw) * 0.5);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.updateMatrix();
        attendants.setMatrixAt(i, dummy.matrix);
        setInstanceHex(attendants, i, s.main);
      });
      attendants.frustumCulled = false;
      this.group.add(attendants);
      this.owned.push(geometry);
    }
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.material.dispose();
  }
}
