"use client";

import { CITIES, type CityId } from "@/data/cities/config";
import type { Game } from "@/game/core/Game";
import type { QualityPreset } from "@/game/core/quality";
import { useWorld } from "@/stores/world";
import { CameraRig } from "./CameraRig";
import { CityChunks } from "./CityChunks";
import { ChunkGridOverlay, NavGraphOverlay } from "./DebugOverlays";
import { EnvironmentRig } from "./EnvironmentRig";
import type { CityManifest } from "./format";
import { SkyDome } from "./SkyDome";
import { RideRig } from "./RideRig";
import { StatsProbe } from "./StatsProbe";

interface WorldSceneProps {
  cityId: CityId;
  manifest: CityManifest;
  baseUrl: string;
  preset: QualityPreset;
  game: Game;
}

export function WorldScene({ cityId, manifest, baseUrl, preset, game }: WorldSceneProps) {
  const mode = useWorld((s) => s.cameraMode);
  const showNavGraph = useWorld((s) => s.showNavGraph);
  const showChunkGrid = useWorld((s) => s.showChunkGrid);
  const loadedKeys = useWorld((s) => s.loadedKeys);

  return (
    <>
      <EnvironmentRig preset={preset} />

      <SkyDome skyline={CITIES[cityId].skyline} />
      <CityChunks manifest={manifest} baseUrl={baseUrl} radius={preset.loadRadius} index={game.index} skyline={CITIES[cityId].skyline} />
      {showNavGraph && <NavGraphOverlay baseUrl={baseUrl} />}
      {showChunkGrid && <ChunkGridOverlay manifest={manifest} loadedKeys={loadedKeys} />}

      <RideRig game={game} active={mode === "ride"} />
      {mode !== "ride" && <CameraRig mode={mode} manifest={manifest} />}
      <StatsProbe />
    </>
  );
}
