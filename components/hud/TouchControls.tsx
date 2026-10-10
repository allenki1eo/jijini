"use client";

import { ChevronsUp, Megaphone, OctagonMinus, TrendingUp, Zap } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { touch } from "@/game/core/controls";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { vibrate } from "@/lib/device";
import { useSettings } from "@/stores/settings";
import { useWorld } from "@/stores/world";

type HoldKey = "boost" | "wheelie" | "horn";
type Pedal = "throttle" | "brake";

/** A press-and-hold control bound to one touch input. */
function Hold({ name, label, icon, className, onPress }: { name: HoldKey; label: string; icon: ReactNode; className: string; onPress?: () => void }) {
  const haptics = useSettings((s) => s.haptics);
  const set = (on: boolean) => {
    touch[name] = on;
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

/**
 * Throttle and brake share one gesture: a thumb that lands on either pedal can
 * slide across to the other without lifting (like rolling off the gas onto the
 * brake). Each finger is tracked on its own, so two thumbs work too.
 */
function usePedals() {
  const haptics = useSettings((s) => s.haptics);
  const fingers = useRef(new Map<number, Pedal | null>());
  const [down, setDown] = useState<{ throttle: boolean; brake: boolean }>({ throttle: false, brake: false });

  const sync = () => {
    let throttle = false;
    let brake = false;
    for (const p of fingers.current.values()) {
      if (p === "throttle") throttle = true;
      if (p === "brake") brake = true;
    }
    touch.throttle = throttle ? 1 : 0;
    touch.brake = brake ? 1 : 0;
    setDown((d) => (d.throttle === throttle && d.brake === brake ? d : { throttle, brake }));
  };

  // Never leave a pedal stuck down when the controls go away.
  useEffect(
    () => () => {
      fingers.current.clear();
      touch.throttle = 0;
      touch.brake = 0;
    },
    [],
  );

  const pedalAt = (x: number, y: number): Pedal | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-pedal]");
    return (el?.dataset.pedal as Pedal | undefined) ?? null;
  };

  const release = (e: PointerEvent) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.delete(e.pointerId);
    sync();
  };

  return {
    down,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        const pedal = (e.target as HTMLElement).closest<HTMLElement>("[data-pedal]");
        if (!pedal) return; // boost and friends handle themselves
        pedal.setPointerCapture(e.pointerId);
        fingers.current.set(e.pointerId, pedal.dataset.pedal as Pedal);
        vibrate(12, haptics);
        sync();
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (!fingers.current.has(e.pointerId)) return;
        const now = pedalAt(e.clientX, e.clientY);
        if (now === fingers.current.get(e.pointerId)) return;
        fingers.current.set(e.pointerId, now);
        if (now) vibrate(8, haptics);
        sync();
      },
      onPointerUp: release,
      onPointerCancel: release,
    },
  };
}

function PedalButton({ pedal, label, icon, on, className }: { pedal: Pedal; label: string; icon: ReactNode; on: boolean; className: string }) {
  return (
    <button
      type="button"
      data-pedal={pedal}
      aria-label={label}
      aria-pressed={on}
      className={cn("pointer-events-auto grid touch-none place-items-center transition-transform duration-75 select-none [&_svg]:size-7", on && "scale-95 brightness-110", className)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
}

const STEER_MAX = 70;
const STEER_MIN = 48;
const KNOB = 80;

/**
 * Horizontal thumb pad for steering. Steering is measured from where the thumb
 * lands, so a thumb that lands off-centre doesn't jerk the bars; the knob jumps
 * under the thumb to show it.
 */
function SteerPad({ label }: { label: string }) {
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const origin = useRef(0);
  const base = useRef(0);
  const range = useRef(STEER_MAX);
  const travel = useRef(0);
  const place = (px: number) => {
    if (knob.current) knob.current.style.transform = `translateX(${Math.max(-travel.current, Math.min(travel.current, px))}px)`;
  };
  const move = (x: number) => {
    const dx = Math.max(-range.current, Math.min(range.current, x - origin.current));
    touch.steer = dx / range.current;
    place(base.current + dx);
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    touch.steer = 0;
    place(0);
  };
  useEffect(
    () => () => {
      touch.steer = 0;
    },
    [],
  );
  return (
    <div
      role="application"
      aria-label={label}
      className="pointer-events-auto relative flex h-28 w-60 max-w-full min-w-36 touch-none items-center justify-center rounded-full bg-night/45 ring-2 ring-white/15 backdrop-blur-sm short:h-24 short:w-52"
      onPointerDown={(e) => {
        if (active.current !== null) return;
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        const knobSize = knob.current?.offsetWidth ?? KNOB;
        travel.current = Math.max(12, (r.width - knobSize) / 2 + 6);
        range.current = Math.max(STEER_MIN, Math.min(STEER_MAX, r.width * 0.42));
        origin.current = e.clientX;
        base.current = e.clientX - (r.left + r.width / 2);
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
  // While Mzee Juma (or a story character) talks, the small round buttons step aside so they can't cover the card's buttons.
  const talking = useWorld((s) => s.dialogue);
  const pedals = usePedals();

  // Horn and wheelie sit small above the steering thumb, at the screen edge, so the
  // middle of the screen (where the rider is) stays clear on narrow phones.
  const extras = (
    <div className={cn("flex gap-2.5 transition-opacity", leftHanded && "flex-row-reverse", talking && "invisible opacity-0")}>
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
  const pedalGroup = (
    <div className={cn("flex shrink-0 items-end gap-3", leftHanded && "flex-row-reverse")} {...pedals.handlers}>
      <div className="flex flex-col gap-3">
        <PedalButton
          pedal="brake"
          label={t.ride.brake}
          icon={<OctagonMinus />}
          on={pedals.down.brake}
          className="h-20 w-32 rounded-[1.4rem] bg-coral text-cream shadow-[0_5px_0_0_var(--color-coral-700)] max-sm:w-24 short:h-16"
        />
      </div>
      <div className="flex flex-col gap-3">
        <Hold
          name="boost"
          label={t.ride.boost}
          icon={<Zap />}
          className={cn("size-14 self-center rounded-full bg-sky text-night shadow-[0_4px_0_0_var(--color-sky-700)] transition-opacity", talking && "invisible opacity-0")}
        />
        {!autoThrottle && (
          <PedalButton
            pedal="throttle"
            label={t.ride.throttle}
            icon={<ChevronsUp />}
            on={pedals.down.throttle}
            className="h-36 w-24 rounded-[1.6rem] bg-sun text-night shadow-[0_6px_0_0_var(--color-sun-800)] short:h-28"
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="safe-x safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 pb-3">
      {leftHanded ? pedalGroup : steer}
      {leftHanded ? steer : pedalGroup}
    </div>
  );
}
