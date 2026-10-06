"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SkylineKind } from "@/data/cities/config";
import { env, envUniforms } from "@/game/systems/environment";
import { BACKDROP } from "./environment";

const SKY_RADIUS = 1900;
const HILLS_RADIUS = 1450;

/** Angular sectors (radians, 0 = east, +π/2 = south) where the horizon is open water. */
const WATER_SECTORS: Partial<Record<SkylineKind, [number, number]>> = {
  lake: [Math.PI * 0.8, Math.PI * 1.75],
  ocean: [-Math.PI * 0.5, Math.PI * 0.2],
};

export const inWaterSector = (kind: SkylineKind, a: number) => {
  const sector = WATER_SECTORS[kind];
  if (!sector) return false;
  const norm = (v: number) => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const [from, to] = sector;
  const x = norm(a - from);
  return x <= norm(to - from);
};

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
/** Kibo's snowfields start this far up the backdrop (fraction of its height scale). */
const SNOWLINE = 2.5;
const SNOW = new THREE.Color("#F4F7FB");

/** Skyline height at angle `a` (0..2π), in units of the backdrop's height. North is a ≈ 3π/2. */
const skylineHeight = (kind: SkylineKind, a: number) => {
  // Layered sines make a natural, seamless skyline; spikes become boulder clusters.
  let h = 0.45 + 0.25 * Math.sin(a * 3 + 1.3) + 0.18 * Math.sin(a * 7 + 0.4) + 0.12 * Math.sin(a * 17 + 2.1);
  h += Math.max(0, Math.sin(a * 11 + 0.7)) ** 6 * 0.5;
  if (kind === "meru") h += Math.exp(-(((a - 4.5) * 3) ** 2)) * 2.2;
  if (kind === "kilimanjaro") {
    // Kibo's broad, flat-topped dome to the north-north-east, with jagged Mawenzi on its shoulder.
    const kibo = Math.exp(-(((a - 4.95) * 1.5) ** 4));
    h = h * (1 - kibo * 0.6) + kibo * 3.6 + Math.exp(-(((a - 5.55) * 9) ** 2)) * 1.1;
  }
  // Mbeya sits in a bowl: ridges all round, Loleza and Mbeya Peak towering to the north.
  if (kind === "highlands") h += 0.55 + 0.3 * Math.sin(a * 2 + 0.8) + Math.exp(-(((a - 4.6) * 3.5) ** 2)) * 1.3;
  // Open water: just the far shore (lake) or a flat sea horizon (ocean).
  if (inWaterSector(kind, a)) h = kind === "lake" ? 0.1 + 0.06 * Math.sin(a * 9) : 0.015;
  return Math.max(h, 0.1);
};

const hillsGeometry = (kind: SkylineKind) => {
  const { near, far, height } = BACKDROP[kind];
  const steps = 200;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const top = new THREE.Color(near);
  const bottom = new THREE.Color(near).multiplyScalar(0.85);
  const farTop = new THREE.Color(far);
  // Three vertices per step (foot, snowline, summit) so snow caps get a crisp edge.
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const h = skylineHeight(kind, a);
    const x = Math.cos(a) * HILLS_RADIUS;
    const z = Math.sin(a) * HILLS_RADIUS;
    const peak = inWaterSector(kind, a) && kind === "ocean" ? new THREE.Color("#6E9FB8") : top.clone().lerp(farTop, (Math.sin(a * 2) + 1) / 4);
    const snowy = kind === "kilimanjaro" && h > SNOWLINE;
    const mid = snowy ? SNOWLINE + (h - SNOWLINE) * 0.15 * (1 + Math.sin(a * 40)) : h;
    const summit = snowy ? SNOW : peak;
    positions.push(x, -30, z, x, mid * height, z, x, h * height, z);
    colors.push(bottom.r, bottom.g, bottom.b, peak.r, peak.g, peak.b, summit.r, summit.g, summit.b);
    if (i < steps) {
      const b = i * 3;
      index.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Colors here are already linear (THREE.Color), so skip the sRGB patch for this attribute.
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return g;
};

/** World-fixed water between the city's edge and the horizon, in the open-water sector. */
export function HorizonWater({ skyline, material }: { skyline: SkylineKind; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const sector = WATER_SECTORS[skyline];
    if (!sector) return null;
    const [from, to] = sector;
    const span = (((to - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // RingGeometry measures angles counter-clockwise in its local XY; after rotating onto the ground, y maps to -z.
    return new THREE.RingGeometry(830, 2000, 48, 1, -from - span, span).rotateX(-Math.PI / 2).translate(0, 0.12, 0);
  }, [skyline]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} />;
}

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
