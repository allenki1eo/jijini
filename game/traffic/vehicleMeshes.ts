/**
 * Low-poly traffic vehicles built from extruded side profiles, so bodies get
 * sloped bonnets, raked windscreens and rounded noses for very few
 * triangles. Forward is −z. Paint parts take the instance colour.
 *
 * The cast: a saloon (the ubiquitous IST/Corolla), a Land Cruiser–style
 * SUV, the daladala (Hiace with roof rack, livery, route board and a
 * conductor hanging out of the door), the bajaji (TVS King), a Fuso-style
 * lorry and a boda with its rider.
 */
import * as THREE from "three";
import { block, merge, part } from "@/game/world/meshKit";

export const VEHICLE_KINDS = ["car", "suv", "daladala", "bajaji", "truck", "boda"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

const GLASS = "#1B2533";
const TRIM = "#1C1F26";
const CHROME = "#C9D0DC";

/**
 * Extrude a side profile, given as [z, y] points in world units (front is
 * −z), across `width` along x. A small bevel rounds every edge.
 */
const profile = (points: [number, number][], width: number, bevel = 0.04) => {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(Math.PI / 2);
  g.translate(-(width - bevel * 2) / 2, 0, 0);
  return g;
};

/** A wheel: tyre, hub and a little hubcap, lying along x. */
const wheel = (x: number, z: number, r = 0.33, w = 0.24) => [
  part(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(x, r, z), "#14161A"),
  part(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10).rotateZ(Math.PI / 2).translate(x, r, z), "#8D96A6"),
  part(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 0.04, 6).rotateZ(Math.PI / 2).translate(x, r, z), CHROME),
];

const lights = (halfW: number, y: number, front: number, back: number, w = 0.32, h = 0.14) => [
  part(block(w, h, 0.06, -halfW + w / 2 + 0.08, y, front), "#FFF4C8", { glow: true }),
  part(block(w, h, 0.06, halfW - w / 2 - 0.08, y, front), "#FFF4C8", { glow: true }),
  part(block(w * 0.8, h, 0.06, -halfW + w / 2 + 0.08, y, back), "#FF2D2D", { glow: true }),
  part(block(w * 0.8, h, 0.06, halfW - w / 2 - 0.08, y, back), "#FF2D2D", { glow: true }),
  // Amber indicators at the corners.
  part(block(0.1, 0.08, 0.06, -halfW + 0.05, y, front + 0.01), "#FFB020", { glow: true }),
  part(block(0.1, 0.08, 0.06, halfW - 0.05, y, front + 0.01), "#FFB020", { glow: true }),
];

/** Tanzanian plates: white at the front, yellow at the back. */
const plates = (y: number, front: number, back: number) => [
  part(block(0.52, 0.12, 0.03, 0, y, front), "#F4F4F2"),
  part(block(0.52, 0.12, 0.03, 0, y, back), "#FFD54A"),
];

const mirrors = (halfW: number, y: number, z: number) => [-1, 1].map((s) => part(block(0.16, 0.12, 0.06, s * (halfW + 0.08), y, z), TRIM));

/** A seated or standing person in shorthand: torso, head and arms. */
const person = (x: number, y: number, z: number, shirt: string, opts: { lean?: number; skin?: string; cap?: string } = {}) => {
  const skin = opts.skin ?? "#4A2E1E";
  return [
    part(new THREE.CapsuleGeometry(0.17, 0.32, 3, 8).rotateX(opts.lean ?? 0).translate(x, y + 0.3, z), shirt),
    part(new THREE.SphereGeometry(0.13, 10, 8).translate(x, y + 0.72, z), skin),
    ...(opts.cap ? [part(new THREE.CylinderGeometry(0.135, 0.14, 0.08, 10).translate(x, y + 0.82, z), opts.cap)] : []),
  ];
};

export const VEHICLE_GEOMETRY: Record<VehicleKind, () => THREE.BufferGeometry> = {
  car: () =>
    merge([
      // Body: bumper, bonnet, boot.
      part(profile([[-2.1, 0.3], [-2.14, 0.6], [-1.9, 0.82], [-0.95, 0.9], [1.75, 0.92], [2.08, 0.82], [2.12, 0.55], [2.08, 0.3]], 1.76), "#FFFFFF", { tint: true }),
      // Cabin and glasshouse.
      part(profile([[-0.98, 0.86], [-0.35, 1.38], [0.95, 1.4], [1.62, 0.9]], 1.52, 0.05), "#FFFFFF", { tint: true }),
      part(profile([[-0.86, 0.94], [-0.3, 1.33], [0.92, 1.35], [1.5, 0.95]], 1.58, 0.02), GLASS),
      part(block(0.06, 0.4, 0.1, -0.79, 1.12, 0.32), "#FFFFFF", { tint: true }),
      part(block(0.06, 0.4, 0.1, 0.79, 1.12, 0.32), "#FFFFFF", { tint: true }),
      // Bumpers and grille.
      part(block(1.8, 0.18, 0.12, 0, 0.42, -2.12), TRIM),
      part(block(1.8, 0.18, 0.12, 0, 0.42, 2.1), TRIM),
      part(block(0.9, 0.16, 0.05, 0, 0.66, -2.16), "#2A2F3A"),
      ...[-0.78, 0.78].flatMap((x) => [...wheel(x, -1.32), ...wheel(x, 1.32)]),
      ...lights(0.88, 0.68, -2.15, 2.12),
      ...plates(0.42, -2.19, 2.17),
      ...mirrors(0.88, 1.0, -0.8),
    ]),
  suv: () =>
    merge([
      part(profile([[-2.3, 0.45], [-2.34, 0.95], [-2.05, 1.15], [-1.1, 1.22], [2.25, 1.22], [2.3, 0.45]], 1.9), "#FFFFFF", { tint: true }),
      part(profile([[-1.12, 1.18], [-0.65, 1.88], [2.2, 1.9], [2.25, 1.18]], 1.82, 0.05), "#FFFFFF", { tint: true }),
      part(profile([[-1.0, 1.27], [-0.6, 1.82], [2.15, 1.84], [2.2, 1.27]], 1.86, 0.02), GLASS),
      // Roof rails, snorkel, spare wheel on the back.
      part(block(0.06, 0.08, 2.6, -0.78, 1.98, 0.8), "#2A2F3A"),
      part(block(0.06, 0.08, 2.6, 0.78, 1.98, 0.8), "#2A2F3A"),
      part(block(0.12, 1.0, 0.12, 0.98, 1.45, -1.05), TRIM),
      part(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14).rotateX(Math.PI / 2).translate(0, 1.0, 2.42), "#14161A"),
      part(block(1.95, 0.26, 0.16, 0, 0.55, -2.36), "#8D96A6"),
      part(block(1.95, 0.22, 0.16, 0, 0.55, 2.32), TRIM),
      part(block(1.1, 0.3, 0.05, 0, 0.98, -2.38), "#2A2F3A"),
      ...[-0.86, 0.86].flatMap((x) => [...wheel(x, -1.45, 0.42, 0.3), ...wheel(x, 1.45, 0.42, 0.3)]),
      ...lights(0.95, 0.98, -2.37, 2.33),
      ...plates(0.55, -2.45, 2.42),
      ...mirrors(0.95, 1.4, -0.95),
    ]),
  daladala: () =>
    merge([
      // Hiace body with a sloped nose.
      part(profile([[-2.5, 0.38], [-2.56, 0.95], [-2.3, 1.42], [-1.88, 2.02], [2.5, 2.04], [2.55, 0.38]], 1.96), "#FFFFFF", { tint: true }),
      // Windows: windscreen plus a band down each side.
      part(profile([[-2.24, 1.4], [-1.84, 1.94], [2.42, 1.95], [2.44, 1.4]], 2.0, 0.02), GLASS),
      // Livery stripes and the sliding door seam (left, the kerb side).
      part(block(2.0, 0.14, 4.9, 0, 0.92, 0.02), "#FFC72C"),
      part(block(2.0, 0.07, 4.9, 0, 1.08, 0.02), "#D7261E"),
      part(block(0.02, 1.2, 0.04, -1.0, 1.15, -0.55), "#3A3F4A"),
      part(block(0.02, 1.2, 0.04, -1.0, 1.15, 0.55), "#3A3F4A"),
      // Roof rack with luggage and the route board over the windscreen.
      part(block(1.7, 0.06, 3.4, 0, 2.18, 0.5), "#3A3F4A"),
      part(block(1.2, 0.36, 1.1, -0.15, 2.4, 0.9), "#C8913A"),
      part(block(0.7, 0.3, 0.8, 0.45, 2.36, -0.2), "#2E6EB5"),
      part(block(1.5, 0.28, 0.08, 0, 2.2, -1.95), "#FFF1C9", { glow: true }),
      part(block(1.98, 0.2, 0.14, 0, 0.45, -2.56), TRIM),
      part(block(1.98, 0.2, 0.14, 0, 0.45, 2.55), TRIM),
      ...[-0.86, 0.86].flatMap((x) => [...wheel(x, -1.72, 0.35), ...wheel(x, 1.72, 0.35)]),
      ...lights(0.98, 0.75, -2.58, 2.57),
      ...plates(0.45, -2.64, 2.63),
      ...mirrors(0.98, 1.5, -2.15),
      // The konda, hanging out of the door calling for passengers.
      ...person(-1.12, 0.62, 0, "#E0457B", { lean: 0.25 }),
      part(block(0.07, 0.42, 0.07, -1.24, 1.32, -0.2), "#4A2E1E"),
    ]),
  bajaji: () =>
    merge([
      // Tub, canopy and windscreen.
      part(profile([[-1.12, 0.35], [-1.22, 0.92], [-0.9, 1.02], [1.18, 1.0], [1.24, 0.35]], 1.24), "#FFFFFF", { tint: true }),
      part(profile([[-0.95, 1.02], [-0.72, 1.86], [1.18, 1.88], [1.26, 1.02], [1.16, 1.02], [1.08, 1.76], [-0.64, 1.76], [-0.84, 1.02]], 1.3, 0.03), "#15171C"),
      part(block(1.08, 0.62, 0.04, 0, 1.38, -0.83).rotateX(-0.28), GLASS),
      part(block(1.3, 0.08, 1.9, 0, 1.92, 0.25), "#15171C"),
      // Driver up front, passenger bench behind.
      ...person(0, 0.9, -0.35, "#F4F1EA", { cap: "#1F3A63" }),
      part(block(1.1, 0.12, 0.5, 0, 0.98, 0.6), "#2A2F3A"),
      part(block(0.62, 0.04, 0.04, 0, 1.24, -0.72), TRIM),
      ...wheel(0, -1.0, 0.24, 0.14),
      ...wheel(0.58, 0.82, 0.24, 0.14),
      ...wheel(-0.58, 0.82, 0.24, 0.14),
      part(block(0.24, 0.16, 0.06, 0, 0.9, -1.25), "#FFF4C8", { glow: true }),
      part(block(0.2, 0.12, 0.06, -0.48, 0.7, 1.25), "#FF2D2D", { glow: true }),
      part(block(0.2, 0.12, 0.06, 0.48, 0.7, 1.25), "#FF2D2D", { glow: true }),
      part(block(0.42, 0.1, 0.03, 0, 0.5, 1.27), "#FFD54A"),
    ]),
  truck: () =>
    merge([
      // Fuso cab with a sloped windscreen, chassis and a tarp-covered load.
      part(profile([[-3.62, 0.62], [-3.68, 1.4], [-3.45, 2.6], [-1.7, 2.62], [-1.66, 0.62]], 2.3), "#FFFFFF", { tint: true }),
      part(profile([[-3.62, 1.65], [-3.44, 2.5], [-2.3, 2.52], [-2.3, 1.65]], 2.34, 0.02), GLASS),
      part(block(2.2, 0.32, 7.0, 0, 0.55, -0.2), "#2A2F3A"),
      part(block(2.4, 0.5, 4.9, 0, 1.0, 1.05), "#8E7B60"),
      part(profile([[-1.4, 1.2], [-1.4, 2.6], [-1.1, 2.95], [3.2, 2.95], [3.5, 2.6], [3.5, 1.2]], 2.36, 0.06), "#2E6E8E"),
      part(block(2.38, 0.06, 0.06, 0, 2.2, 1.05), "#C9C0AC"),
      part(block(2.3, 0.28, 0.16, 0, 0.75, -3.7), TRIM),
      ...[-1.0, 1.0].flatMap((x) => [...wheel(x, -2.65, 0.48, 0.3), ...wheel(x, 1.0, 0.48, 0.3), ...wheel(x, 2.4, 0.48, 0.3)]),
      ...lights(1.15, 1.0, -3.72, 3.52),
      ...plates(0.75, -3.8, 3.55),
      ...mirrors(1.15, 2.0, -3.3),
    ]),
  boda: () =>
    merge([
      ...wheel(0, -0.66, 0.3, 0.11),
      ...wheel(0, 0.66, 0.3, 0.11),
      // Tank, side panels, seat and rack.
      part(new THREE.SphereGeometry(0.2, 10, 8).scale(0.85, 0.7, 1.25).translate(0, 0.82, -0.2), "#FFFFFF", { tint: true }),
      part(block(0.3, 0.26, 0.42, 0, 0.62, 0.25), "#FFFFFF", { tint: true }),
      part(block(0.26, 0.08, 0.66, 0, 0.82, 0.25), "#10131A"),
      part(block(0.36, 0.03, 0.38, 0, 0.84, 0.72), "#2A2F3A"),
      part(block(0.24, 0.24, 0.3, 0, 0.42, 0.02), "#2A3040"),
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6).rotateX(Math.PI / 2 - 0.1).translate(0.17, 0.34, 0.42), CHROME),
      // Forks, bars and headlight.
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6).rotateX(-0.33).translate(0, 0.66, -0.56), CHROME),
      part(block(0.66, 0.04, 0.04, 0, 1.12, -0.48), "#15171C"),
      part(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10).rotateX(Math.PI / 2).translate(0, 0.98, -0.66), "#FFF4C8", { glow: true }),
      part(block(0.14, 0.08, 0.04, 0, 0.82, 0.92), "#FF2D2D", { glow: true }),
      // Rider: hi-vis vest, helmet, arms to the bars.
      part(new THREE.CapsuleGeometry(0.16, 0.34, 3, 8).rotateX(-0.3).translate(0, 1.25, 0.14), "#2B3A55"),
      part(new THREE.CapsuleGeometry(0.168, 0.2, 3, 8).rotateX(-0.3).translate(0, 1.22, 0.13), "#D7F24A"),
      part(new THREE.SphereGeometry(0.16, 10, 8).translate(0, 1.68, 0.02), "#FFC72C"),
      part(block(0.22, 0.08, 0.06, 0, 1.66, -0.13), "#1A2230"),
      ...[-0.18, 0.18].map((x) => part(new THREE.CapsuleGeometry(0.05, 0.42, 2, 6).rotateX(-1.1).translate(x, 1.24, -0.2), "#2B3A55")),
      ...[-0.13, 0.13].map((x) => part(new THREE.CapsuleGeometry(0.065, 0.36, 2, 6).rotateX(0.5).translate(x, 0.72, -0.12), "#1F2A44")),
    ]),
};

export interface VehicleSpec {
  length: number;
  width: number;
  /** Multiplier on the lane speed limit. */
  speed: number;
  accel: number;
  weight: number;
  colors: string[];
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  car: { length: 4.3, width: 1.8, speed: 1, accel: 2.4, weight: 0.24, colors: ["#F4F4F2", "#C9CED6", "#2B2F36", "#8B1E1E", "#1F4E8C", "#D9B44A", "#3F6E4F"] },
  suv: { length: 4.8, width: 1.95, speed: 0.98, accel: 2.2, weight: 0.1, colors: ["#F4F4F2", "#C9CED6", "#2B2F36", "#6B6F5A", "#1F3A63"] },
  daladala: { length: 5.2, width: 2.0, speed: 0.95, accel: 1.9, weight: 0.22, colors: ["#F4F1EA", "#E8E2D0", "#DCE7F2", "#F0E6C8"] },
  bajaji: { length: 2.5, width: 1.3, speed: 0.72, accel: 1.7, weight: 0.15, colors: ["#1E5AA8", "#D7261E", "#F2C230", "#2E9E5B", "#111111"] },
  truck: { length: 7.4, width: 2.4, speed: 0.78, accel: 1.2, weight: 0.06, colors: ["#D7261E", "#1E5AA8", "#F4F1EA", "#2E9E5B", "#E37A1F"] },
  boda: { length: 1.9, width: 0.8, speed: 1.08, accel: 3, weight: 0.23, colors: ["#C93A31", "#1F3A63", "#0B6E4F", "#10131A", "#9C4A2E"] },
};
