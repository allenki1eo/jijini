"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SkylineKind } from "@/data/cities/config";
import { env, envUniforms } from "@/game/systems/environment";
import { BACKDROP } from "./environment";

const SKY_RADIUS = 1900;
const HILLS_RADIUS = 1450;

const skyMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // The env colors are mutated in place every frame, so the sky follows the clock for free.
    uniforms: {
      uZenith: { value: env.zenith },
      uHorizon: { value: env.horizon },
      uBelow: { value: env.below },
      uSun: { value: env.sun },
      uSunDir: { value: env.sunDirection },
      uNight: envUniforms.uNight,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uBelow, uSun, uSunDir;
      uniform float uNight;
      varying vec3 vDir;
      float starHash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 col = h > 0.0
          ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.65, h), 0.7))
          : mix(uHorizon, uBelow, smoothstep(0.0, -0.12, h));
        float s = max(dot(dir, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 2.5 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
        // Stars on clear nights (the moon's disc reuses the sun term above).
        vec3 grid = dir * 420.0;
        vec3 cell = floor(grid);
        float point = 1.0 - smoothstep(0.08, 0.28, length(fract(grid) - 0.5));
        float star = step(0.985, starHash(cell)) * point * smoothstep(0.05, 0.3, h) * (0.5 + 0.5 * starHash(cell + 3.1));
        col += vec3(0.9, 0.92, 1.0) * star * uNight * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

/** A ring of low hills on the horizon (Shinyanga's granite kopjes, Meru, etc.). */
const hillsGeometry = (kind: SkylineKind) => {
  const { near, far, height } = BACKDROP[kind];
  const steps = 160;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const top = new THREE.Color(near);
  const bottom = new THREE.Color(near).multiplyScalar(0.85);
  const farTop = new THREE.Color(far);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // Layered sines make a natural, seamless skyline; spikes become boulder clusters.
    let h = 0.45 + 0.25 * Math.sin(a * 3 + 1.3) + 0.18 * Math.sin(a * 7 + 0.4) + 0.12 * Math.sin(a * 17 + 2.1);
    h += Math.max(0, Math.sin(a * 11 + 0.7)) ** 6 * 0.5;
    if (kind === "meru") h += Math.exp(-(((a - 4.5) * 3) ** 2)) * 2.2;
    const x = Math.cos(a) * HILLS_RADIUS;
    const z = Math.sin(a) * HILLS_RADIUS;
    const peak = top.clone().lerp(farTop, (Math.sin(a * 2) + 1) / 4);
    positions.push(x, -30, z, x, Math.max(h, 0.1) * height, z);
    colors.push(bottom.r, bottom.g, bottom.b, peak.r, peak.g, peak.b);
    if (i < steps) {
      const b = i * 2;
      index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Colors here are already linear (THREE.Color), so skip the sRGB patch for this attribute.
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return g;
};

/** Sky dome + horizon backdrop that follow the camera so they always read as infinitely far. */
export function SkyDome({ skyline }: { skyline: SkylineKind }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const sky = useMemo(() => skyMaterial(), []);
  const hills = useMemo(() => hillsGeometry(skyline), [skyline]);
  const hillsMaterial = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }), []);

  useEffect(
    () => () => {
      sky.dispose();
      hills.dispose();
      hillsMaterial.dispose();
    },
    [sky, hills, hillsMaterial],
  );

  useFrame(() => {
    group.current?.position.set(camera.position.x, 0, camera.position.z);
    // Hills darken with the light and fade into rain or haze.
    const light = Math.min(1, env.hemiIntensity / 1.9);
    hillsMaterial.color.setScalar(0.25 + 0.75 * light).lerp(env.horizon, Math.max(env.rain, env.haze) * 0.6);
  });

  return (
    <group ref={group}>
      <mesh material={sky} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      </mesh>
      <mesh geometry={hills} material={hillsMaterial} renderOrder={-5} frustumCulled={false} />
    </group>
  );
}
