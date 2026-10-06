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
import { useSettings } from "@/stores/settings";
import { useWorld } from "@/stores/world";
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

/** Atlas grid shared by the billboard shader patch. Posters are 3:1, the usual roadside shape. */
export const AD_SLOTS = 12;
export const BOARD_COLS = 4;
export const BOARD_ROWS = 3;
const BOARD_W = 768;
const BOARD_H = 256;
const STRIP_W = 1024;
const STRIP_H = 128;
const HERO_W = 1800;
const HERO_H = 600;

/** A sponsor from public/ads/manifest.json (a real business that agreed to advertise). */
interface Sponsor extends Partial<Business> {
  name: string;
  /** Poster image (3:1), relative to /ads/. */
  image?: string;
}

/** Shared textures; billboards, banners and the hero board read them through these uniforms. */
export const adUniforms = {
  uBoards: { value: null as THREE.Texture | null },
  uStrips: { value: null as THREE.Texture | null },
  uHero: { value: null as THREE.Texture | null },
};

/** Ads suitable for everyone, in slot order: radio spots and promo rides pick from these. */
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

/** A poster for a business without its own artwork, laid out for a 3:1 board of size w × h. */
const drawBoard = (ctx: CanvasRenderingContext2D, ad: Business, x: number, y: number, w = BOARD_W, h = BOARD_H) => {
  const k = h / BOARD_H;
  const [bg, fg, accent] = ad.colors;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  // A kitenge-style zigzag border along the bottom.
  ctx.fillStyle = accent;
  for (let i = 0; i < w / (32 * k); i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 32 * k, y + h);
    ctx.lineTo(x + (i * 32 + 16) * k, y + h - 18 * k);
    ctx.lineTo(x + (i + 1) * 32 * k, y + h);
    ctx.fill();
  }
  iconBadge(ctx, ad, x + 96 * k, y + 108 * k, 56 * k);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  fit(ctx, ad.name, 800, 64 * k, DISPLAY, w - 210 * k);
  ctx.fillText(ad.name, x + 180 * k, y + 92 * k);
  fit(ctx, ad.tagline ?? "", 600, 28 * k, SANS, w - 210 * k);
  ctx.globalAlpha = 0.85;
  ctx.fillText(ad.tagline ?? "", x + 180 * k, y + 152 * k);
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.fillRect(x + 180 * k, y + 186 * k, 84 * k, 9 * k);
};

/** Draw an image to fill a w × h box, cropping rather than stretching. */
const drawCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
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

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = /^https?:|^\//.test(src) ? src : `/ads/${src}`;
  });

/**
 * Draw the city's ads into the shared textures. Local businesses show at
 * once; sponsors arrive a moment later and take every other billboard slot
 * plus the hero board. Age-restricted sponsors (alcohol) appear only on
 * billboards, and only for players who confirmed they are 18 or over.
 */
export const loadAds = (city: CityId) => {
  const boards = document.createElement("canvas");
  boards.width = BOARD_COLS * BOARD_W;
  boards.height = BOARD_ROWS * BOARD_H;
  const strips = document.createElement("canvas");
  strips.width = STRIP_W;
  strips.height = AD_SLOTS * STRIP_H;
  const hero = document.createElement("canvas");
  hero.width = HERO_W;
  hero.height = HERO_H;
  const boardTex = new THREE.CanvasTexture(boards);
  const stripTex = new THREE.CanvasTexture(strips);
  const heroTex = new THREE.CanvasTexture(hero);
  for (const t of [boardTex, stripTex, heroTex]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
  const local = businessesIn(city);
  let sponsors: { ad: Business; image: HTMLImageElement | null }[] = [];

  const draw = () => {
    const adult = useSettings.getState().adult === true;
    const shown = sponsors.filter((s) => adult || !s.ad.ageRestricted);
    const b = boards.getContext("2d")!;
    const st = strips.getContext("2d")!;
    // Billboards: sponsors on every other slot, local businesses between.
    for (let i = 0; i < AD_SLOTS; i++) {
      const x = (i % BOARD_COLS) * BOARD_W, y = Math.floor(i / BOARD_COLS) * BOARD_H;
      const sponsor = shown.length && i % 2 === 0 ? shown[(i / 2) % shown.length]! : null;
      if (sponsor?.image) drawCover(b, sponsor.image, x, y, BOARD_W, BOARD_H);
      else drawBoard(b, sponsor?.ad ?? local[i % local.length]!, x, y);
    }
    // Banners, radio spots and promo rides: everyone-friendly ads only.
    const general = [...shown.filter((s) => !s.ad.ageRestricted).map((s) => s.ad), ...local];
    for (let i = 0; i < AD_SLOTS; i++) drawStrip(st, general[i % general.length]!, i * STRIP_H);
    currentAds = general.slice(0, AD_SLOTS);
    // The hero board: the first sponsor at full resolution.
    const h = hero.getContext("2d")!;
    const first = shown[0];
    if (first?.image) drawCover(h, first.image, 0, 0, HERO_W, HERO_H);
    else drawBoard(h, first?.ad ?? local[0]!, 0, 0, HERO_W, HERO_H);
    boardTex.needsUpdate = stripTex.needsUpdate = heroTex.needsUpdate = true;
  };
  draw();
  adUniforms.uBoards.value = boardTex;
  adUniforms.uStrips.value = stripTex;
  adUniforms.uHero.value = heroTex;

  // Real sponsors, when the manifest lists any for this city.
  void fetch("/ads/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ sponsors?: Sponsor[] }>) : { sponsors: [] }))
    .then(async ({ sponsors: list = [] }) => {
      const mine = list.filter((s) => s.name && (!s.cities || s.cities.includes(city)));
      if (!mine.length) return;
      const images = await Promise.all(mine.map((s) => (s.image ? loadImage(s.image) : Promise.resolve(null))));
      sponsors = mine.map((s, i) => ({
        ad: {
          id: s.id ?? `sponsor-${i}`,
          name: s.name,
          tagline: s.tagline ?? "",
          taglineEn: s.taglineEn ?? s.tagline ?? "",
          colors: s.colors ?? ["#10131A", "#FFFFFF", "#FFC72C"],
          icon: s.icon ?? "radio",
          ageRestricted: s.ageRestricted === true,
        },
        image: images[i] ?? null,
      }));
      useWorld.getState().set({ adultAdsHere: sponsors.some((s) => s.ad.ageRestricted) });
      draw();
    })
    .catch(() => {});

  // Answering the age question (or changing it in Settings) redraws the boards.
  const unsub = useSettings.subscribe((s, prev) => {
    if (s.adult !== prev.adult) draw();
  });

  return () => {
    unsub();
    boardTex.dispose();
    stripTex.dispose();
    heroTex.dispose();
    adUniforms.uBoards.value = null;
    adUniforms.uStrips.value = null;
    adUniforms.uHero.value = null;
    useWorld.getState().set({ adultAdsHere: false });
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
export const createAdMaterial = (kind: "boards" | "strips" | "hero") => {
  const grid = kind === "boards" ? new THREE.Vector2(BOARD_COLS, BOARD_ROWS) : kind === "strips" ? new THREE.Vector2(1, AD_SLOTS) : new THREE.Vector2(1, 1);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uGrid: { value: grid } }]);
  // Shared by reference so the city's atlas (and sponsors arriving later) show up everywhere.
  uniforms.uMap = kind === "boards" ? adUniforms.uBoards : kind === "strips" ? adUniforms.uStrips : adUniforms.uHero;
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
  for (const x of [-4.6, 4.6]) {
    const leg = new THREE.Mesh(legs, frameMaterial);
    leg.position.set(x, 3.75, 0);
    group.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(13.9, 4.9, 0.3), frameMaterial);
  frame.position.y = 9.6;
  group.add(frame);
  const walkway = new THREE.Mesh(new THREE.BoxGeometry(13.9, 0.08, 0.8), frameMaterial);
  walkway.position.set(0, 7.1, -0.5);
  group.add(walkway);
  const poster = new THREE.PlaneGeometry(13.5, 4.5);
  poster.setAttribute("aCell", new THREE.Float32BufferAttribute(new Array(poster.attributes.position!.count).fill(0), 1));
  const material = createAdMaterial("hero");
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(poster, material);
    face.position.set(0, 9.6, side * 0.17);
    if (side < 0) face.rotation.y = Math.PI;
    group.add(face);
  }
  // Floodlights for the night.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: "#FFF1C9" });
  const lamp = new THREE.BoxGeometry(0.5, 0.18, 0.3);
  for (const x of [-4.5, 0, 4.5]) {
    const m = new THREE.Mesh(lamp, lampMaterial);
    m.position.set(x, 12.2, 0.6);
    group.add(m);
  }
  return { object: group, walls: [-4.8, 0, 4.8, 0] };
};
