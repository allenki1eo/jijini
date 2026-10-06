/**
 * Real places from OpenStreetMap, made visible: a roadside signpost with a
 * round badge for every hospital, clinic, pharmacy, school, market, fuel
 * station, bank, office, shop and garage, plus daladala shelters with people
 * waiting at bus stops and stands. The nearest named places get a floating
 * name label. Everything is instanced: three draw calls plus a few labels.
 */
import * as THREE from "three";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import { currentDictionary } from "@/i18n";
import { POI_KINDS, type Poi, type PoiKind } from "./format";
import { ATLAS_COLS, ATLAS_ROWS, PLACE_STYLE, drawBadge, placeAtlas } from "./places";
import { block, createInstancedMaterial, merge, part, setInstanceHex } from "./meshKit";

const BUS_STOP = POI_KINDS.indexOf("bus_stop");
const BUS_STATION = POI_KINDS.indexOf("bus_station");
/** Signs closer together than this collapse to the most important one. */
const DECLUTTER = 9;
const SIGN_HEIGHT = 3.3;
const FADE_FAR = 120;
/** Only the couple of places right beside the rider get a name card; the rest are just badges. */
const LABELS = 2;
const LABEL_RANGE = 38;
/** Main roads get a daladala stop at least this often when OSM has none mapped. */
const SYNTH_STOP_SPACING = 320;

export interface Sign {
  poi: Poi;
  kind: PoiKind;
  x: number;
  z: number;
}

const BADGE_VERTEX = /* glsl */ `
attribute vec3 iOffset;
attribute vec2 iCell;
attribute float iScale;
uniform float uSize;
uniform float uFar;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
  float dist = -mv.z;
  // Grow a little with distance so far signs stay readable, then fade out.
  float size = uSize * iScale * (1.0 + clamp(dist / 140.0, 0.0, 1.0) * 0.9);
  mv.y += sin(uTime * 1.6 + iOffset.x * 0.37) * 0.06;
  mv.xy += position.xy * size;
  vFade = 1.0 - smoothstep(uFar * 0.72, uFar, dist);
  vUv = (iCell + uv) / vec2(${ATLAS_COLS.toFixed(1)}, ${ATLAS_ROWS.toFixed(1)});
  gl_Position = projectionMatrix * mv;
}`;

const BADGE_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vFade;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a * vFade < 0.5) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <colorspace_fragment>
}`;

/** Pick one sign per crowded spot, best rank first; named places beat unnamed. */
const declutter = (pois: Poi[]): Sign[] => {
  const ranked = pois
    .map((poi) => ({ poi, kind: POI_KINDS[poi.k]!, x: (poi.r?.[0] ?? poi.x) / 10, z: (poi.r?.[1] ?? poi.z) / 10 }))
    .filter((s) => s.kind !== "other" || s.poi.n)
    .sort((a, b) => PLACE_STYLE[b.kind].rank - PLACE_STYLE[a.kind].rank || Number(Boolean(b.poi.n)) - Number(Boolean(a.poi.n)));
  const grid = new Map<string, Sign[]>();
  const out: Sign[] = [];
  for (const s of ranked) {
    const cx = Math.floor(s.x / DECLUTTER), cz = Math.floor(s.z / DECLUTTER);
    let crowded = false;
    if (PLACE_STYLE[s.kind].rank < 3) {
      for (let dx = -1; dx <= 1 && !crowded; dx++)
        for (let dz = -1; dz <= 1 && !crowded; dz++) crowded = (grid.get(`${cx + dx},${cz + dz}`) ?? []).some((o) => Math.hypot(o.x - s.x, o.z - s.z) < DECLUTTER);
    }
    if (crowded) continue;
    const key = `${cx},${cz}`;
    grid.set(key, [...(grid.get(key) ?? []), s]);
    out.push(s);
  }
  return out;
};

/**
 * Main roads without mapped stops get synthetic daladala stops on the
 * left-hand curb (Tanzania drives on the left), spaced along the road.
 */
export const synthesizeBusStops = (nav: NavNetwork, pois: Poi[]): Poi[] => {
  const stops = pois.filter((p) => p.k === BUS_STOP || p.k === BUS_STATION).map((p) => [p.x / 10, p.z / 10] as [number, number]);
  const added: Poi[] = [];
  const out = { x: 0, z: 0, dx: 0, dz: 0 };
  for (const lane of nav.lanes) {
    if (lane.cls > 1 || lane.length < SYNTH_STOP_SPACING * 0.6) continue;
    for (let s = SYNTH_STOP_SPACING * 0.5; s < lane.length - 20; s += SYNTH_STOP_SPACING) {
      nav.sample(lane.id, s, out);
      if (stops.some(([x, z]) => Math.hypot(x - out.x, z - out.z) < SYNTH_STOP_SPACING * 0.6)) continue;
      const off = lane.width / 2 + 1.6;
      const x = out.x + out.dz * off, z = out.z - out.dx * off;
      stops.push([x, z]);
      added.push({ k: BUS_STOP, x: Math.round(x * 10), z: Math.round(z * 10), r: [Math.round(x * 10), Math.round(z * 10)] });
    }
  }
  return added;
};

const shelterGeometry = () =>
  merge([
    part(block(3.6, 0.12, 1.7, 0, 2.55, 0), "#FFFFFF", { tint: true }),
    part(block(0.1, 2.5, 0.1, -1.7, 1.25, 0.7), "#4B5563"),
    part(block(0.1, 2.5, 0.1, 1.7, 1.25, 0.7), "#4B5563"),
    part(block(0.1, 2.5, 0.1, -1.7, 1.25, -0.7), "#4B5563"),
    part(block(0.1, 2.5, 0.1, 1.7, 1.25, -0.7), "#4B5563"),
    part(block(3.4, 1.3, 0.06, 0, 1.6, -0.75), "#FFFFFF", { tint: true }),
    part(block(3.0, 0.08, 0.45, 0, 0.55, -0.45), "#8B5E3C"),
    part(block(3.4, 0.28, 0.08, 0, 2.3, 0.82), "#FFF1C9", { glow: true }),
  ]);

const poleGeometry = () =>
  merge([
    part(new THREE.CylinderGeometry(0.06, 0.07, SIGN_HEIGHT, 6).translate(0, SIGN_HEIGHT / 2, 0), "#5B6170"),
    part(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8).translate(0, 0.06, 0), "#8A8F99"),
  ]);

const personGeometry = () =>
  merge([
    part(block(0.42, 0.62, 0.26, 0, 1.02, 0), "#FFFFFF", { tint: true }),
    part(block(0.36, 0.72, 0.24, 0, 0.36, 0), "#2F3340"),
    part(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.46, 0), "#4A2E1E"),
  ]);

const CLOTHES = ["#E0457B", "#FFC72C", "#00A3DD", "#2E9E5B", "#FF5A4F", "#7C3AED", "#F4EFE2", "#F37021"];

interface LabelSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  sign: Sign | null;
}

export class PlaceSigns {
  readonly group = new THREE.Group();
  readonly signs: Sign[];
  private readonly material = createInstancedMaterial({ glowStrength: 2.5 });
  private readonly badgeMaterial: THREE.ShaderMaterial;
  private readonly badges: THREE.Mesh;
  private readonly atlasTexture: THREE.CanvasTexture;
  private readonly labels: LabelSlot[] = [];
  private readonly labelCache = new Map<Poi, THREE.CanvasTexture>();
  private dict: ReturnType<typeof currentDictionary> | null = null;
  private sinceLabels = 1;
  private readonly owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  constructor(pois: Poi[]) {
    this.group.name = "place-signs";
    this.signs = declutter(pois);
    const dummy = new THREE.Object3D();

    // Signposts for everything but bus stops, which get shelters instead.
    const posts = this.signs.filter((s) => s.poi.k !== BUS_STOP);
    const poles = new THREE.InstancedMesh(poleGeometry(), this.material, Math.max(1, posts.length));
    posts.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
    });
    poles.count = posts.length;
    poles.frustumCulled = false;

    // Daladala shelters face the road; people wait under them.
    const stops = this.signs.filter((s) => s.poi.k === BUS_STOP || s.poi.k === BUS_STATION);
    const shelters = new THREE.InstancedMesh(shelterGeometry(), this.material, Math.max(1, stops.length));
    const people = new THREE.InstancedMesh(personGeometry(), this.material, Math.max(1, stops.length * 5));
    let crowd = 0;
    stops.forEach((s, i) => {
      // Face the road: the curb point is between the place and the road.
      const yaw = s.poi.r ? Math.atan2(s.poi.x / 10 - s.x, s.poi.z / 10 - s.z) : 0;
      const back = s.poi.r && Math.hypot(s.poi.x / 10 - s.x, s.poi.z / 10 - s.z) > 0.5 ? 1.2 : 0;
      const sx = s.x + Math.sin(yaw) * back, sz = s.z + Math.cos(yaw) * back;
      dummy.position.set(sx, 0, sz);
      dummy.rotation.set(0, yaw + Math.PI, 0);
      dummy.scale.setScalar(s.poi.k === BUS_STATION ? 1.35 : 1);
      dummy.updateMatrix();
      shelters.setMatrixAt(i, dummy.matrix);
      setInstanceHex(shelters, i, s.poi.k === BUS_STATION ? "#0B6E4F" : "#E0A800");
      const waiting = 2 + ((s.poi.x + s.poi.z) % 4 + 4) % 4;
      for (let p = 0; p < waiting; p++) {
        const along = -1.3 + (p / Math.max(1, waiting - 1)) * 2.6;
        dummy.position.set(sx + Math.cos(yaw) * along, 0, sz - Math.sin(yaw) * along);
        dummy.rotation.set(0, yaw + Math.PI + (p % 2 ? 0.4 : -0.3), 0);
        dummy.scale.set(1, 0.92 + ((p * 37 + s.poi.x) % 10) / 60, 1);
        dummy.updateMatrix();
        people.setMatrixAt(crowd, dummy.matrix);
        setInstanceHex(people, crowd, CLOTHES[(crowd * 7 + p) % CLOTHES.length]!);
        crowd++;
      }
      dummy.scale.setScalar(1);
    });
    shelters.count = stops.length;
    people.count = crowd;
    shelters.frustumCulled = people.frustumCulled = false;
    if (shelters.instanceColor) shelters.instanceColor.needsUpdate = true;
    if (people.instanceColor) people.instanceColor.needsUpdate = true;

    // Badges: camera-facing quads reading their icon from the shared atlas.
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.setAttribute("uv", quad.getAttribute("uv"));
    const offsets = new Float32Array(this.signs.length * 3);
    const cells = new Float32Array(this.signs.length * 2);
    const scales = new Float32Array(this.signs.length);
    this.signs.forEach((s, i) => {
      const stop = s.poi.k === BUS_STOP || s.poi.k === BUS_STATION;
      offsets.set([s.x, stop ? 3.35 : SIGN_HEIGHT + 0.45, s.z], i * 3);
      // Atlas rows run top-down; texture v runs bottom-up.
      cells.set([s.poi.k % ATLAS_COLS, ATLAS_ROWS - 1 - Math.floor(s.poi.k / ATLAS_COLS)], i * 2);
      scales[i] = PLACE_STYLE[s.kind].rank >= 3 ? 1.3 : PLACE_STYLE[s.kind].rank <= 0 ? 0.85 : 1;
    });
    geometry.setAttribute("iOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute("iCell", new THREE.InstancedBufferAttribute(cells, 2));
    geometry.setAttribute("iScale", new THREE.InstancedBufferAttribute(scales, 1));
    geometry.instanceCount = this.signs.length;
    this.atlasTexture = new THREE.CanvasTexture(placeAtlas());
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.anisotropy = 4;
    this.badgeMaterial = new THREE.ShaderMaterial({
      vertexShader: BADGE_VERTEX,
      fragmentShader: BADGE_FRAGMENT,
      uniforms: { uAtlas: { value: this.atlasTexture }, uSize: { value: 0.95 }, uFar: { value: FADE_FAR }, uTime: { value: 0 } },
    });
    this.badges = new THREE.Mesh(geometry, this.badgeMaterial);
    this.badges.frustumCulled = false;
    this.badges.name = "place-badges";

    for (let i = 0; i < LABELS; i++) {
      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(7.2, 1.8, 1);
      sprite.center.set(0.5, 0);
      sprite.visible = false;
      sprite.renderOrder = 5;
      this.labels.push({ sprite, material, sign: null });
      this.group.add(sprite);
    }

    this.group.add(poles, shelters, people, this.badges);
    this.owned.push(poles.geometry, shelters.geometry, people.geometry, geometry, quad, this.material, this.badgeMaterial, this.atlasTexture);
  }

  update(dt: number, x: number, z: number, heading: number) {
    this.badgeMaterial.uniforms.uTime!.value += dt;
    this.sinceLabels += dt;
    if (this.sinceLabels < 0.35) return;
    this.sinceLabels = 0;
    const dict = currentDictionary();
    if (dict !== this.dict) {
      // Language changed: labels are redrawn in the new one.
      this.dict = dict;
      this.labelCache.forEach((t) => t.dispose());
      this.labelCache.clear();
      for (const slot of this.labels) slot.sign = null;
    }
    // Nearest named places, favouring what's ahead of the rider.
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const near: { s: Sign; score: number }[] = [];
    for (const s of this.signs) {
      if (!s.poi.n) continue;
      const dx = s.x - x, dz = s.z - z;
      const d = Math.hypot(dx, dz);
      if (d > LABEL_RANGE) continue;
      const ahead = d > 1 ? (dx * fx + dz * fz) / d : 1;
      near.push({ s, score: d * (1.35 - ahead * 0.45) - PLACE_STYLE[s.kind].rank * 4 });
    }
    near.sort((a, b) => a.score - b.score);
    const wanted = new Set(near.slice(0, LABELS).map((n) => n.s));
    // Keep labels that are still wanted where they are; fill free slots with the rest.
    for (const slot of this.labels) if (slot.sign && !wanted.has(slot.sign)) slot.sign = null;
    for (const slot of this.labels) if (slot.sign) wanted.delete(slot.sign);
    const queue = [...wanted];
    for (const slot of this.labels) {
      if (!slot.sign && queue.length) {
        slot.sign = queue.shift()!;
        slot.material.map = this.labelTexture(slot.sign, dict);
        slot.material.needsUpdate = true;
        const stop = slot.sign.poi.k === BUS_STOP || slot.sign.poi.k === BUS_STATION;
        slot.sprite.position.set(slot.sign.x, stop ? 4.1 : SIGN_HEIGHT + 1.15, slot.sign.z);
      }
      slot.sprite.visible = slot.sign !== null;
    }
  }

  private labelTexture(sign: Sign, dict: ReturnType<typeof currentDictionary>): THREE.CanvasTexture {
    const cached = this.labelCache.get(sign.poi);
    if (cached) return cached;
    if (this.labelCache.size > 48) {
      const [oldest, tex] = this.labelCache.entries().next().value!;
      if (!this.labels.some((l) => l.material.map === tex)) {
        tex.dispose();
        this.labelCache.delete(oldest);
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const kindLabel = (dict.missions.poi as Record<string, string>)[sign.kind] ?? "";
    const sub = [kindLabel, sign.poi.b].filter(Boolean).join(" · ");
    ctx.font = '700 40px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif';
    const name = fit(ctx, sign.poi.n ?? kindLabel, 390);
    const nameWidth = ctx.measureText(name).width;
    ctx.font = '500 24px "Inter Variable", Inter, system-ui, sans-serif';
    const subText = fit(ctx, sub, 390);
    const width = Math.min(512, Math.max(nameWidth, ctx.measureText(subText).width) + 116);
    const left = (512 - width) / 2;
    ctx.fillStyle = "rgba(16, 19, 26, 0.86)";
    ctx.beginPath();
    ctx.roundRect(left, 8, width, 100, 26);
    ctx.fill();
    // A small tail pointing down at the sign.
    ctx.beginPath();
    ctx.moveTo(256 - 12, 107);
    ctx.lineTo(256, 122);
    ctx.lineTo(256 + 12, 107);
    ctx.fill();
    drawBadge(ctx, sign.kind, left + 54, 58, 72);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFF6E5";
    ctx.font = '700 40px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif';
    ctx.fillText(name, left + 100, 58);
    ctx.fillStyle = "rgba(255, 246, 229, 0.7)";
    ctx.font = '500 24px "Inter Variable", Inter, system-ui, sans-serif';
    ctx.fillText(subText, left + 100, 92);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.labelCache.set(sign.poi, texture);
    return texture;
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    this.labelCache.forEach((t) => t.dispose());
    this.labels.forEach((l) => l.material.dispose());
  }
}

/** Shorten text with an ellipsis to fit `max` px in the current font. */
const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
};
