"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { QualityPreset } from "@/game/core/quality";
import { env } from "@/game/systems/environment";

/** Applies time of day and weather to fog, background and lights every frame. */
export function EnvironmentRig({ preset }: { preset: QualityPreset }) {
  const scene = useThree((s) => s.scene);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    scene.fog = new THREE.Fog(env.fog.clone(), preset.fogNear, preset.fogFar);
    scene.background = env.horizon.clone();
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, preset]);

  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(env.fog);
      fog.near = preset.fogNear * env.fogScale;
      fog.far = preset.fogFar * (0.4 + 0.6 * env.fogScale);
    }
    (scene.background as THREE.Color | null)?.copy(env.horizon);
    if (hemi.current) {
      hemi.current.color.copy(env.hemiSky);
      hemi.current.groundColor.copy(env.hemiGround);
      hemi.current.intensity = env.hemiIntensity;
    }
    if (sun.current) {
      sun.current.color.copy(env.sun);
      sun.current.intensity = env.sunIntensity;
      sun.current.position.copy(env.sunDirection).multiplyScalar(100);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={sun} />
    </>
  );
}
