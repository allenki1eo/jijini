import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { KitengeStrip } from "@/components/brand/Kitenge";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Kitenge pattern band along the top edge. */
  pattern?: boolean;
  children: ReactNode;
}

export function Card({ pattern, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] bg-night-800/92 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.8)] ring-1 ring-white/8 backdrop-blur-md",
        className,
      )}
      {...rest}
    >
      {pattern && <KitengeStrip className="h-3 w-full" />}
      {children}
    </div>
  );
}
