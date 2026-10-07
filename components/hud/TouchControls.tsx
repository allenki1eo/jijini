"use client";

import { ChevronsUp, Megaphone, OctagonMinus, TrendingUp, Zap } from "lucide-react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { touch } from "@/game/core/controls";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { vibrate } from "@/lib/device";
import { useSettings } from "@/stores/settings";

type HoldKey = "throttle" | "brake" | "boost" | "wheelie" | "horn";

/** A press-and-hold control bound to one touch input. */
function Hold({ name, label, icon, className, onPress }: { name: HoldKey; label: string; icon: ReactNode; className: string; onPress?: () => void }) {
  const haptics = useSettings((s) => s.haptics);
  const set = (on: boolean) => {
    if (name === "throttle" || name === "brake") touch[name] = on ? 1 : 0;
    else touch[name] = on;
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("pointer-events-auto grid touch-none place-items-center select-none active:scale-95 active:brightness-110 [&_svg]:size-7", className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
        onPress?.();
        vibrate(12, haptics);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
}

const STEER_RANGE = 70;

/** Horizontal thumb pad for steering. */
function SteerPad({ label }: { label: string }) {
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const origin = useRef(0);
  const move = (x: number) => {
    const dx = Math.max(-STEER_RANGE, Math.min(STEER_RANGE, x - origin.current));
    touch.steer = dx / STEER_RANGE;
    if (knob.current) knob.current.style.transform = `translateX(${dx}px)`;
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    touch.steer = 0;
    if (knob.current) knob.current.style.transform = "translateX(0)";
  };
  return (
    <div
      role="application"
      aria-label={label}
      className="pointer-events-auto relative flex h-28 w-60 max-w-full touch-none items-center justify-center rounded-full bg-night/45 ring-2 ring-white/15 backdrop-blur-sm short:h-24 short:w-52"
      onPointerDown={(e) => {
        if (active.current !== null) return;
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = r.left + r.width / 2;
        move(e.clientX);
      }}
      onPointerMove={(e) => e.pointerId === active.current && move(e.clientX)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="pointer-events-none absolute left-5 text-2xl font-bold text-cream/30">‹</span>
      <span className="pointer-events-none absolute right-5 text-2xl font-bold text-cream/30">›</span>
      <div ref={knob} className="pointer-events-none size-20 rounded-full bg-cream shadow-[0_4px_0_0_var(--color-cream-400),0_10px_20px_-6px_rgb(0_0_0/0.6)] short:size-16" />
    </div>
  );
}

/** On-screen controls: steering pad on one side, pedals and actions on the other. */
export function TouchControls() {
  const t = useT();
  const leftHanded = useSettings((s) => s.leftHanded);
  const autoThrottle = useSettings((s) => s.autoThrottle);
  const tilt = useSettings((s) => s.tiltSteer);

  // Horn and wheelie sit small above the steering thumb, at the screen edge, so the
  // middle of the screen (where the rider is) stays clear on narrow phones.
  const extras = (
    <div className={cn("flex gap-2.5", leftHanded && "flex-row-reverse")}>
      <Hold name="horn" label={t.ride.horn} icon={<Megaphone />} className="size-12 rounded-full bg-night-600/85 text-sun ring-2 ring-white/15 [&_svg]:size-5" />
      <Hold name="wheelie" label={t.ride.wheelie} icon={<TrendingUp />} className="size-12 rounded-full bg-night-600/85 text-cream ring-2 ring-white/15 [&_svg]:size-5" />
    </div>
  );
  const steer = (
    <div className={cn("flex min-w-0 flex-col gap-3", leftHanded ? "items-end" : "items-start")}>
      {extras}
      {!tilt && <SteerPad label={t.ride.steer} />}
    </div>
  );
  const pedals = (
    <div className={cn("flex items-end gap-3", leftHanded && "flex-row-reverse")}>
      <div className="flex flex-col gap-3">
        <Hold name="brake" label={t.ride.brake} icon={<OctagonMinus />} className="h-20 w-32 rounded-[1.4rem] bg-coral text-cream shadow-[0_5px_0_0_var(--color-coral-700)] short:h-16" />
      </div>
      <div className="flex flex-col gap-3">
        <Hold name="boost" label={t.ride.boost} icon={<Zap />} className="size-14 self-center rounded-full bg-sky text-night shadow-[0_4px_0_0_var(--color-sky-700)]" />
        {!autoThrottle && (
          <Hold name="throttle" label={t.ride.throttle} icon={<ChevronsUp />} className="h-36 w-24 rounded-[1.6rem] bg-sun text-night shadow-[0_6px_0_0_var(--color-sun-800)] short:h-28" />
        )}
      </div>
    </div>
  );

  return (
    <div className="safe-x safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between pb-3">
      {leftHanded ? pedals : steer}
      {leftHanded ? steer : pedals}
    </div>
  );
}
