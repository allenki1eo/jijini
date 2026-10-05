import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  active?: boolean;
}

/** Round 48px control with an accessible label (icons alone are never the only cue). */
export function IconButton({ label, icon, active, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "chunky grid size-12 shrink-0 place-items-center rounded-2xl ring-1 [&_svg]:size-5",
        active ? "bg-sun text-night ring-sun-300 [--edge:var(--color-sun-800)]" : "bg-night-600/95 text-cream ring-white/10 [--edge:var(--color-night)]",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
