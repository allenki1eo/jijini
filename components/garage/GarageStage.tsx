"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { MonitorX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { BikeId } from "@/game/vehicles/bikes";
import { BikeModel } from "@/game/vehicles/BikeModel";
import { useT } from "@/i18n";
import { hasWebGL } from "@/lib/webgl";
import type { Customization } from "@/stores/player";

const IDLE = {
  x: 0,
  z: 0,
  heading: 0,
  speed: 0,
  slip: 0,
  lean: 0,
  pitch: 0,
  steerAngle: -0.25,
  boost: 1,
  fuel: 1,
  damage: 0,
  stumble: 0,
  surface: "tarmac" as const,
  odometer: 0,
  lateralG: 0,
  longitudinalG: 0,
  wheelieMeters: 0,
  drifting: false,
};

/** Soft spotlight floor with a kitenge-colored rim. */
const floorTexture = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "#3A4256");
  g.addColorStop(0.7, "#1D222D");
  g.addColorStop(1, "rgba(16,19,26,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const colors = ["#FFC72C", "#0B6E4F", "#FF5A4F", "#00A3DD"];
  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = colors[i % 4]!;
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

function Bike({ bike, custom }: { bike: BikeId; custom: Customization }) {
  const model = useMemo(() => new BikeModel(), []);
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => model.setBike(bike, custom), [model, bike, custom]);
  useFrame((_, dt) => model.update(IDLE, dt));
  return <primitive object={model.root} />;
}

function Floor() {
  const texture = useMemo(() => floorTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
      <circleGeometry args={[2.6, 48]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

/** Turntable showroom for the selected bike. Without WebGL the shop still works; the stage just says why it's empty. */
export default function GarageStage({ bike, custom }: { bike: BikeId; custom: Customization }) {
  const t = useT();
  const [webgl] = useState(hasWebGL);
  if (!webgl)
    return (
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <p className="flex max-w-xs flex-col items-center gap-2 text-sm text-cream/60">
          <MonitorX className="size-8 text-sky-300" />
          {t.crash.webglTitle}
        </p>
      </div>
    );
  return (
    <Canvas className="!absolute inset-0" dpr={[1, 2]} camera={{ fov: 32, position: [4.2, 2.1, 4.4] }}>
      <hemisphereLight args={["#FFF1D6", "#2A2030", 1.6]} />
      <directionalLight position={[3, 5, 2]} intensity={2.6} color="#FFE7BF" />
      <directionalLight position={[-4, 2, -3]} intensity={1.2} color="#7FB8FF" />
      <Floor />
      <Bike bike={bike} custom={custom} />
      <OrbitControls target={[0, 0.75, 0]} enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={1.4} minPolarAngle={0.9} maxPolarAngle={1.45} />
    </Canvas>
  );
}
