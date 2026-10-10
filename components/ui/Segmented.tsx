"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  size?: "sm" | "md";
  /** Stretch across the row; on phones the options share the width (labels only, no icons) instead of overflowing. */
  fill?: boolean;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md", fill = false }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("rounded-2xl bg-night-700 p-1 ring-1 ring-white/10", fill ? "flex w-full max-w-full" : "inline-flex")}>
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
              size === "md" ? "min-h-11 px-4 text-base" : "min-h-10 px-3 text-sm",
              fill ? "min-w-0 flex-1 max-sm:px-1 max-sm:text-[0.8125rem] max-sm:tracking-tight max-sm:[&_svg]:hidden" : size === "md" ? "min-w-16" : "min-w-12",
              active ? "bg-sun text-night shadow-[0_3px_0_0_var(--color-sun-800)]" : "text-cream/75 hover:text-cream",
            )}
          >
            {o.icon}
            <span className={cn("pt-[0.1em]", fill && "truncate")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
