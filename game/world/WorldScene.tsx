"use client";

import { CITIES, type CityId } from "@/data/cities/config";
import type { QualityPreset } from "@/game/core/quality";
import { useWorld } from "@/stores/world";
import { CameraRig } from "./CameraRig";
import { CityChunks } from "./CityChunks";
import { ChunkGridOverlay, NavGraphOverlay } from "./DebugOverlays";
import { ENV } from "./environment";
import type { CityManifest } from "./format";
import { SkyDome } from "./SkyDome";
import { StatsProbe } from "./StatsProbe";

interface WorldSceneProps {
  cityId: CityId;
  manifest: CityManifest;
  baseUrl: string;
  preset: QualityPreset;
}

export function WorldScene({ cityId, manifest, baseUrl, preset }: WorldSceneProps) {
  const mode = useWorld((s) => s.cameraMode);
  const showNavGraph = useWorld((s) => s.showNavGraph);
  const showChunkGrid = useWorld((s) => s.showChunkGrid);
  const loadedKeys = useWorld((s) => s.loadedKeys);
  const sun = ENV.sunDirection;

  return (
    <>
      <color attach="background" args={[ENV.horizon]} />
      <fog attach="fog" args={[ENV.fog, preset.fogNear, preset.fogFar]} />
      <hemisphereLight args={[ENV.hemiSky, ENV.hemiGround, 1.9]} />
      <directionalLight color={ENV.sun} intensity={2.4} position={[sun.x * 100, sun.y * 100, sun.z * 100]} />

      <SkyDome skyline={CITIES[cityId].skyline} />
      <CityChunks manifest={manifest} baseUrl={baseUrl} radius={preset.loadRadius} />
      {showNavGraph && <NavGraphOverlay baseUrl={baseUrl} />}
      {showChunkGrid && <ChunkGridOverlay manifest={manifest} loadedKeys={loadedKeys} />}

      <CameraRig mode={mode} manifest={manifest} />
      <StatsProbe />
    </>
  );
}
