"use client";

import { Building2, Bus, Fuel, Hospital, Landmark, LocateFixed, MapPin, Minus, Navigation, Plus, School, ShoppingBasket, X } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatDistance } from "@/components/missions/stopLabel";
import { drawPin } from "@/components/missions/Minimap";
import { Button } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import { navHud } from "@/game/core/hud";
import type { PoiKind } from "@/game/world/format";
import { PLACE_STYLE, atlasCell, placeAtlas } from "@/game/world/places";
import type { Sign } from "@/game/world/PlaceSigns";
import { fmt, useT } from "@/i18n";

/** Road colours by class (0 = trunk … 6 = track), as on the minimap. */
const ROAD_COLORS = ["#F2D184", "#E8D9B0", "#D8CBB0", "#B9AE9C", "#9A9285", "#8A6F5A", "#6E6458"];
const TRIP = "#38BDF8";
/** Zoom limits, in screen px per metre: the whole town … a single junction. */
const MIN_K = 0.06;
const MAX_K = 4;
/** A boda's average across town, for the time estimate (≈ 22 km/h). */
const CITY_SPEED = 6.1;

type QuickKey = "fuel" | "bank" | "market" | "hospital" | "bus" | "school";
/** The icon for a chosen place in the bottom card. */
const KIND_ICON: Partial<Record<PoiKind, typeof Fuel>> = { fuel: Fuel, bank: Landmark, market: ShoppingBasket, hospital: Hospital, clinic: Hospital, bus_station: Bus, bus_stop: Bus, school: School };
const QUICK: { key: QuickKey; kinds: PoiKind[]; icon: ReactNode }[] = [
  { key: "fuel", kinds: ["fuel"], icon: <Fuel /> },
  { key: "bank", kinds: ["bank"], icon: <Landmark /> },
  { key: "market", kinds: ["market"], icon: <ShoppingBasket /> },
  { key: "hospital", kinds: ["hospital", "clinic"], icon: <Hospital /> },
  { key: "bus", kinds: ["bus_station"], icon: <Bus /> },
  { key: "school", kinds: ["school"], icon: <School /> },
];

interface Target {
  x: number;
  z: number;
  label: string;
  sub: string;
  kind: PoiKind | null;
  route: Float32Array | null;
  length: number;
}

interface View {
  cx: number;
  cz: number;
  k: number;
}

/** The whole drivable network as one Path2D per road class, in world metres (built once per city). */
const roadLayers = new WeakMap<Game, { paths: Path2D[]; widths: number[] }>();
const roadsFor = (game: Game) => {
  const cached = roadLayers.get(game);
  if (cached) return cached;
  const paths = Array.from({ length: 7 }, () => new Path2D());
  const widths = Array<number>(7).fill(3);
  const seen = new Set<number>();
  for (const lane of game.nav?.lanes ?? []) {
    // Two-way roads are two lanes on one edge: draw each edge once.
    if (seen.has(lane.edge)) continue;
    seen.add(lane.edge);
    const c = Math.max(0, Math.min(6, lane.cls));
    const p = paths[c]!;
    p.moveTo(lane.pts[0]!, lane.pts[1]!);
    for (let i = 2; i < lane.pts.length; i += 2) p.lineTo(lane.pts[i]!, lane.pts[i + 1]!);
    widths[c] = Math.max(widths[c]!, lane.width);
  }
  const layers = { paths, widths };
  roadLayers.set(game, layers);
  return layers;
};

const polylineLength = (r: Float32Array) => {
  let total = 0;
  for (let i = 2; i < r.length; i += 2) total += Math.hypot(r[i]! - r[i - 2]!, r[i + 1]! - r[i - 1]!);
  return total;
};

/**
 * The city map: the whole town, north up, with its real places. Drag to
 * move, pinch or scroll to zoom, tap a road or a place (or a quick pick) to
 * see the way there, then "Nenda" to ride it with the arrow, the minimap and
 * chevrons on the road. The ride waits while the map is open.
 */
export function CityMap({ game, cityName, onClose }: { game: Game; cityName: string; onClose: () => void }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ cx: 0, cz: 0, k: 1 });
  const icons = useRef<{ sx: number; sy: number; sign: Sign }[]>([]);
  const targetRef = useRef<Target | null>(null);
  const frame = useRef(0);
  const [target, setTarget] = useState<Target | null>(null);
  const [trip, setTrip] = useState(() => navHud.pin);

  const kindLabel = useCallback((kind: PoiKind) => (t.missions.poi as Record<string, string>)[kind] ?? "", [t]);

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = el.clientWidth, H = el.clientHeight;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
    }
    const { cx, cz, k } = view.current;
    const sx = (x: number) => W / 2 + (x - cx) * k;
    const sy = (z: number) => H / 2 + (z - cz) * k;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1E1714";
    ctx.fillRect(0, 0, W, H);

    // Roads in world units: a dark casing under the big roads, then every class, biggest on top.
    const { paths, widths } = roadsFor(game);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 - cx * k), dpr * (H / 2 - cz * k));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0E0B0A";
    for (let c = 3; c >= 0; c--) {
      ctx.lineWidth = Math.max(widths[c]!, 2 / k) + 2.4 / k;
      ctx.stroke(paths[c]!);
    }
    for (let c = 6; c >= 0; c--) {
      ctx.strokeStyle = ROAD_COLORS[c]!;
      ctx.lineWidth = Math.max(widths[c]!, (c <= 2 ? 2.2 : 1.3) / k);
      ctx.stroke(paths[c]!);
    }

    // The trip being ridden, and the way to the place just tapped.
    const stroke = (r: Float32Array | null, color: string, px: number, dash: number[] = []) => {
      if (!r || r.length < 4) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = px / k;
      ctx.setLineDash(dash.map((d) => d / k));
      ctx.beginPath();
      ctx.moveTo(r[0]!, r[1]!);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i]!, r[i + 1]!);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const current = targetRef.current;
    stroke(navHud.pinRoute, "rgba(56,189,248,0.45)", 5);
    if (current) {
      stroke(current.route, "#0E0B0A", 8.5);
      stroke(current.route, TRIP, 5.5);
    }

    // Places: the big ones always, smaller ones as you zoom in; names when close enough to read.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const atlas = placeAtlas();
    const drawn: { sx: number; sy: number; sign: Sign }[] = [];
    const taken: [number, number, number, number][] = [];
    const minRank = k > 1.4 ? 0 : k > 0.7 ? 1 : k > 0.25 ? 2 : 3;
    const signs = [...(game.places?.signs ?? [])].sort((a, b) => PLACE_STYLE[b.kind].rank - PLACE_STYLE[a.kind].rank);
    ctx.font = '700 12px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif';
    ctx.textBaseline = "middle";
    for (const s of signs) {
      const rank = PLACE_STYLE[s.kind].rank;
      if (rank < minRank) continue;
      const x = sx(s.x), y = sy(s.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const size = rank >= 3 ? 22 : 17;
      // Keep icons from piling on top of each other when zoomed out.
      if (drawn.some((d) => Math.abs(d.sx - x) < size * 0.8 && Math.abs(d.sy - y) < size * 0.8)) continue;
      const [ax, ay, cell] = atlasCell(s.poi.k);
      ctx.drawImage(atlas, ax, ay, cell, cell, x - size / 2, y - size / 2, size, size);
      drawn.push({ sx: x, sy: y, sign: s });
      if (k > 0.55 && rank >= 2 && s.poi.n) {
        const label = s.poi.n.length > 26 ? `${s.poi.n.slice(0, 25)}…` : s.poi.n;
        const w = ctx.measureText(label).width;
        const box: [number, number, number, number] = [x + size / 2 + 2, y - 8, w + 10, 16];
        if (taken.some(([bx, by, bw, bh]) => box[0] < bx + bw && box[0] + box[2] > bx && box[1] < by + bh && box[1] + box[3] > by)) continue;
        taken.push(box);
        ctx.fillStyle = "rgba(16,19,26,0.78)";
        ctx.beginPath();
        ctx.roundRect(box[0], box[1], box[2], box[3], 8);
        ctx.fill();
        ctx.fillStyle = "#FFF6E5";
        ctx.fillText(label, box[0] + 5, y + 0.5);
      }
    }
    icons.current = drawn;

    // Pins: the trip's end, then the tapped place on top.
    if (navHud.pin && (!current || Math.hypot(current.x - navHud.pin.x, current.z - navHud.pin.z) > 2)) {
      ctx.globalAlpha = 0.6;
      drawPin(ctx, sx(navHud.pin.x), sy(navHud.pin.z), 1.2);
      ctx.globalAlpha = 1;
    }
    if (current) drawPin(ctx, sx(current.x), sy(current.z), 1.55);

    // The rider: an arrow along the boda's heading, with a soft halo.
    const b = game.bike.state;
    const rx = sx(b.x), ry = sy(b.z);
    ctx.fillStyle = "rgba(255,199,44,0.22)";
    ctx.beginPath();
    ctx.arc(rx, ry, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(-b.heading);
    ctx.fillStyle = "#FFC72C";
    ctx.strokeStyle = "#10131A";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(9, 9);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [game]);

  const redraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // Open centred on the rider, about 700 m across; the ride waits while the map is up.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const b = game.bike.state;
    view.current = { cx: b.x, cz: b.z, k: Math.min(el.clientWidth, el.clientHeight) / 700 };
    game.setPaused(true);
    const ro = new ResizeObserver(redraw);
    ro.observe(el);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame.current);
      game.setPaused(false);
    };
  }, [game, onClose, redraw]);

  useEffect(() => {
    targetRef.current = target;
    redraw();
  }, [target, redraw]);

  /** Zoom by `f` keeping the world point under (x, y) still. */
  const zoomAt = useCallback(
    (x: number, y: number, f: number) => {
      const el = canvas.current!;
      const v = view.current;
      const W = el.clientWidth, H = el.clientHeight;
      const wx = v.cx + (x - W / 2) / v.k, wz = v.cz + (y - H / 2) / v.k;
      v.k = Math.min(MAX_K, Math.max(MIN_K, v.k * f));
      v.cx = wx - (x - W / 2) / v.k;
      v.cz = wz - (y - H / 2) / v.k;
      redraw();
    },
    [redraw],
  );

  /** Show the way to (x, z) and frame it with the rider. */
  const choose = useCallback(
    (x: number, z: number, label: string, sub: string, kind: PoiKind | null, frameIt = false) => {
      const route = game.planRoute(x, z);
      const length = route ? polylineLength(route) : 0;
      setTarget({ x, z, label, sub: route ? sub : t.nav.noRoute, kind, route, length });
      if (frameIt && canvas.current) {
        const b = game.bike.state;
        const el = canvas.current;
        const span = Math.max(Math.abs(x - b.x), Math.abs(z - b.z), 120);
        view.current = { cx: (x + b.x) / 2, cz: (z + b.z) / 2 + span * 0.12, k: Math.min(MAX_K, Math.max(MIN_K, (Math.min(el.clientWidth, el.clientHeight) * 0.38) / span)) };
      }
    },
    [game, t],
  );

  const tapAt = (x: number, y: number) => {
    // A place icon under the finger wins; otherwise the nearest point on a road.
    let best: { sign: Sign; d: number } | null = null;
    for (const ic of icons.current) {
      const d = Math.hypot(ic.sx - x, ic.sy - y);
      if (d < 22 && (!best || d < best.d)) best = { sign: ic.sign, d };
    }
    if (best) {
      const s = best.sign;
      choose(s.x, s.z, s.poi.n ?? kindLabel(s.kind), [kindLabel(s.kind), s.poi.b].filter(Boolean).join(" · "), s.kind);
      return;
    }
    const el = canvas.current!;
    const v = view.current;
    const wx = v.cx + (x - el.clientWidth / 2) / v.k, wz = v.cz + (y - el.clientHeight / 2) / v.k;
    const snap = game.snapToRoad(wx, wz);
    if (!snap) return;
    // Name the spot after the nearest named place, if there's one close by.
    let near: Sign | null = null, nearD = 90;
    for (const s of game.places?.signs ?? []) {
      const d = Math.hypot(s.x - snap.x, s.z - snap.z);
      if (s.poi.n && d < nearD) {
        near = s;
        nearD = d;
      }
    }
    choose(snap.x, snap.z, t.nav.pinned, near ? fmt(t.nav.near, { place: near.poi.n! }) : "", null);
  };

  const quick = (kinds: PoiKind[]) => {
    const b = game.bike.state;
    let best: Sign | null = null, bestD = Infinity;
    for (const s of game.places?.signs ?? []) {
      if (!kinds.includes(s.kind)) continue;
      const d = Math.hypot(s.x - b.x, s.z - b.z);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) choose(best.x, best.z, best.poi.n ?? kindLabel(best.kind), [kindLabel(best.kind), best.poi.b].filter(Boolean).join(" · "), best.kind, true);
  };

  // Gestures: one finger pans, two pinch, a short still touch taps; the wheel zooms.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, at: 0, pinch: 0 });
  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: 0, at: performance.now(), pinch: 0 };
    else gesture.current.moved = 99;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    const ps = [...pointers.current.values()];
    if (pointers.current.size === 1) {
      const v = view.current;
      v.cx -= (p.x - prev.x) / v.k;
      v.cz -= (p.y - prev.y) / v.k;
      gesture.current.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
      pointers.current.set(e.pointerId, p);
      redraw();
    } else if (ps.length === 2) {
      const other = ps.find((q) => q !== prev)!;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      pointers.current.set(e.pointerId, p);
      if (before > 4) zoomAt((p.x + other.x) / 2, (p.y + other.y) / 2, after / before);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && gesture.current.moved < 8 && performance.now() - gesture.current.at < 500) tapAt(p.x, p.y);
  };

  const zoomButton = (f: number) => {
    const el = canvas.current;
    if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, f);
  };
  const recenter = () => {
    const b = game.bike.state;
    view.current.cx = b.x;
    view.current.cz = b.z;
    redraw();
  };

  const minutes = target ? Math.max(1, Math.round(target.length / CITY_SPEED / 60)) : 0;
  const style = target?.kind ? PLACE_STYLE[target.kind] : null;
  const TargetIcon = target?.kind ? (KIND_ICON[target.kind] ?? Building2) : MapPin;

  if (typeof document === "undefined") return null;
  return createPortal(
    <m.div
      className="fixed inset-0 z-40 flex flex-col bg-night text-cream select-none"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label={fmt(t.nav.mapTitle, { city: cityName })}
    >
      <canvas
        ref={canvas}
        className="absolute inset-0 size-full touch-none cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onWheel={(e) => {
          const p = local(e);
          zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
        }}
      />

      {/* Header: close, the town's name, and the quick picks. */}
      <div className="safe-top safe-x pointer-events-none relative flex flex-col gap-2 bg-gradient-to-b from-night/90 via-night/60 to-transparent pb-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label={t.common.close} className="pointer-events-auto grid size-11 place-items-center rounded-2xl bg-night-600/95 ring-1 ring-white/10 transition-colors hover:bg-night-500">
            <X className="size-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg leading-tight font-extrabold">{fmt(t.nav.mapTitle, { city: cityName })}</h2>
            <p className="truncate text-xs text-cream/60">{t.nav.mapHint}</p>
          </div>
        </div>
        <div className="pointer-events-auto -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {QUICK.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => quick(q.kinds)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-night-600/95 py-1.5 pr-3.5 pl-2 font-display text-sm font-bold ring-1 ring-white/10 transition-colors hover:bg-night-500 [&_svg]:size-4"
            >
              <span className="grid size-6 place-items-center rounded-full text-night" style={{ background: PLACE_STYLE[q.kinds[0]!].color }}>
                {q.icon}
              </span>
              {t.nav.quick[q.key]}
            </button>
          ))}
        </div>
      </div>

      {/* Zoom and "where am I". */}
      <div className="safe-x pointer-events-none absolute top-1/2 right-0 flex -translate-y-1/2 flex-col gap-2">
        <ToolButton label={t.nav.zoomIn} onClick={() => zoomButton(1.6)}>
          <Plus />
        </ToolButton>
        <ToolButton label={t.nav.zoomOut} onClick={() => zoomButton(1 / 1.6)}>
          <Minus />
        </ToolButton>
        <ToolButton label={t.nav.recenter} onClick={recenter}>
          <LocateFixed />
        </ToolButton>
      </div>

      {/* The chosen place, or the trip being ridden. */}
      <div className="safe-x safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
        {target ? (
          <m.div
            key={`${target.x},${target.z}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-3xl bg-night-700/95 p-3.5 shadow-2xl ring-1 ring-white/10 backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-night" style={{ background: style?.color ?? TRIP }}>
                <TargetIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg leading-tight font-extrabold">{target.label}</p>
                {target.sub && <p className="truncate text-sm text-cream/60">{target.sub}</p>}
              </div>
              <button type="button" onClick={() => setTarget(null)} aria-label={t.common.close} className="grid size-9 shrink-0 place-items-center rounded-xl text-cream/60 transition-colors hover:bg-white/8 hover:text-cream">
                <X className="size-4" />
              </button>
            </div>
            {target.route && (
              <div className="flex items-center gap-3">
                <p className="font-display text-2xl font-extrabold text-sky-300 tabular">{formatDistance(target.length)}</p>
                <p className="font-display text-base font-bold text-cream/60 tabular">· {fmt(t.nav.eta, { min: minutes })}</p>
                <Button
                  variant="sky"
                  icon={<Navigation />}
                  className="ml-auto"
                  onClick={() => {
                    // A dropped pin is named after what's near it ("Karibu na …") on the arrow.
                    game.setDestination({ x: target.x, z: target.z, label: target.kind ? target.label : target.sub || target.label });
                    onClose();
                  }}
                >
                  {t.nav.go}
                </Button>
              </div>
            )}
          </m.div>
        ) : trip ? (
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-3xl bg-night-700/95 p-3 shadow-2xl ring-1 ring-sky/40 backdrop-blur">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky text-night">
              <Navigation className="size-5" />
            </span>
            <p className="min-w-0 flex-1 truncate font-display font-extrabold">{fmt(t.nav.tripTo, { place: trip.label })}</p>
            <Button
              variant="night"
              onClick={() => {
                game.setDestination(null);
                setTrip(null);
                redraw();
              }}
            >
              {t.nav.stopTrip}
            </Button>
          </div>
        ) : null}
      </div>
    </m.div>,
    document.body,
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="pointer-events-auto grid size-11 place-items-center rounded-2xl bg-night-600/95 shadow-lg ring-1 ring-white/10 transition-colors hover:bg-night-500 [&_svg]:size-5">
      {children}
    </button>
  );
}
