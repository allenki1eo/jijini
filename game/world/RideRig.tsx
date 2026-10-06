"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";
import type { Game } from "@/game/core/Game";

/** Mounts the rider and ticks the whole simulation once per frame. */
export function RideRig({ game, active }: { game: Game; active: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useEffect(() => {
    game.riding = active;
    if (!active) return;
    camera.near = 0.3;
    camera.updateProjectionMatrix();
    game.chase.snap();
  }, [game, camera, active]);

  useFrame((_, dt) => game.update(dt, camera));

  return <primitive object={game.root} />;
}
