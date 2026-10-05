"use client";

import { useEffect, useState } from "react";
import { renderStats } from "@/game/core/stats";
import { makeProjector } from "@/game/world/projection";
import type { CityManifest } from "@/game/world/format";
import { fmt, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useWorld } from "@/stores/world";

const POLL_MS = 500;

/** Small live readout of performance against the budget (60 FPS, < 150 draws, < 300k tris). */
export function StatsPanel({ manifest }: { manifest: CityManifest }) {
  const t = useT();
  const [s, setS] = useState({ ...renderStats });
  const progress = useWorld((w) => w.progress);
  const loaded = useWorld((w) => w.loadedKeys.length);

  useEffect(() => {
    const id = window.setInterval(() => setS({ ...renderStats }), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const { unproject } = makeProjector(manifest.origin.lat, manifest.origin.lon);
  const ll = unproject(s.x, s.z);
  const rows: [string, string, boolean][] = [
    [t.world.fps, String(s.fps), s.fps >= 50],
    [t.world.draws, String(s.drawCalls), s.drawCalls < 150],
    [t.world.tris, `${(s.triangles / 1000).toFixed(0)}k`, s.triangles < 300_000],
    [fmt(t.world.chunks, { loaded, total: manifest.chunks.length }), `${progress.loaded}/${progress.total}`, true],
  ];

  return (
    <div className="pointer-events-auto w-56 rounded-2xl bg-night-800/88 p-3 font-display text-sm ring-1 ring-white/10 backdrop-blur">
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        {rows.map(([label, value, ok]) => (
          <div key={label} className="contents">
            <dt className="text-cream/65">{label}</dt>
            <dd className={cn("tabular text-right font-bold", ok ? "text-forest-400" : "text-coral")}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-white/8 pt-2 text-xs tabular text-cream/55">
        {s.x.toFixed(0)}, {s.z.toFixed(0)} m · {ll.lat.toFixed(5)}, {ll.lon.toFixed(5)}
      </p>
    </div>
  );
}
