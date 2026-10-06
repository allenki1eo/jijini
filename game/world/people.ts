/**
 * Townspeople, low-poly and instanced. The tinted part takes each instance's
 * colour (shirt, kanga, waistcoat). Shared by pedestrians, market sellers
 * and shoppers, and the people waiting at bus stops.
 */
import * as THREE from "three";
import { block, merge, part, setInstanceHex } from "./meshKit";

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

// ── Umbrellas ───────────────────────────────────────────────────────────────

/**
 * An umbrella held in the right hand, in the person's local frame with the
 * shaft on the origin: a tinted eight-panel dome over a man's head (with
 * its underside, seen from the kerb), a dark rim, a finial on top and a
 * curved handle at hand height. Each instance is offset to the hand and
 * scaled for the person (see `umbrellaMatrix`); scaling x/z opens and
 * closes it.
 */
export const umbrellaGeometry = () => {
  // A shallow cap of a sphere: rim radius ≈ 0.6 m, about 0.3 m deep, rim at y = 2.
  const R = 0.72, cap = 0.98;
  const rim = R * Math.sin(cap), lift = 2 - R * Math.cos(cap);
  return merge([
    part(new THREE.SphereGeometry(R, 8, 3, 0, Math.PI * 2, 0, cap).translate(0, lift, 0), "#FFFFFF", { tint: true }),
    part(new THREE.CircleGeometry(rim, 8).rotateX(Math.PI / 2).translate(0, 2.0, 0), "#FFFFFF", { tint: true }),
    part(new THREE.CylinderGeometry(rim + 0.005, rim + 0.005, 0.035, 8, 1, true).translate(0, 2.0, 0), "#1B1D22"),
    part(new THREE.CylinderGeometry(0.012, 0.012, 1.15, 5).translate(0, 1.5, 0), "#2A2E3A"),
    part(new THREE.CylinderGeometry(0.018, 0.01, 0.12, 5).translate(0, lift + R + 0.04, 0), "#C9D0DC"),
    part(new THREE.TorusGeometry(0.05, 0.016, 5, 8, Math.PI).rotateZ(Math.PI).translate(0.05, 0.93, 0), "#3A2A20"),
  ]);
};

/** Height and canopy scale for each kind (the mama's umbrella clears her basket; a kid's is smaller). */
const UMBRELLA_FIT: Record<PersonKind, { y: number; r: number; hand: number }> = {
  man: { y: 1, r: 1, hand: 0.22 },
  mama: { y: 1.1, r: 1.05, hand: 0.24 },
  kid: { y: 0.72, r: 0.75, hand: 0.17 },
  mzee: { y: 1.02, r: 1, hand: 0.2 },
};

/** Canopy colours: plenty of black, then the bright ones you see in a downpour. */
export const UMBRELLA_COLORS = ["#16181D", "#1F3A63", "#C62828", "#16181D", "#0B6E4F", "#F2C94C", "#7C3AED", "#E0457B", "#2F80ED", "#16181D", "#F37021"];

/** Who has an umbrella: about four in five, picked steadily per index. */
export const hasUmbrella = (i: number) => ((i * 2246822519) >>> 0) % 5 !== 0;

/** How open umbrellas are for the rain level: closed in the dry, fully open in a proper shower. */
export const umbrellaOpen = (rain: number) => Math.max(0, Math.min(1, (rain - 0.12) / 0.3));

const umbrellaDummy = new THREE.Object3D();
/** The umbrella's matrix for a person standing at (x, z) facing `yaw`, `open` 0–1. */
export const umbrellaMatrix = (kind: PersonKind, x: number, y: number, z: number, yaw: number, open: number) => {
  const fit = UMBRELLA_FIT[kind];
  // In the right hand (local +x), leaning over the head and a little forward into the rain.
  umbrellaDummy.position.set(x + Math.cos(yaw) * fit.hand, y, z - Math.sin(yaw) * fit.hand);
  umbrellaDummy.rotation.set(-0.12 * open, yaw, 0.08, "YXZ");
  const r = fit.r * (0.14 + 0.86 * open);
  umbrellaDummy.scale.set(r, fit.y, r);
  umbrellaDummy.updateMatrix();
  return umbrellaDummy.matrix;
};

/**
 * Umbrellas for a crowd that stands still (pupils at the gate, shoppers at
 * the stalls). They open as the rain starts and fold away when it stops;
 * matrices are only rewritten while that's happening.
 */
export class CrowdUmbrellas {
  readonly mesh: THREE.InstancedMesh | null = null;
  private readonly people: { x: number; z: number; yaw: number; kind: PersonKind }[];
  private open = -1;

  constructor(people: { x: number; z: number; yaw: number; kind: PersonKind }[], material: THREE.Material, seed = 0) {
    this.people = people.filter((_, i) => hasUmbrella(i + seed));
    if (!this.people.length) return;
    this.mesh = new THREE.InstancedMesh(umbrellaGeometry(), material, this.people.length);
    this.people.forEach((_, i) => setInstanceHex(this.mesh!, i, UMBRELLA_COLORS[(i * 7 + seed) % UMBRELLA_COLORS.length]!));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** `shown` lets the owner hide them with the crowd (pupils go home at 6). */
  update(rain: number, shown = true) {
    if (!this.mesh) return;
    const open = umbrellaOpen(rain);
    this.mesh.visible = shown && open > 0;
    if (!this.mesh.visible || Math.abs(open - this.open) < 0.02) return;
    this.open = open;
    this.people.forEach((p, i) => this.mesh!.setMatrixAt(i, umbrellaMatrix(p.kind, p.x, 0, p.z, p.yaw, open)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.mesh?.dispose();
  }
}
