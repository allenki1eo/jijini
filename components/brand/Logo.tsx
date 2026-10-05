import { cn } from "@/lib/cn";

/** BodaGo wordmark: sticker-style display type with speed lines. */
export function Logo({ className, size = "lg" }: { className?: string; size?: "md" | "lg" | "xl" }) {
  const text = { md: "text-4xl", lg: "text-6xl", xl: "text-7xl sm:text-8xl" }[size];
  return (
    <div className={cn("relative inline-flex items-end select-none", text, className)} aria-label="BodaGo" role="img">
      <svg viewBox="0 0 40 40" className="mr-[0.06em] mb-[0.2em] h-[0.42em] w-[0.42em] shrink-0 text-coral" aria-hidden="true">
        <path d="M2 12h22M8 20h26M2 28h18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="sticker leading-[0.8] text-cream">
        Boda<span className="text-sun">Go</span>
      </span>
    </div>
  );
}
