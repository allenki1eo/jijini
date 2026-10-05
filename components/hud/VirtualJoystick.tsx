"use client";

import { useRef, type PointerEvent } from "react";
import { analogInput } from "@/game/core/input";
import { cn } from "@/lib/cn";

const RADIUS = 46;

/** Thumb stick that writes straight into analogInput (no React state per move). */
export function VirtualJoystick({ className, label }: { className?: string; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const apply = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy);
    const k = len > RADIUS ? RADIUS / len : 1;
    const x = dx * k;
    const y = dy * k;
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`;
    analogInput.move.x = x / RADIUS;
    analogInput.move.y = -y / RADIUS;
  };

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const r = base.current!.getBoundingClientRect();
    apply(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };

  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    apply(0, 0);
  };

  return (
    <div
      ref={base}
      role="application"
      aria-label={label}
      className={cn("relative grid size-36 touch-none place-items-center rounded-full bg-night/45 ring-2 ring-white/15 backdrop-blur-sm", className)}
      onPointerDown={(e) => {
        if (active.current !== null) return;
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
        track(e);
      }}
      onPointerMove={(e) => e.pointerId === active.current && track(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="pointer-events-none absolute inset-6 rounded-full ring-1 ring-white/10" />
      <div ref={knob} className="pointer-events-none size-16 rounded-full bg-sun shadow-[0_4px_0_0_var(--color-sun-800),0_10px_20px_-6px_rgb(0_0_0/0.6)]" />
    </div>
  );
}
