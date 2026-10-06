"use client";

import { Canvas } from "@react-three/fiber";
import { AnimatePresence, m } from "motion/react";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GameHud } from "@/components/hud/GameHud";
import { LoadingScreen } from "@/components/screens/LoadingScreen";
import { Button, Card } from "@/components/ui";
import { CITIES, type CityId } from "@/data/cities/config";
import { Game } from "@/game/core/Game";
import { QUALITY_PRESETS } from "@/game/core/quality";
import { fmt, useT } from "@/i18n";
import { requestWakeLock } from "@/lib/device";
import { fetchJson } from "@/lib/fetchJson";
import { useSettings } from "@/stores/settings";
import { useWorld } from "@/stores/world";
import { streamFocus } from "./focus";
import type { CityManifest } from "./format";
import { WorldScene } from "./WorldScene";

/** The play screen: loads a baked city, creates the Game, renders the scene and HUD. */
export default function WorldView({ cityId, openBoard }: { cityId: CityId; openBoard?: boolean }) {
  const t = useT();
  const [game, setGame] = useState<Game | null>(null);
  const preset = QUALITY_PRESETS[useSettings((s) => s.quality)];
  const { manifest, status, error, progress, set, reset } = useWorld();
  const baseUrl = `/cities/${cityId}`;

  useEffect(() => {
    let cancelled = false;
    reset();
    fetchJson<CityManifest>(`${baseUrl}/manifest.json`)
      .then((m) => {
        if (cancelled) return;
        streamFocus.x = m.spawn.x;
        streamFocus.z = m.spawn.z;
        set({ manifest: m });
        const g = new Game(cityId, m, baseUrl);
        g.start().catch((e: Error) => !cancelled && set({ status: "error", error: e.message }));
        setGame((old) => {
          old?.dispose();
          return g;
        });
      })
      .catch((e: Error) => !cancelled && set({ status: "error", error: e.message }));
    return () => {
      cancelled = true;
      reset();
      setGame((old) => {
        old?.dispose();
        return null;
      });
    };
  }, [baseUrl, cityId, set, reset]);

  // The loading screen lifts once the first ring of chunks is in; later streaming is silent.
  useEffect(() => {
    if (status === "loading" && progress.total > 0 && progress.loaded >= progress.total) set({ status: "ready" });
  }, [status, progress, set]);

  useEffect(() => {
    let release: (() => void) | undefined;
    void requestWakeLock().then((r) => (release = r));
    return () => release?.();
  }, []);

  const city = CITIES[cityId];
  const offline = status === "error" && !navigator.onLine;
  const loadingProgress = manifest && progress.total ? 0.15 + 0.85 * (progress.loaded / progress.total) : 0.08;

  return (
    <div className="fixed inset-0 touch-none bg-night select-none">
      {manifest && game && (
        <Canvas
          className="!absolute inset-0"
          dpr={preset.dpr}
          flat
          gl={{ antialias: preset.antialias, powerPreference: "high-performance", stencil: false }}
          camera={{ fov: 60, near: 0.3, far: 2100, position: [manifest.spawn.x, 3, manifest.spawn.z + 6] }}
        >
          <WorldScene cityId={cityId} manifest={manifest} baseUrl={baseUrl} preset={preset} game={game} />
        </Canvas>
      )}

      {status === "ready" && manifest && game && <GameHud game={game} manifest={manifest} openBoardOnStart={openBoard} />}

      <AnimatePresence>
        {status === "loading" && (
          <m.div key="loading" className="fixed inset-0 z-40" exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <LoadingScreen
              progress={loadingProgress}
              status={fmt(t.world.loading, { city: city.name })}
              detail={progress.total ? fmt(t.world.chunks, { loaded: progress.loaded, total: progress.total }) : undefined}
            />
          </m.div>
        )}
      </AnimatePresence>

      {status === "error" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-night/80 p-6 backdrop-blur">
          <Card pattern className="w-full max-w-md p-6 text-center">
            <p className="font-display text-2xl font-bold">{t.world.error}</p>
            {offline && <p className="mt-2 text-cream/85">{t.world.errorOffline}</p>}
            <p className="mt-2 font-mono text-sm break-words text-cream/60">{error}</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/" className="chunky inline-flex min-h-12 items-center rounded-2xl bg-night-600 px-5 font-display font-bold [--edge:var(--color-night)]">
                {t.common.back}
              </Link>
              <Button variant="sun" icon={<RotateCcw />} onClick={() => window.location.reload()}>
                {t.common.retry}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
