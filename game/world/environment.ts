import * as THREE from "three";
import type { SkylineKind } from "@/data/cities/config";

/** Afternoon lighting and sky palette shared by sky dome, fog and lights. */
export const ENV = {
  zenith: "#3E8DD3",
  horizon: "#F1D9B5",
  below: "#C99F7B",
  fog: "#E9D3B4",
  sun: "#FFE7BF",
  hemiSky: "#DCEBFF",
  hemiGround: "#B9805C",
  /** Normalized direction towards the sun (west-south-west, ~36° up). */
  sunDirection: new THREE.Vector3(-0.62, 0.59, 0.52).normalize(),
} as const;

/** Distant backdrop silhouette colors per skyline kind. */
export const BACKDROP: Record<SkylineKind, { near: string; far: string; height: number }> = {
  savanna: { near: "#8E9B8C", far: "#AEB8B6", height: 70 },
  meru: { near: "#7E8FA3", far: "#A4B3C4", height: 260 },
  lake: { near: "#8FA29A", far: "#B4C3C4", height: 45 },
  ocean: { near: "#9AA79C", far: "#BCC6C4", height: 30 },
};
