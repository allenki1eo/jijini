"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useWorld } from "@/stores/world";
import { ChunkStreamer } from "./ChunkStreamer";
import { streamFocus } from "./focus";
import type { CityManifest } from "./format";
import { createWorldMaterials } from "./materials";
import { EARTH_COLOR } from "./palette";
import type { WorldIndex } from "./WorldIndex";

const FOCUS_INTERVAL = 0.25;

/** Endless red-earth plane under the city; fog hides its edge. */
const baseGround = () => {
  const g = new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2);
  const c = new THREE.Color(EARTH_COLOR);
  // The ground material decodes sRGB vertex colors, so store the sRGB values directly.
  const srgb = [c.r, c.g, c.b].map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => srgb).flat(), 3));
  return g;
};

interface CityChunksProps {
  manifest: CityManifest;
  baseUrl: string;
  radius: number;
  index?: WorldIndex;
}

export function CityChunks({ manifest, baseUrl, radius, index }: CityChunksProps) {
  const scene = useThree((s) => s.scene);
  const materials = useMemo(() => createWorldMaterials(), []);
  const ground = useMemo(() => baseGround(), []);
  const streamer = useRef<ChunkStreamer | null>(null);
  const sinceFocus = useRef(0);
  const setWorld = useWorld((s) => s.set);

  useEffect(
    () => () => {
      materials.dispose();
      ground.dispose();
    },
    [materials, ground],
  );

  useEffect(() => {
    const s = new ChunkStreamer(
      manifest,
      baseUrl,
      materials,
      radius,
      (p) => setWorld({ progress: { loaded: p.loaded, total: p.total }, loadedKeys: p.keys }),
      (message) => setWorld({ status: "error", error: message }),
      index,
    );
    scene.add(s.root);
    streamer.current = s;
    s.update(streamFocus.x, streamFocus.z);
    return () => {
      scene.remove(s.root);
      s.dispose();
      streamer.current = null;
    };
    // The radius is applied live below; recreating the streamer for it would reload every chunk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, baseUrl, materials, scene, setWorld, index]);

  useEffect(() => streamer.current?.setRadius(radius), [radius]);

  useFrame((_, dt) => {
    streamer.current?.tick();
    sinceFocus.current += dt;
    if (sinceFocus.current >= FOCUS_INTERVAL) {
      sinceFocus.current = 0;
      streamer.current?.update(streamFocus.x, streamFocus.z);
    }
  });

  return <mesh geometry={ground} material={materials.ground} position-y={-0.02} matrixAutoUpdate={false} />;
}
