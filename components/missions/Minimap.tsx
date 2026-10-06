"use client";

import { useEffect, useRef } from "react";
import type { Game } from "@/game/core/Game";
import { missionHud } from "@/game/missions/MissionRunner";
import { useSettings } from "@/stores/settings";

const SIZE = 168;
const RANGE = 150;
const ROAD_COLORS = ["#F2D184", "#E8D9B0", "#D8CBB0", "#B9AE9C", "#9A9285", "#8A6F5A", "#6E6458"];
const STOP_COLORS = { pickup: "#FFC72C", dropoff: "#2ED47A", checkpoint: "#FF5A4F", photo: "#00A3DD" } as const;
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

      // Fuel stations and checkpoints.
      for (const [sx, sz] of game.stations) {
        const [x, y] = tx(sx, sz);
        ctx.fillStyle = "#00A3DD";
        ctx.beginPath();
        ctx.roundRect(x - 5, y - 5, 10, 10, 3);
        ctx.fill();
        ctx.fillStyle = "#FFF6E5";
        ctx.fillRect(x - 2, y - 3, 4, 6);
      }
      for (const c of game.checkpoints?.points ?? []) {
        const [x, y] = tx(c.x, c.z);
        ctx.fillStyle = "#0D3B66";
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
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
      ctx.restore();

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
      className="pointer-events-none rounded-full shadow-xl short:scale-75 short:origin-top-right"
      style={{ width: SIZE * Math.min(scale, 1.1), height: SIZE * Math.min(scale, 1.1) }}
    />
  );
}
