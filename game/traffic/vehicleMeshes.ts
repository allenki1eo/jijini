/** Low-poly traffic vehicles. Forward is -z; paint parts take the instance color. */
import * as THREE from "three";
import { block, merge, part } from "@/game/world/meshKit";

export const VEHICLE_KINDS = ["car", "daladala", "bajaji", "truck", "boda"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

const wheel = (x: number, z: number, r = 0.33, w = 0.24) =>
  part(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, r, z), "#16181D");

const lamps = (halfW: number, y: number, front: number, back: number, size = 0.24) => [
  part(block(size, 0.14, 0.06, -halfW + 0.25, y, front), "#FFF4C8", { glow: true }),
  part(block(size, 0.14, 0.06, halfW - 0.25, y, front), "#FFF4C8", { glow: true }),
  part(block(size, 0.12, 0.06, -halfW + 0.25, y, back), "#FF2D2D", { glow: true }),
  part(block(size, 0.12, 0.06, halfW - 0.25, y, back), "#FF2D2D", { glow: true }),
];

const GLASS = "#1E2836";

export const VEHICLE_GEOMETRY: Record<VehicleKind, () => THREE.BufferGeometry> = {
  car: () =>
    merge([
      part(block(1.8, 0.7, 4.2, 0, 0.62, 0), "#FFFFFF", { tint: true }),
      part(block(1.6, 0.62, 2.3, 0, 1.28, 0.2), "#FFFFFF", { tint: true }),
      part(block(1.64, 0.44, 2.1, 0, 1.3, 0.2), GLASS),
      part(block(1.5, 0.48, 0.06, 0, 1.28, -0.93), GLASS),
      ...[-0.8, 0.8].flatMap((x) => [wheel(x, -1.35), wheel(x, 1.35)]),
      ...lamps(0.9, 0.72, -2.11, 2.11),
    ]),
  daladala: () =>
    merge([
      part(block(2.0, 1.75, 5.1, 0, 1.2, 0), "#FFFFFF", { tint: true }),
      part(block(2.02, 0.62, 4.5, 0, 1.55, 0.2), GLASS),
      part(block(1.9, 0.6, 0.06, 0, 1.55, -2.56), GLASS),
      part(block(2.03, 0.16, 5.0, 0, 0.82, 0), "#FFC72C"),
      part(block(2.03, 0.08, 5.0, 0, 1.06, 0), "#D7261E"),
      part(block(1.6, 0.12, 3.4, 0, 2.15, 0.4), "#2A2F3A"),
      part(block(1.2, 0.35, 1.4, 0, 2.38, 0.7), "#C8913A"),
      ...[-0.9, 0.9].flatMap((x) => [wheel(x, -1.7, 0.36), wheel(x, 1.7, 0.36)]),
      ...lamps(1.0, 0.75, -2.56, 2.56),
    ]),
  bajaji: () =>
    merge([
      part(block(1.3, 1.0, 2.5, 0, 0.85, 0.1), "#FFFFFF", { tint: true }),
      part(block(1.35, 0.1, 2.3, 0, 1.78, 0.15), "#15171C"),
      part(block(0.08, 0.5, 0.08, 0.62, 1.5, -0.9), "#15171C"),
      part(block(0.08, 0.5, 0.08, -0.62, 1.5, -0.9), "#15171C"),
      part(block(1.2, 0.5, 0.05, 0, 1.5, -1.0), GLASS),
      wheel(0, -1.05, 0.25, 0.14),
      wheel(0.6, 0.85, 0.25, 0.14),
      wheel(-0.6, 0.85, 0.25, 0.14),
      part(block(0.24, 0.16, 0.06, 0, 0.95, -1.17), "#FFF4C8", { glow: true }),
      part(block(0.2, 0.12, 0.06, -0.5, 0.7, 1.36), "#FF2D2D", { glow: true }),
      part(block(0.2, 0.12, 0.06, 0.5, 0.7, 1.36), "#FF2D2D", { glow: true }),
    ]),
  truck: () =>
    merge([
      part(block(2.3, 1.9, 2.1, 0, 1.45, -2.6), "#FFFFFF", { tint: true }),
      part(block(2.32, 0.7, 1.9, 0, 1.85, -2.55), GLASS),
      part(block(2.4, 2.4, 4.8, 0, 1.75, 1.0), "#C9B79C"),
      part(block(2.42, 0.25, 4.82, 0, 2.95, 1.0), "#8E7B60"),
      part(block(2.2, 0.3, 7.0, 0, 0.55, -0.2), "#2A2F3A"),
      ...[-1.0, 1.0].flatMap((x) => [wheel(x, -2.6, 0.48, 0.3), wheel(x, 1.0, 0.48, 0.3), wheel(x, 2.4, 0.48, 0.3)]),
      ...lamps(1.15, 0.9, -3.66, 3.42),
    ]),
  boda: () =>
    merge([
      wheel(0, -0.65, 0.3, 0.1),
      wheel(0, 0.65, 0.3, 0.1),
      part(block(0.3, 0.32, 1.1, 0, 0.62, 0), "#FFFFFF", { tint: true }),
      part(block(0.26, 0.08, 0.6, 0, 0.82, 0.25), "#10131A"),
      part(block(0.4, 0.55, 0.26, 0, 1.25, 0.2), "#FFFFFF", { tint: true }),
      part(block(0.42, 0.3, 0.27, 0, 1.25, 0.2), "#D7F24A"),
      part(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.66, 0.12), "#FFC72C"),
      part(block(0.62, 0.05, 0.05, 0, 1.08, -0.42), "#15171C"),
      part(block(0.14, 0.12, 0.06, 0, 0.95, -0.58), "#FFF4C8", { glow: true }),
      part(block(0.14, 0.1, 0.06, 0, 0.8, 0.58), "#FF2D2D", { glow: true }),
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
  car: { length: 4.2, width: 1.8, speed: 1, accel: 2.4, weight: 0.32, colors: ["#F4F4F2", "#C9CED6", "#2B2F36", "#8B1E1E", "#1F4E8C", "#D9B44A", "#3F6E4F"] },
  daladala: { length: 5.1, width: 2.0, speed: 0.95, accel: 1.9, weight: 0.22, colors: ["#F4F1EA", "#E8E2D0", "#DCE7F2", "#F0E6C8"] },
  bajaji: { length: 2.5, width: 1.3, speed: 0.72, accel: 1.7, weight: 0.16, colors: ["#1E5AA8", "#D7261E", "#F2C230", "#2E9E5B", "#111111"] },
  truck: { length: 7.3, width: 2.4, speed: 0.78, accel: 1.2, weight: 0.07, colors: ["#D7261E", "#1E5AA8", "#F4F1EA", "#2E9E5B", "#E37A1F"] },
  boda: { length: 1.9, width: 0.8, speed: 1.08, accel: 3, weight: 0.23, colors: ["#C93A31", "#1F3A63", "#0B6E4F", "#10131A", "#9C4A2E"] },
};
