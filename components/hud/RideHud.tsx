"use client";

import { AnimatePresence, m } from "motion/react";
import { BarChart3, Crosshair, CloudFog, CloudRain, Fuel, Grid3x3, Map as MapIcon, MapPin, Moon, Pause, PhoneCall, Plane, Route, Sun, Video } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Chip, IconButton, Segmented } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import { hud } from "@/game/core/hud";
import { setHour, setWeather } from "@/game/systems/environment";
import type { CityManifest } from "@/game/world/format";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSettings } from "@/stores/settings";
import { useWorld, type CameraMode } from "@/stores/world";
import { CheckpointPrompt, ClockChip, useSkillToasts } from "./LifeHud";
import { PoliceBanner } from "./PoliceHud";
import { RadioChip } from "./RadioHud";
import { SpeedLines, useHaptics } from "./Juice";
import { PauseMenu } from "./PauseMenu";
import { Speedometer } from "./Speedometer";
import { StatsPanel } from "./StatsPanel";
import { ToastStack } from "./ToastStack";
import { TouchControls } from "./TouchControls";
import { useHudTick } from "./useHudTick";
import { VirtualJoystick } from "./VirtualJoystick";

const coarseQuery = "(pointer: coarse)";
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(coarseQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
export const useTouchDevice = () => useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);

function FuelWarning() {
  useHudTick(4);
  const t = useT();
  if (!hud.outOfFuel) return null;
  return (
    <div className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 font-display font-bold text-cream shadow-lg">
      <Fuel className="size-5" /> {t.ride.outOfFuel}
    </div>
  );
}

interface RideHudProps {
  game: Game;
  manifest: CityManifest;
  /** Mission tracker, minimap, etc. (later phases). */
  children?: ReactNode;
  topCenter?: ReactNode;
  topRight?: ReactNode;
  pauseExtra?: ReactNode;
  onRestart?: () => void;
  /** Hide the keyboard hint (e.g. while the tutorial talks). */
  quiet?: boolean;
}

/** In-game overlay: speedometer, touch controls, pause, toasts and the debug tools. */
export function RideHud({ game, manifest, children, topCenter, topRight, pauseExtra, onRestart, quiet }: RideHudProps) {
  const t = useT();
  const w = useWorld();
  const touch = useTouchDevice();
  const scale = useSettings((s) => s.hudScale);
  const cameraView = useSettings((s) => s.cameraView);
  const setSetting = useSettings((s) => s.set);
  const [paused, setPaused] = useState(false);
  const [showKeys, setShowKeys] = useState(true);
  useSkillToasts();
  useHaptics();

  useEffect(() => {
    game.setPaused(paused);
  }, [game, paused]);

  useEffect(() => {
    game.setPauseHandler(() => setPaused((p) => !p));
    const onHide = () => document.hidden && setPaused(true);
    document.addEventListener("visibilitychange", onHide);
    const id = window.setTimeout(() => setShowKeys(false), 9000);
    return () => {
      game.setPauseHandler(null);
      document.removeEventListener("visibilitychange", onHide);
      window.clearTimeout(id);
    };
  }, [game]);

  const riding = w.cameraMode === "ride";

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none" style={{ fontSize: `${scale * 100}%` }}>
      <SpeedLines />
      <div className="safe-top safe-x flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <IconButton label={t.ride.pause} icon={<Pause />} onClick={() => setPaused(true)} />
          <Chip icon={<MapPin className="text-coral" />} className="hidden lg:inline-flex">
            {manifest.name}
          </Chip>
          <ClockChip />
          <RadioChip />
        </div>
        <div className="flex flex-1 justify-center">{topCenter}</div>
        <div className="pointer-events-auto flex items-start gap-2">
          <div className="flex flex-col gap-2">
            <IconButton
              label={t.ride.camera}
              icon={<Video />}
              active={cameraView === "fpv"}
              onClick={() => setSetting("cameraView", cameraView === "chase" ? "fpv" : "chase")}
            />
            <IconButton label={t.world.debug} icon={<BarChart3 />} active={w.showStats} onClick={() => w.set({ showStats: !w.showStats })} />
          </div>
          {topRight}
        </div>
      </div>

      <div className="absolute inset-x-0 top-20 flex flex-col items-center gap-2">
        <CheckpointPrompt />
        <PoliceBanner />
        <ToastStack />
        <FuelWarning />
      </div>

      {w.showStats && (
        <div className="safe-x pointer-events-auto absolute top-20 left-0 flex flex-col items-start gap-2">
          <StatsPanel manifest={manifest} />
          <div className="flex flex-wrap gap-2">
            <Segmented<CameraMode>
              size="sm"
              label={t.world.mode}
              value={w.cameraMode}
              onChange={(v) => w.set({ cameraMode: v })}
              options={[
                { value: "ride", label: "Boda", icon: <Video /> },
                { value: "map", label: t.world.modeMap, icon: <MapIcon /> },
                { value: "fly", label: t.world.modeFly, icon: <Plane /> },
              ]}
            />
            <IconButton label={t.world.navgraph} icon={<Route />} active={w.showNavGraph} onClick={() => w.set({ showNavGraph: !w.showNavGraph })} />
            <IconButton label={t.world.chunkGrid} icon={<Grid3x3 />} active={w.showChunkGrid} onClick={() => w.set({ showChunkGrid: !w.showChunkGrid })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton label={t.life.weather.sunny} icon={<Sun />} onClick={() => (setHour(13), setWeather("sunny"))} />
            <IconButton label={t.life.night} icon={<Moon />} onClick={() => setHour(21)} />
            <IconButton label={t.life.weather.rain} icon={<CloudRain />} onClick={() => setWeather("rain")} />
            <IconButton label={t.life.weather.haze} icon={<CloudFog />} onClick={() => setWeather("haze")} />
            <IconButton label={t.world.teleport} icon={<Crosshair />} onClick={() => game.debugJumpToTarget()} />
            <IconButton label={t.world.ringPhone} icon={<PhoneCall />} onClick={() => game.phone?.ring()} />
          </div>
        </div>
      )}

      {children}

      {riding && (
        <>
          <div className={cn("absolute bottom-3 left-1/2 -translate-x-1/2", touch && "bottom-auto top-[calc(env(safe-area-inset-top)+4.5rem)] scale-75 short:top-14")}>
            <Speedometer />
          </div>
          {touch && <TouchControls />}
          <AnimatePresence>
            {!touch && showKeys && !quiet && (
              <m.p
                className="absolute bottom-48 left-1/2 -translate-x-1/2 rounded-full bg-night/75 px-4 py-2 text-center font-display text-sm font-semibold text-cream/90 backdrop-blur"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {t.ride.keysHint}
              </m.p>
            )}
          </AnimatePresence>
        </>
      )}

      {touch && w.cameraMode === "fly" && (
        <div className="safe-bottom pointer-events-auto absolute bottom-6 left-8">
          <VirtualJoystick label={t.world.modeFly} />
        </div>
      )}

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className={cn(
          "pointer-events-auto absolute bottom-0 px-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-[11px] text-night/80 [text-shadow:0_0_6px_rgb(255_246_229/0.9)]",
          touch ? "left-1/2 -translate-x-1/2" : "right-0",
        )}
      >
        {t.world.attribution}
      </a>

      <div className="pointer-events-auto">
        <PauseMenu open={paused} onResume={() => setPaused(false)} onRestart={onRestart} extra={pauseExtra} />
      </div>
    </div>
  );
}
