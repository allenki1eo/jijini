"use client";

import { MapControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { analogInput } from "@/game/core/input";
import type { CameraMode } from "@/stores/world";
import { streamFocus } from "./focus";
import type { CityManifest } from "./format";

const FLY_SPEED = 28;
const FLY_BOOST = 3.2;
const LOOK_SENSITIVITY = 0.0042;
const BOUNDS_MARGIN = 150;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, "YXZ");

interface CameraRigProps {
  mode: Exclude<CameraMode, "ride">;
  manifest: CityManifest;
}

/**
 * Debug cameras: a touch-friendly map camera (pan / pinch / rotate) and a
 * free-fly camera (WASD + drag-to-look, or the on-screen stick on phones).
 */
export function CameraRig({ mode, manifest }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const { bounds } = manifest;

  // Mode switches hand the view over without a jump.
  useEffect(() => {
    if (mode === "map") {
      const c = controls.current;
      if (!c) return;
      // Aim at whatever the camera was looking at (the rider, coming from ride mode).
      const dir = camera.getWorldDirection(forward);
      const t = dir.y < -0.05 ? Math.min(camera.position.y / -dir.y, 300) : 12;
      c.target.copy(camera.position).addScaledVector(dir, t).setY(0);
      camera.position.y = Math.max(camera.position.y, 40);
      c.update();
    } else {
      euler.setFromQuaternion(camera.quaternion, "YXZ");
      look.current = { yaw: euler.y, pitch: euler.x };
    }
  }, [mode, camera]);

  // Fly mode input: keyboard + pointer drag (the joystick writes analogInput directly).
  useEffect(() => {
    if (mode !== "fly") return;
    const pressed = keys.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.type === "keydown") pressed.add(e.code);
      else pressed.delete(e.code);
    };
    const clear = () => pressed.clear();
    let dragging: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      if (dragging !== null) return;
      dragging = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== dragging) return;
      look.current.yaw -= (e.clientX - lastX) * LOOK_SENSITIVITY;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - (e.clientY - lastY) * LOOK_SENSITIVITY, -1.45, 1.2);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === dragging) dragging = null;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clear);
    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clear);
      dom.removeEventListener("pointerdown", down);
      dom.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerup", up);
      dom.removeEventListener("pointercancel", up);
      pressed.clear();
    };
  }, [mode, dom]);

  useFrame((_, dt) => {
    if (mode === "map") {
      const t = controls.current?.target;
      if (!t) return;
      t.x = THREE.MathUtils.clamp(t.x, bounds.minX - BOUNDS_MARGIN, bounds.maxX + BOUNDS_MARGIN);
      t.z = THREE.MathUtils.clamp(t.z, bounds.minZ - BOUNDS_MARGIN, bounds.maxZ + BOUNDS_MARGIN);
      streamFocus.x = t.x;
      streamFocus.z = t.z;
      return;
    }
    const k = keys.current;
    const { yaw, pitch } = look.current;
    euler.set(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
    camera.getWorldDirection(forward);
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const ahead = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + analogInput.move.y;
    const side = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) + analogInput.move.x;
    const lift = (k.has("KeyE") || k.has("Space") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0);
    const speed = FLY_SPEED * (k.has("ShiftLeft") || k.has("ShiftRight") ? FLY_BOOST : 1) * dt;
    camera.position.addScaledVector(forward, ahead * speed).addScaledVector(right, side * speed);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y + lift * speed, 1.6, 500);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, bounds.minX - BOUNDS_MARGIN, bounds.maxX + BOUNDS_MARGIN);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, bounds.minZ - BOUNDS_MARGIN, bounds.maxZ + BOUNDS_MARGIN);
    streamFocus.x = camera.position.x;
    streamFocus.z = camera.position.z;
  });

  if (mode !== "map") return null;
  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={8}
      maxDistance={650}
      maxPolarAngle={1.36}
    />
  );
}
