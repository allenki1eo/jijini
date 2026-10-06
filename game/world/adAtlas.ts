/**
 * Ad artwork, drawn once per city into two shared textures: billboard
 * posters (2:1) and banner strips strung across main roads (8:1). Sponsors
 * listed in public/ads/manifest.json replace the fictional ads first, using
 * their own poster image when they provide one.
 */
import * as THREE from "three";
import { __iconData as droplet } from "lucide-react/dist/esm/icons/droplet.mjs";
import { __iconData as fish } from "lucide-react/dist/esm/icons/fish.mjs";
import { __iconData as hammer } from "lucide-react/dist/esm/icons/hammer.mjs";
import { __iconData as pill } from "lucide-react/dist/esm/icons/pill.mjs";
import { __iconData as radio } from "lucide-react/dist/esm/icons/radio.mjs";
import { __iconData as scissors } from "lucide-react/dist/esm/icons/scissors.mjs";
import { __iconData as shield } from "lucide-react/dist/esm/icons/shield.mjs";
import { __iconData as shirt } from "lucide-react/dist/esm/icons/shirt.mjs";
import { __iconData as smartphone } from "lucide-react/dist/esm/icons/smartphone.mjs";
import { __iconData as utensils } from "lucide-react/dist/esm/icons/utensils.mjs";
import { __iconData as wheat } from "lucide-react/dist/esm/icons/wheat.mjs";
import { __iconData as wrench } from "lucide-react/dist/esm/icons/wrench.mjs";
import type { CityId } from "@/data/cities/config";
import { businessesIn, type AdIcon, type Business } from "@/data/ads";
import { drawIcon } from "./places";

const ICONS: Record<AdIcon, [string, Record<string, string>][]> = {
  utensils: utensils.node,
  wrench: wrench.node,
  smartphone: smartphone.node,
  shirt: shirt.node,
  fish: fish.node,
  pill: pill.node,
  hammer: hammer.node,
  scissors: scissors.node,
  shield: shield.node,
  radio: radio.node,
  wheat: wheat.node,
  droplet: droplet.node,
};

/** Atlas grid shared by the billboard shader patch. */
export const AD_SLOTS = 12;
export const BOARD_COLS = 4;
export const BOARD_ROWS = 3;
const BOARD_W = 512;
const BOARD_H = 256;
const STRIP_W = 1024;
const STRIP_H = 128;

/** A sponsor from public/ads/manifest.json (a real business that agreed to advertise). */
interface Sponsor extends Partial<Business> {
  name: string;
  /** Poster image (2:1), relative to /ads/. */
  image?: string;
}

/** Shared textures; billboards and banners read them through these uniforms. */
export const adUniforms = {
  uBoards: { value: null as THREE.Texture | null },
  uStrips: { value: null as THREE.Texture | null },
};

/** The ads currently on show, in atlas order (radio and promo rides pick from these). */
export let currentAds: Business[] = [];

const fit = (ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) => {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > max && s > 10) ctx.font = `${weight} ${(s -= 2)}px ${family}`;
};

const DISPLAY = '"Baloo 2 Variable", "Baloo 2", system-ui, sans-serif';
const SANS = '"Inter Variable", Inter, system-ui, sans-serif';

const iconBadge = (ctx: CanvasRenderingContext2D, ad: Business, cx: number, cy: number, r: number) => {
  const accent = ad.colors[2];
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  const s = (r * 1.15) / 24;
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawIcon(ctx, ICONS[ad.icon ?? "radio"]);
  ctx.restore();
};

const drawBoard = (ctx: CanvasRenderingContext2D, ad: Business, x: number, y: number) => {
  const [bg, fg, accent] = ad.colors;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, BOARD_W, BOARD_H);
  // A kitenge-style zigzag border along the bottom.
  ctx.fillStyle = accent;
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 32, y + BOARD_H);
    ctx.lineTo(x + i * 32 + 16, y + BOARD_H - 18);
    ctx.lineTo(x + i * 32 + 32, y + BOARD_H);
    ctx.fill();
  }
  iconBadge(ctx, ad, x + 70, y + 100, 46);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  fit(ctx, ad.name, 800, 54, DISPLAY, BOARD_W - 150);
  ctx.fillText(ad.name, x + 134, y + 86);
  fit(ctx, ad.tagline ?? "", 600, 24, SANS, BOARD_W - 150);
  ctx.globalAlpha = 0.85;
  ctx.fillText(ad.tagline ?? "", x + 134, y + 140);
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.fillRect(x + 134, y + 170, 70, 8);
};

const drawStrip = (ctx: CanvasRenderingContext2D, ad: Business, y: number) => {
  const [bg, fg, accent] = ad.colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, y, STRIP_W, STRIP_H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, y, STRIP_W, 10);
  ctx.fillRect(0, y + STRIP_H - 10, STRIP_W, 10);
  iconBadge(ctx, ad, 70, y + STRIP_H / 2, 40);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  fit(ctx, ad.name, 800, 56, DISPLAY, 420);
  const nameWidth = Math.min(420, ctx.measureText(ad.name).width);
  ctx.fillText(ad.name, 130, y + STRIP_H / 2 + 2);
  fit(ctx, ad.tagline ?? "", 600, 30, SANS, STRIP_W - 190 - nameWidth);
  ctx.globalAlpha = 0.85;
  ctx.fillText(ad.tagline ?? "", 160 + nameWidth, y + STRIP_H / 2 + 2);
  ctx.globalAlpha = 1;
};

/** Draw the city's ads into the shared textures; sponsors (if any) arrive a moment later and take the first slots. */
export const loadAds = (city: CityId) => {
  const boards = document.createElement("canvas");
  boards.width = BOARD_COLS * BOARD_W;
  boards.height = BOARD_ROWS * BOARD_H;
  const strips = document.createElement("canvas");
  strips.width = STRIP_W;
  strips.height = AD_SLOTS * STRIP_H;
  const boardTex = new THREE.CanvasTexture(boards);
  const stripTex = new THREE.CanvasTexture(strips);
  for (const t of [boardTex, stripTex]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
  const draw = (ads: Business[], images: (HTMLImageElement | null)[] = []) => {
    const b = boards.getContext("2d")!;
    const s = strips.getContext("2d")!;
    for (let i = 0; i < AD_SLOTS; i++) {
      const ad = ads[i % ads.length]!;
      const x = (i % BOARD_COLS) * BOARD_W, y = Math.floor(i / BOARD_COLS) * BOARD_H;
      const image = images[i % ads.length];
      if (image) b.drawImage(image, x, y, BOARD_W, BOARD_H);
      else drawBoard(b, ad, x, y);
      drawStrip(s, ad, i * STRIP_H);
    }
    boardTex.needsUpdate = true;
    stripTex.needsUpdate = true;
    currentAds = ads.slice(0, AD_SLOTS);
  };
  const local = businessesIn(city);
  draw(local);
  adUniforms.uBoards.value = boardTex;
  adUniforms.uStrips.value = stripTex;

  // Real sponsors, when the manifest lists any for this city.
  void fetch("/ads/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ sponsors?: Sponsor[] }>) : { sponsors: [] }))
    .then(async ({ sponsors = [] }) => {
      const mine = sponsors.filter((s) => s.name && (!s.cities || s.cities.includes(city)));
      if (!mine.length) return;
      const asBusiness = mine.map(
        (s, i): Business => ({
          id: s.id ?? `sponsor-${i}`,
          name: s.name,
          tagline: s.tagline ?? "",
          taglineEn: s.taglineEn ?? s.tagline ?? "",
          colors: s.colors ?? ["#10131A", "#FFFFFF", "#FFC72C"],
          icon: s.icon ?? "radio",
        }),
      );
      const images = await Promise.all(
        mine.map((s) =>
          s.image
            ? new Promise<HTMLImageElement | null>((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = /^https?:|^\//.test(s.image!) ? s.image! : `/ads/${s.image}`;
              })
            : Promise.resolve(null),
        ),
      );
      const all = [...asBusiness, ...local];
      draw(all, [...images, ...local.map(() => null)]);
    })
    .catch(() => {});

  return () => {
    boardTex.dispose();
    stripTex.dispose();
    adUniforms.uBoards.value = null;
    adUniforms.uStrips.value = null;
  };
};

const AD_VERTEX = /* glsl */ `
attribute float aCell;
uniform vec2 uGrid;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vec2 cell = vec2(mod(aCell, uGrid.x), uGrid.y - 1.0 - floor(aCell / uGrid.x));
  vUv = (uv + cell) / uGrid;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vec4 mvPosition = modelViewMatrix * p;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const AD_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Material for instanced ad faces; each instance picks its ad with an `aCell` attribute. */
export const createAdMaterial = (kind: "boards" | "strips") => {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uGrid: { value: kind === "boards" ? new THREE.Vector2(BOARD_COLS, BOARD_ROWS) : new THREE.Vector2(1, AD_SLOTS) } }]);
  // Shared by reference so the city's atlas (and sponsors arriving later) show up everywhere.
  uniforms.uMap = kind === "boards" ? adUniforms.uBoards : adUniforms.uStrips;
  return new THREE.ShaderMaterial({ vertexShader: AD_VERTEX, fragmentShader: AD_FRAGMENT, uniforms, fog: true });
};

/**
 * The hero billboard: a big double-sided board on tall legs that always
 * shows ad slot 0 — the first sponsor in public/ads/manifest.json, or the
 * first local business when there are none.
 */
export const buildHeroBillboard = () => {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshLambertMaterial({ color: "#2A3040" });
  const legs = new THREE.CylinderGeometry(0.16, 0.2, 7.5, 8);
  for (const x of [-3.2, 3.2]) {
    const leg = new THREE.Mesh(legs, frameMaterial);
    leg.position.set(x, 3.75, 0);
    group.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.4, 4.9, 0.3), frameMaterial);
  frame.position.y = 9.6;
  group.add(frame);
  const walkway = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.08, 0.8), frameMaterial);
  walkway.position.set(0, 7.1, -0.5);
  group.add(walkway);
  const poster = new THREE.PlaneGeometry(9, 4.5);
  poster.setAttribute("aCell", new THREE.Float32BufferAttribute(new Array(poster.attributes.position!.count).fill(0), 1));
  const material = createAdMaterial("boards");
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(poster, material);
    face.position.set(0, 9.6, side * 0.17);
    if (side < 0) face.rotation.y = Math.PI;
    group.add(face);
  }
  // Floodlights for the night.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: "#FFF1C9" });
  const lamp = new THREE.BoxGeometry(0.5, 0.18, 0.3);
  for (const x of [-2.5, 2.5]) {
    const m = new THREE.Mesh(lamp, lampMaterial);
    m.position.set(x, 12.2, 0.6);
    group.add(m);
  }
  return { object: group, walls: [-3.4, 0, 3.4, 0] };
};
