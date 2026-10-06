"use client";

import { useEffect, useRef } from "react";
import type { Game } from "@/game/core/Game";
import { navHud } from "@/game/core/hud";
import { missionHud } from "@/game/missions/MissionRunner";
import { PLACE_STYLE, atlasCell, placeAtlas } from "@/game/world/places";
import { POI_KINDS } from "@/game/world/format";
import { policeHud } from "@/game/traffic/Police";
import { useSettings } from "@/stores/settings";

const SIZE = 168;
const RANGE = 150;
const ROAD_COLORS = ["#F2D184", "#E8D9B0", "#D8CBB0", "#B9AE9C", "#9A9285", "#8A6F5A", "#6E6458"];
const STOP_COLORS = { pickup: "#FFC72C", dropoff: "#2ED47A", checkpoint: "#FF5A4F", photo: "#00A3DD", buy: "#F59E0B" } as const;
const vehicles: number[] = [];

/** Rotating minimap (heading up) drawn on a canvas at ~12 Hz. */
export function Minimap({ game }: { game: Game }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = useSettings((s) => s.hudScale);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    const ctx = el.getContext("2d")!;
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 80) return;
      last = now;
      const b = game.bike.state;
      const k = SIZE / 2 / RANGE;
      const sin = Math.sin(b.heading);
      const cos = Math.cos(b.heading);
      // World → map: rotate so the rider's forward points up.
      const tx = (x: number, z: number): [number, number] => {
        const dx = x - b.x;
        const dz = z - b.z;
        const right = dx * cos - dz * sin;
        const fwd = -dx * sin - dz * cos;
        return [SIZE / 2 + right * k, SIZE / 2 - fwd * k];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#2A1F1C";
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Roads, biggest last so they sit on top.
      ctx.lineCap = "round";
      const byClass: [number, number, number, number, number][][] = Array.from({ length: 7 }, () => []);
      game.index.forEachRoad(b.x, b.z, RANGE * 1.1, (r, i) => {
        const [x1, y1] = tx(r[i]!, r[i + 1]!);
        const [x2, y2] = tx(r[i + 2]!, r[i + 3]!);
        byClass[r[i + 5]!]?.push([x1, y1, x2, y2, r[i + 4]!]);
      });
      for (let c = 6; c >= 0; c--) {
        ctx.strokeStyle = ROAD_COLORS[c]!;
        for (const [x1, y1, x2, y2, hw] of byClass[c]!) {
          ctx.lineWidth = Math.max(1.5, hw * 2 * k);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      // The drive to a sheli, under the job route.
      const fuelRoute = navHud.fuelRoute;
      if (fuelRoute && fuelRoute.length >= 4) {
        ctx.strokeStyle = "#FF5A4F";
        ctx.lineWidth = 3.5;
        ctx.lineJoin = "round";
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        for (let i = 0; i < fuelRoute.length; i += 2) {
          const [x, y] = tx(fuelRoute[i]!, fuelRoute[i + 1]!);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Route.
      const route = missionHud.route;
      if (route && route.length >= 4) {
        ctx.strokeStyle = "#FFC72C";
        ctx.lineWidth = 3.5;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < route.length; i += 2) {
          const [x, y] = tx(route[i]!, route[i + 1]!);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Real places: important ones across the map, everything else close by.
      const atlas = placeAtlas();
      for (const s of game.places?.signs ?? []) {
        const d = Math.hypot(s.x - b.x, s.z - b.z);
        const rank = PLACE_STYLE[s.kind].rank;
        if (d > RANGE * 1.05 || (rank < 2 && d > RANGE * 0.45) || (rank < 1 && d > RANGE * 0.25)) continue;
        const [x, y] = tx(s.x, s.z);
        const size = rank >= 3 ? 15 : 11;
        const [sx, sy, cell] = atlasCell(s.poi.k);
        ctx.drawImage(atlas, sx, sy, cell, cell, x - size / 2, y - size / 2, size, size);
      }
      for (const c of game.checkpoints?.points ?? []) {
        const [x, y] = tx(c.x, c.z);
        ctx.fillStyle = "#0D3B66";
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Traffic police with speed guns, and the pursuit pickup (flashing, pinned to the rim when far).
      const [px, py, pc] = atlasCell(POI_KINDS.indexOf("police"));
      for (const trap of game.police?.points ?? []) {
        const [x, y] = tx(trap.x, trap.z);
        ctx.drawImage(atlas, px, py, pc, pc, x - 7, y - 7, 14, 14);
      }
      if (game.police?.chasing) {
        let [x, y] = tx(policeHud.px, policeHud.pz);
        const dx = x - SIZE / 2, dy = y - SIZE / 2;
        const d = Math.hypot(dx, dy);
        if (d > SIZE / 2 - 9) {
          x = SIZE / 2 + (dx / d) * (SIZE / 2 - 9);
          y = SIZE / 2 + (dy / d) * (SIZE / 2 - 9);
        }
        ctx.fillStyle = Math.floor(now / 250) % 2 ? "#FF2D3A" : "#2D6BFF";
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Traffic.
      ctx.fillStyle = "rgba(255, 246, 229, 0.75)";
      if (game.traffic) game.traffic.positions(vehicles);
      else vehicles.length = 0;
      for (let i = 0; i < vehicles.length; i += 2) {
        const [x, y] = tx(vehicles[i]!, vehicles[i + 1]!);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }

      // Target (clamped to the rim when off-map).
      if (missionHud.active) {
        let [x, y] = tx(missionHud.targetX, missionHud.targetZ);
        const dx = x - SIZE / 2, dy = y - SIZE / 2;
        const d = Math.hypot(dx, dy);
        const max = SIZE / 2 - 10;
        if (d > max) {
          x = SIZE / 2 + (dx / d) * max;
          y = SIZE / 2 + (dy / d) * max;
        }
        ctx.fillStyle = STOP_COLORS[missionHud.stopKind];
        ctx.strokeStyle = "#10131A";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // The sheli being driven to, pinned to the rim when off the map.
      if (fuelRoute && fuelRoute.length >= 2) {
        let [x, y] = tx(fuelRoute[fuelRoute.length - 2]!, fuelRoute[fuelRoute.length - 1]!);
        const dx = x - SIZE / 2, dy = y - SIZE / 2;
        const d = Math.hypot(dx, dy);
        const max = SIZE / 2 - 11;
        if (d > max) {
          x = SIZE / 2 + (dx / d) * max;
          y = SIZE / 2 + (dy / d) * max;
        }
        const [fx, fy, fc] = atlasCell(POI_KINDS.indexOf("fuel"));
        ctx.fillStyle = "#10131A";
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(atlas, fx, fy, fc, fc, x - 9, y - 9, 18, 18);
      }
      ctx.restore();

      // Compass: true north (map −z) on the rim, so the map's turn with the rider stays readable.
      {
        const [nx, ny] = tx(b.x, b.z - 1000);
        const dx = nx - SIZE / 2, dy = ny - SIZE / 2;
        const d = Math.hypot(dx, dy) || 1;
        const cx = SIZE / 2 + (dx / d) * (SIZE / 2 - 10), cy = SIZE / 2 + (dy / d) * (SIZE / 2 - 10);
        ctx.fillStyle = "#10131A";
        ctx.strokeStyle = "#FF5A4F";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#FFF6E5";
        ctx.font = "800 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("N", cx, cy + 0.5);
      }

      // Rider arrow.
      ctx.fillStyle = "#FFC72C";
      ctx.strokeStyle = "#10131A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(SIZE / 2, SIZE / 2 - 9);
      ctx.lineTo(SIZE / 2 + 6.5, SIZE / 2 + 7);
      ctx.lineTo(SIZE / 2, SIZE / 2 + 3.5);
      ctx.lineTo(SIZE / 2 - 6.5, SIZE / 2 + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      // Smaller on portrait phones, where it shares the width with the rider's stack.
      className="pointer-events-none size-(--mm) rounded-full shadow-xl max-sm:size-28 short:size-28"
      style={{ "--mm": `${SIZE * Math.min(scale, 1.1)}px` } as React.CSSProperties}
    />
  );
}
