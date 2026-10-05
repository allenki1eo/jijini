"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  size?: "sm" | "md";
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-2xl bg-night-700 p-1 ring-1 ring-white/10">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl font-display font-bold transition-colors duration-150 [&_svg]:size-4",
              size === "md" ? "min-h-11 min-w-16 px-4 text-base" : "min-h-10 min-w-12 px-3 text-sm",
              active ? "bg-sun text-night shadow-[0_3px_0_0_var(--color-sun-800)]" : "text-cream/75 hover:text-cream",
            )}
          >
            {o.icon}
            <span className="pt-[0.1em]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
