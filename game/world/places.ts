/**
 * How each kind of OpenStreetMap place looks: sign color, icon and how
 * important it is when signs crowd together. The icon atlas is drawn once
 * from lucide's icon data and shared by the 3D signposts, their labels and
 * the minimap.
 */
import { __iconData as banknote } from "lucide-react/dist/esm/icons/banknote.mjs";
import { __iconData as beer } from "lucide-react/dist/esm/icons/beer.mjs";
import { __iconData as bed } from "lucide-react/dist/esm/icons/bed-double.mjs";
import { __iconData as briefcase } from "lucide-react/dist/esm/icons/briefcase.mjs";
import { __iconData as bus } from "lucide-react/dist/esm/icons/bus.mjs";
import { __iconData as busFront } from "lucide-react/dist/esm/icons/bus-front.mjs";
import { __iconData as church } from "lucide-react/dist/esm/icons/church.mjs";
import { __iconData as ferris } from "lucide-react/dist/esm/icons/ferris-wheel.mjs";
import { __iconData as fuel } from "lucide-react/dist/esm/icons/fuel.mjs";
import { __iconData as goal } from "lucide-react/dist/esm/icons/goal.mjs";
import { __iconData as hospital } from "lucide-react/dist/esm/icons/hospital.mjs";
import { __iconData as mapPin } from "lucide-react/dist/esm/icons/map-pin.mjs";
import { __iconData as pill } from "lucide-react/dist/esm/icons/pill.mjs";
import { __iconData as school } from "lucide-react/dist/esm/icons/school.mjs";
import { __iconData as shield } from "lucide-react/dist/esm/icons/shield.mjs";
import { __iconData as basket } from "lucide-react/dist/esm/icons/shopping-basket.mjs";
import { __iconData as stethoscope } from "lucide-react/dist/esm/icons/stethoscope.mjs";
import { __iconData as store } from "lucide-react/dist/esm/icons/store.mjs";
import { __iconData as utensils } from "lucide-react/dist/esm/icons/utensils.mjs";
import { __iconData as wrench } from "lucide-react/dist/esm/icons/wrench.mjs";
import { POI_KINDS, type PoiKind } from "./format";

type IconNode = [string, Record<string, string>][];

export interface PlaceStyle {
  color: string;
  icon: IconNode;
  /** Higher wins when signs crowd the same spot; 3 is always shown. */
  rank: number;
}

export const PLACE_STYLE: Record<PoiKind, PlaceStyle> = {
  hospital: { color: "#E5484D", icon: hospital.node, rank: 3 },
  clinic: { color: "#E5484D", icon: stethoscope.node, rank: 2 },
  pharmacy: { color: "#16A34A", icon: pill.node, rank: 2 },
  school: { color: "#2563EB", icon: school.node, rank: 2 },
  market: { color: "#F59E0B", icon: basket.node, rank: 3 },
  fuel: { color: "#00A3DD", icon: fuel.node, rank: 3 },
  bus_station: { color: "#E0A800", icon: bus.node, rank: 3 },
  place_of_worship: { color: "#7C3AED", icon: church.node, rank: 2 },
  bank: { color: "#059669", icon: banknote.node, rank: 2 },
  restaurant: { color: "#EA580C", icon: utensils.node, rank: 1 },
  bar: { color: "#B45309", icon: beer.node, rank: 1 },
  shop: { color: "#DB2777", icon: store.node, rank: 0 },
  hotel: { color: "#4F46E5", icon: bed.node, rank: 1 },
  police: { color: "#1E3A8A", icon: shield.node, rank: 3 },
  office: { color: "#475569", icon: briefcase.node, rank: 1 },
  other: { color: "#64748B", icon: mapPin.node, rank: -1 },
  bus_stop: { color: "#E0A800", icon: busFront.node, rank: 2 },
  garage: { color: "#57534E", icon: wrench.node, rank: 0 },
  playground: { color: "#F97316", icon: ferris.node, rank: 1 },
  pitch: { color: "#15803D", icon: goal.node, rank: 1 },
};

/** Atlas layout: one square cell per POI kind, in POI_KINDS order. */
export const ATLAS_COLS = 6;
export const ATLAS_ROWS = Math.ceil(POI_KINDS.length / ATLAS_COLS);
const CELL = 128;

const num = (v: string | undefined, fallback = 0) => (v === undefined ? fallback : Number.parseFloat(v));

/** Stroke one lucide icon (24×24 viewBox) into the current transform. */
export const drawIcon = (ctx: CanvasRenderingContext2D, icon: IconNode) => {
  for (const [tag, a] of icon) {
    switch (tag) {
      case "path":
        ctx.stroke(new Path2D(a.d));
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(num(a.cx), num(a.cy), num(a.r), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(num(a.cx), num(a.cy), num(a.rx), num(a.ry), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "rect":
        ctx.beginPath();
        ctx.roundRect(num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx ?? a.ry));
        ctx.stroke();
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(num(a.x1), num(a.y1));
        ctx.lineTo(num(a.x2), num(a.y2));
        ctx.stroke();
        break;
      case "polyline":
      case "polygon": {
        const pts = (a.points ?? "").trim().split(/[\s,]+/).map(Number);
        ctx.beginPath();
        for (let i = 0; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
        if (tag === "polygon") ctx.closePath();
        ctx.stroke();
        break;
      }
    }
  }
};

/** Draw a round badge (colored disc, white ring and icon) centered in a square of `size` px. */
export const drawBadge = (ctx: CanvasRenderingContext2D, kind: PoiKind, cx: number, cy: number, size: number) => {
  const style = PLACE_STYLE[kind];
  const r = size / 2;
  ctx.save();
  ctx.fillStyle = "#FFF6E5";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.fill();
  const s = (size * 0.5) / 24;
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawIcon(ctx, style.icon);
  ctx.restore();
};

let atlas: HTMLCanvasElement | null = null;

/** The shared badge atlas (browser only). */
export const placeAtlas = (): HTMLCanvasElement => {
  if (atlas) return atlas;
  atlas = document.createElement("canvas");
  atlas.width = ATLAS_COLS * CELL;
  atlas.height = ATLAS_ROWS * CELL;
  const ctx = atlas.getContext("2d")!;
  POI_KINDS.forEach((kind, i) => drawBadge(ctx, kind, (i % ATLAS_COLS) * CELL + CELL / 2, Math.floor(i / ATLAS_COLS) * CELL + CELL / 2, CELL - 8));
  return atlas;
};

/** Source rectangle of a kind's badge in the atlas, in atlas pixels. */
export const atlasCell = (k: number): [number, number, number] => [(k % ATLAS_COLS) * CELL, Math.floor(k / ATLAS_COLS) * CELL, CELL];
