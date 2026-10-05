import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "night" | "sun" | "forest" | "sky" | "coral" | "cream";

const TONES: Record<Tone, string> = {
  night: "bg-night-700/90 text-cream ring-white/10",
  sun: "bg-sun text-night ring-sun-300",
  forest: "bg-forest text-cream ring-forest-400/60",
  sky: "bg-sky text-night ring-sky-300",
  coral: "bg-coral text-cream ring-coral-700",
  cream: "bg-cream text-night ring-cream-400",
};

interface ChipProps {
  icon?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}

export function Chip({ icon, tone = "night", size = "md", className, children }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-display font-bold leading-none ring-1 backdrop-blur",
        size === "md" ? "h-10 px-3.5 text-base [&_svg]:size-[1.1rem]" : "h-6 px-2.5 text-xs [&_svg]:size-3.5",
        TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="pt-[0.1em]">{children}</span>
    </span>
  );
}
