"use client";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
}

/** 0..1 range slider with a chunky thumb. */
export function Slider({ value, onChange, label }: SliderProps) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex w-full items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-12 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sun [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sun [&::-webkit-slider-thumb]:shadow-[0_3px_0_0_var(--color-sun-800)]"
        style={{
          // Filled track up to the thumb.
          background: `linear-gradient(to right, var(--color-forest-400) 0 ${pct}%, var(--color-night-600) ${pct}% 100%) center / 100% 12px no-repeat`,
          borderRadius: 999,
        }}
      />
      <span className="w-10 text-right font-display font-bold tabular text-cream/80">{pct}</span>
    </div>
  );
}
