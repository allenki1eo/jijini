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
import { CompactDash } from "./CompactDash";
import { PoliceBanner } from "./PoliceHud";
import { RadioChip } from "./RadioHud";
import { SpeedLines, useHaptics } from "./Juice";
import { NavArrow } from "./NavArrow";
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

const narrowQuery = "(max-width: 639px)";
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(narrowQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Portrait phones: the HUD stacks into one column beside the minimap instead of spreading across the top. */
export const useNarrowScreen = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);

const shortQuery = "(max-height: 480px)";
const subscribeShort = (cb: () => void) => {
  const mq = window.matchMedia(shortQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Landscape phones (same breakpoint as the `short:` CSS variant). */
export const useShortScreen = () => useSyncExternalStore(subscribeShort, () => window.matchMedia(shortQuery).matches, () => false);

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
  /** Right-hand column under the top bar (minimap, jobs button). */
  rail?: ReactNode;
  /** Above the notification feed at the left edge (incoming calls, passenger chat). */
  topLeft?: ReactNode;
  pauseExtra?: ReactNode;
  onRestart?: () => void;
  /** Hide the keyboard hint (e.g. while the tutorial talks). */
  quiet?: boolean;
  /**
   * Panels for where the rider has stopped (a fare to agree, the stage queue, a
   * sheli, a bank, a photo spot). Mid-left on big screens; on portrait phones
   * they take the place of the arrow and the dash (the bike is stopped anyway),
   * keeping the middle of the screen, and the rider, clear.
   */
  context?: ReactNode;
  contextOpen?: boolean;
}

/** In-game overlay: speedometer, touch controls, pause, toasts and the debug tools. */
export function RideHud({ game, manifest, children, topCenter, topRight, rail, topLeft, pauseExtra, onRestart, quiet, context, contextOpen }: RideHudProps) {
  const t = useT();
  const w = useWorld();
  const touch = useTouchDevice();
  const narrow = useNarrowScreen();
  const short = useShortScreen();
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
      {/*
        The top of the screen is laid out in flow, not absolutely, so nothing can sit on top of anything else:
        the bar, then (on phones) the job card, then a row with the rider's stack on the left and the minimap rail on the right.
      */}
      <div className="safe-top safe-x absolute inset-x-0 top-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-1.5 sm:gap-3">
          <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <IconButton label={t.ride.pause} icon={<Pause />} onClick={() => setPaused(true)} />
            <span className="hidden lg:inline-flex">
              <Chip icon={<MapPin className="text-coral" />}>{manifest.name}</Chip>
            </span>
            <ClockChip />
            <RadioChip compact={narrow || touch} />
          </div>
          {!narrow && <div className="flex min-w-0 flex-1 justify-center">{topCenter}</div>}
          <div className="pointer-events-auto flex shrink-0 items-start gap-1.5 sm:gap-2">
            {!touch && (
              <IconButton
                label={t.ride.camera}
                icon={<Video />}
                active={cameraView === "fpv"}
                onClick={() => setSetting("cameraView", cameraView === "chase" ? "fpv" : "chase")}
              />
            )}
            {/* Developer tools stay out of the players' way. */}
            {process.env.NODE_ENV === "development" && !narrow && (
              <IconButton label={t.world.debug} icon={<BarChart3 />} active={w.showStats} onClick={() => w.set({ showStats: !w.showStats })} />
            )}
            {topRight}
          </div>
        </div>

        {narrow && topCenter && <div className="flex justify-center [&>*]:w-full [&>*]:max-w-none">{topCenter}</div>}

        <div className={cn("grid items-start gap-2", narrow ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]")}>
          {/* Left: on phones the whole rider stack; elsewhere just notifications, out of the line of sight. */}
          <div className="flex min-w-0 flex-col items-start gap-2">
            {narrow && contextOpen && <div className="pointer-events-auto flex w-full flex-col gap-2">{context}</div>}
            {narrow && riding && !contextOpen && <NavArrow />}
            {narrow && riding && touch && !contextOpen && <CompactDash />}
            {narrow && (
              <>
                <CheckpointPrompt />
                <PoliceBanner />
                <FuelWarning />
              </>
            )}
            {topLeft}
            <ToastStack />
          </div>
          {!narrow && (
            <div className="flex flex-col items-center gap-2">
              {/* Landscape phones: a stop panel takes the middle (where the bike is stopped anyway) instead of the left edge, where the steering thumb and horn live. */}
              {short && contextOpen ? (
                <div className="pointer-events-auto flex w-[22rem] max-w-[calc(100vw-28rem)] flex-col gap-2">{context}</div>
              ) : (
                riding && <NavArrow />
              )}
              {riding && touch && !short && <CompactDash />}
              <CheckpointPrompt />
              <PoliceBanner />
              <FuelWarning />
            </div>
          )}
          <div className="pointer-events-auto flex flex-col items-end gap-2 justify-self-end">
            {/* On landscape phones the jobs button sits beside the minimap, above the boost and throttle pads. */}
            <div className="flex flex-col items-end gap-2 short:flex-row-reverse short:items-start">{rail}</div>
            {touch && (
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="max-w-28 text-right text-[10px] leading-tight text-cream/70 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
                {t.world.attribution}
              </a>
            )}
          </div>
        </div>
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

      {!narrow && !short && <div className="safe-x pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 flex-col gap-2">{context}</div>}

      {children}

      {riding && (
        <>
          {!touch && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <Speedometer />
            </div>
          )}
          {touch && <TouchControls />}
          {/* Landscape phones: the dash sits low between the steering pad and the pedals, so the top of the screen shows the road ahead. */}
          {touch && short && !narrow && !contextOpen && (
            <div className="safe-bottom pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2">
              <CompactDash />
            </div>
          )}
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

      {!touch && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto absolute right-0 bottom-0 px-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-[11px] text-night/80 [text-shadow:0_0_6px_rgb(255_246_229/0.9)]"
        >
          {t.world.attribution}
        </a>
      )}

      <div className="pointer-events-auto">
        <PauseMenu open={paused} onResume={() => setPaused(false)} onRestart={onRestart} extra={pauseExtra} />
      </div>
    </div>
  );
}
