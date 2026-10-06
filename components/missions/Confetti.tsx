"use client";

import { m } from "motion/react";
import { useMemo } from "react";

const COLORS = ["#FFC72C", "#0B6E4F", "#00A3DD", "#FF5A4F", "#FFF6E5"];

/** A short burst of kitenge-colored confetti. Pure CSS transforms, ~40 pieces. */
export function Confetti({ pieces = 42 }: { pieces?: number }) {
  // Seeded per mount; purely decorative.
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const r = (n: number) => {
          const s = Math.sin((i + 1) * 12.9898 * n) * 43758.5453;
          return s - Math.floor(s);
        };
        return { x: r(1) * 100, drift: (r(2) - 0.5) * 30, delay: r(3) * 0.35, spin: (r(4) - 0.5) * 720, color: COLORS[i % COLORS.length]!, w: 6 + r(5) * 6, h: 10 + r(6) * 8 };
      }),
    [pieces],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bits.map((b, i) => (
        <m.span
          key={i}
          className="absolute top-0 rounded-[2px]"
          style={{ left: `${b.x}%`, width: b.w, height: b.h, background: b.color }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: 520, x: b.drift * 4, rotate: b.spin, opacity: 0 }}
          transition={{ duration: 1.9, delay: b.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
