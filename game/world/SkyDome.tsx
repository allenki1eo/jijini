"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SkylineKind } from "@/data/cities/config";
import { BACKDROP, ENV } from "./environment";

const SKY_RADIUS = 1900;
const HILLS_RADIUS = 1450;

const skyMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(ENV.zenith) },
      uHorizon: { value: new THREE.Color(ENV.horizon) },
      uBelow: { value: new THREE.Color(ENV.below) },
      uSun: { value: new THREE.Color(ENV.sun) },
      uSunDir: { value: ENV.sunDirection.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uBelow, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 col = h > 0.0
          ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.65, h), 0.7))
          : mix(uHorizon, uBelow, smoothstep(0.0, -0.12, h));
        float s = max(dot(dir, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 2.5 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
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
  const bottom = new THREE.Color(ENV.horizon);
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
