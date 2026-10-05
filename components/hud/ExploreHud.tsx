"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowLeft, BarChart3, Grid3x3, Map as MapIcon, MapPin, Maximize, Plane, Route } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Chip, IconButton, Segmented } from "@/components/ui";
import type { CityManifest } from "@/game/world/format";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { enterFullscreen } from "@/lib/device";
import { useSettings } from "@/stores/settings";
import { useWorld, type CameraMode } from "@/stores/world";
import { StatsPanel } from "./StatsPanel";
import { VirtualJoystick } from "./VirtualJoystick";

const HINT_MS = 7000;

const coarseQuery = "(pointer: coarse)";
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(coarseQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Overlay for the world explorer: navigation, camera mode, debug toggles and OSM attribution. */
export function ExploreHud({ manifest }: { manifest: CityManifest }) {
  const t = useT();
  const w = useWorld();
  const leftHanded = useSettings((s) => s.leftHanded);
  const touch = useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);
  const [hintFor, setHintFor] = useState<CameraMode | null>(w.cameraMode);

  useEffect(() => {
    const id = window.setTimeout(() => setHintFor(null), HINT_MS);
    return () => window.clearTimeout(id);
  }, [hintFor]);

  const setMode = (mode: CameraMode) => {
    w.set({ cameraMode: mode });
    setHintFor(mode);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <div className="safe-top safe-x flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            href="/"
            aria-label={t.world.exit}
            className="chunky grid size-12 place-items-center rounded-2xl bg-night-600/95 text-cream ring-1 ring-white/10 [--edge:var(--color-night)]"
          >
            <ArrowLeft className="size-6" />
          </Link>
          <Chip icon={<MapPin className="text-coral" />}>{manifest.name}</Chip>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <Segmented<CameraMode>
            size="sm"
            label={t.world.mode}
            value={w.cameraMode}
            onChange={setMode}
            options={[
              { value: "map", label: t.world.modeMap, icon: <MapIcon /> },
              { value: "fly", label: t.world.modeFly, icon: <Plane /> },
            ]}
          />
          <IconButton label={t.world.debug} icon={<BarChart3 />} active={w.showStats} onClick={() => w.set({ showStats: !w.showStats })} />
          <IconButton label={t.world.navgraph} icon={<Route />} active={w.showNavGraph} onClick={() => w.set({ showNavGraph: !w.showNavGraph })} />
          <IconButton label={t.world.chunkGrid} icon={<Grid3x3 />} active={w.showChunkGrid} onClick={() => w.set({ showChunkGrid: !w.showChunkGrid })} />
          <IconButton label={t.settings.fullscreen} icon={<Maximize />} onClick={() => void enterFullscreen()} />
        </div>
      </div>

      {w.showStats && (
        <div className="safe-x mt-3">
          <StatsPanel manifest={manifest} />
        </div>
      )}

      <div className="safe-bottom absolute inset-x-0 bottom-0 flex justify-center px-4">
        <AnimatePresence>
          {hintFor && (
            <m.p
              key={hintFor}
              className="rounded-full bg-night/75 px-4 py-2 text-center font-display text-sm font-semibold text-cream/90 backdrop-blur"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              {hintFor === "map" ? t.world.controlsMap : t.world.controlsFly}
            </m.p>
          )}
        </AnimatePresence>
      </div>

      {touch && w.cameraMode === "fly" && (
        <div className={cn("safe-bottom pointer-events-auto absolute bottom-6", leftHanded ? "right-8" : "left-8")}>
          <VirtualJoystick label={t.world.modeFly} />
        </div>
      )}

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className={cn(
          "safe-bottom pointer-events-auto absolute bottom-0 px-3 pb-1 text-[11px] text-night/80 [text-shadow:0_0_6px_rgb(255_246_229/0.9)]",
          leftHanded ? "left-0" : "right-0",
        )}
      >
        {t.world.attribution}
      </a>
    </div>
  );
}
