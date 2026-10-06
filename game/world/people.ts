/**
 * Townspeople, low-poly and instanced. The tinted part takes each instance's
 * colour (shirt, kanga, waistcoat). Shared by pedestrians, market sellers
 * and shoppers, and the people waiting at bus stops.
 */
import * as THREE from "three";
import { block, merge, part } from "./meshKit";

export const PERSON_KINDS = ["man", "mama", "kid", "mzee"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

const SKIN = ["#4A2E1E", "#5B3A26", "#3E2618"];
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 3, 8);

const head = (y: number, skin = SKIN[0]!) => part(new THREE.SphereGeometry(0.13, 12, 10).translate(0, y, 0), skin);
const arms = (y: number, color: string, tint = true, spread = 0.25) =>
  [-spread, spread].map((x) => part(capsule(0.05, 0.56).translate(x, y, 0), color, { tint }));

export const PERSON_GEOMETRY: Record<PersonKind, () => THREE.BufferGeometry> = {
  // Shirt (tinted), trousers and shoes.
  man: () =>
    merge([
      ...[-0.09, 0.09].map((x) => part(capsule(0.07, 0.8).translate(x, 0.42, 0), "#2A2E3A")),
      ...[-0.09, 0.09].map((x) => part(block(0.11, 0.06, 0.2, x, 0.03, -0.03), "#15171C")),
      part(capsule(0.19, 0.62).translate(0, 1.1, 0), "#FFFFFF", { tint: true }),
      ...arms(1.08, "#FFFFFF"),
      part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8).translate(0, 1.42, 0), SKIN[1]!),
      head(1.56, SKIN[1]),
    ]),
  // Kanga wrap (tinted), headscarf and a basket on her head.
  mama: () =>
    merge([
      part(new THREE.CylinderGeometry(0.2, 0.28, 0.95, 12).translate(0, 0.48, 0), "#FFFFFF", { tint: true }),
      part(capsule(0.18, 0.55).translate(0, 1.15, 0), "#FFFFFF", { tint: true }),
      part(block(0.42, 0.06, 0.3, 0, 0.98, 0), "#FFC72C"),
      ...arms(1.1, SKIN[0]!, false, 0.24),
      head(1.55),
      part(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.58, 0.01), "#C62828"),
      part(new THREE.CylinderGeometry(0.22, 0.17, 0.16, 12).translate(0, 1.78, 0), "#C8913A"),
      part(new THREE.SphereGeometry(0.07, 8, 6).translate(0.06, 1.88, 0.02), "#4E9A3A"),
      part(new THREE.SphereGeometry(0.06, 8, 6).translate(-0.07, 1.88, -0.03), "#E8522B"),
    ]),
  // School uniform: white shirt, blue shorts, a tinted backpack.
  kid: () =>
    merge([
      ...[-0.07, 0.07].map((x) => part(capsule(0.055, 0.52).translate(x, 0.28, 0), SKIN[1]!)),
      part(block(0.28, 0.2, 0.18, 0, 0.6, 0), "#1F4E8C"),
      part(capsule(0.15, 0.42).translate(0, 0.86, 0), "#F4F1EA"),
      part(block(0.26, 0.3, 0.1, 0, 0.88, 0.16), "#FFFFFF", { tint: true }),
      ...[-0.19, 0.19].map((x) => part(capsule(0.04, 0.4).translate(x, 0.84, 0), "#F4F1EA")),
      part(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.18, 0), SKIN[1]!),
    ]),
  // Long white kanzu, kofia, and a tinted waistcoat.
  mzee: () =>
    merge([
      part(new THREE.CylinderGeometry(0.19, 0.24, 1.05, 12).translate(0, 0.53, 0), "#F4F1EA"),
      part(capsule(0.19, 0.6).translate(0, 1.12, 0), "#F4F1EA"),
      part(capsule(0.2, 0.42).translate(0, 1.16, 0), "#FFFFFF", { tint: true }),
      ...arms(1.08, "#F4F1EA", false),
      head(1.55, SKIN[2]),
      part(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12).translate(0, 1.66, 0), "#F7F3EA"),
      part(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6).translate(0.3, 0.6, -0.08), "#6B4A33"),
    ]),
};

/** Clothing colours for the tinted part. */
export const CLOTHES: Record<PersonKind, string[]> = {
  man: ["#F2994A", "#2F80ED", "#27AE60", "#F2C94C", "#EB5757", "#9B51E0", "#F4F1EA", "#1F3A63", "#00A3DD"],
  mama: ["#E0457B", "#FFC72C", "#7C3AED", "#0B6E4F", "#F37021", "#00A3DD", "#C62828"],
  kid: ["#E0457B", "#2F80ED", "#27AE60", "#F2C94C", "#EB5757"],
  mzee: ["#2B3A55", "#6B4A33", "#3F6E4F", "#1F1F24"],
};

/** A deterministic person kind for an index (roughly 4 : 3 : 2 : 1). */
export const personKindFor = (i: number): PersonKind => {
  const r = ((i * 2654435761) >>> 0) % 10;
  return r < 4 ? "man" : r < 7 ? "mama" : r < 9 ? "kid" : "mzee";
};
