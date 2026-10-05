import { cn } from "@/lib/cn";

type Tone = "sun" | "forest" | "sky" | "coral";

const FILL: Record<Tone, string> = {
  sun: "bg-sun",
  forest: "bg-forest-400",
  sky: "bg-sky",
  coral: "bg-coral",
};

interface MeterProps {
  /** 0..1 */
  value: number;
  label: string;
  tone?: Tone;
  /** Animated stripes while something is in progress. */
  busy?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function Meter({ value, label, tone = "sun", busy, showLabel, className }: MeterProps) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1.5 flex justify-between font-display text-sm font-semibold text-cream/80">
          <span>{label}</span>
          <span className="tabular">{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-3.5 overflow-hidden rounded-full bg-night-600 p-0.5 ring-1 ring-white/10"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            FILL[tone],
            busy && "animate-stripes bg-[length:28px_28px] bg-[linear-gradient(45deg,rgb(255_255_255/0.28)_25%,transparent_25%,transparent_50%,rgb(255_255_255/0.28)_50%,rgb(255_255_255/0.28)_75%,transparent_75%)]",
          )}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  );
}
