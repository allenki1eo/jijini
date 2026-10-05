"use client";

import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-9 w-16 shrink-0 rounded-full ring-1 transition-colors duration-200",
        checked ? "bg-forest ring-forest-400" : "bg-night-600 ring-white/10",
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 size-7 rounded-full shadow-md transition-transform duration-200 ease-[var(--ease-spring)]",
          checked ? "translate-x-7 bg-sun" : "translate-x-0 bg-cream-400",
        )}
      />
    </button>
  );
}
