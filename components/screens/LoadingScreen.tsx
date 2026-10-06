"use client";

import { useEffect, useState } from "react";
import { BodaRider } from "@/components/brand/BodaRider";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { Logo } from "@/components/brand/Logo";
import { Meter } from "@/components/ui";
import { useT } from "@/i18n";

interface LoadingScreenProps {
  /** 0..1 */
  progress: number;
  status: string;
  /** Secondary line under the bar (e.g. chunk counter). */
  detail?: string;
}

const PROVERB_MS = 3600;

/** Splash / loading screen: a boda riding an endless road, a rotating methali and real progress. */
export function LoadingScreen({ progress, status, detail }: LoadingScreenProps) {
  const t = useT();
  const proverbs = t.splash.proverbs;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % proverbs.length), PROVERB_MS);
    return () => window.clearInterval(id);
  }, [proverbs.length]);

  return (
    <div className="grain fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-night" role="status" aria-live="polite">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,#6B3F6E_0%,#2A1E3A_38%,#10131A_75%)]" />
      <div className="pointer-events-none absolute -bottom-1/3 left-1/2 size-[70vmax] -translate-x-1/2 rounded-full bg-sun/10 blur-3xl" />

      <div className="safe-x relative flex w-full max-w-md flex-col items-center gap-6 short:gap-3">
        <Logo size="lg" className="short:scale-75" />

        {/* The road stage */}
        <div className="relative h-36 w-full overflow-hidden rounded-[1.75rem] bg-[linear-gradient(#FFB547,#E3725A_55%,#6B3F6E)] ring-1 ring-white/10 short:h-28">
          <div className="absolute inset-x-0 bottom-10 flex h-14 items-end gap-10 opacity-60 short:bottom-8">
            <div className="animate-road flex h-full w-[200%] items-end gap-16 [animation-duration:2.4s]">
              {Array.from({ length: 12 }, (_, i) => (
                <svg key={i} viewBox="0 0 60 50" className="h-full w-auto shrink-0 fill-[#3B2346]" aria-hidden="true">
                  {i % 3 === 0 ? (
                    <>
                      <rect x="27" y="22" width="5" height="28" />
                      <ellipse cx="30" cy="20" rx="28" ry="7" />
                    </>
                  ) : (
                    <>
                      <rect x="27" y="28" width="6" height="22" />
                      <ellipse cx="30" cy="22" rx="20" ry="16" />
                    </>
                  )}
                </svg>
              ))}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-10 bg-[#2A1A2E] short:h-8">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden">
              <div className="animate-road h-full w-[calc(100%+48px)] bg-[repeating-linear-gradient(90deg,#FFC72C_0_24px,transparent_24px_48px)] [animation-duration:0.35s]" />
            </div>
          </div>
          <div className="absolute bottom-3 left-1/2 w-36 -translate-x-1/2 short:bottom-2 short:w-28">
            <BodaRider className="w-full drop-shadow-[0_6px_8px_rgb(0_0_0/0.4)]" />
          </div>
        </div>

        <div className="w-full">
          <Meter value={progress} label={status} busy={progress < 1} />
          <div className="mt-2.5 flex items-center justify-between gap-3 font-display text-sm font-semibold">
            <span className="text-cream">{status}</span>
            {detail && <span className="tabular text-cream/60">{detail}</span>}
          </div>
        </div>

        <div className="relative h-14 w-full text-center short:h-10">
          <p key={index} className="animate-fade-up absolute inset-0 font-display text-lg leading-snug font-semibold text-sun-300 italic short:text-base">
            “{proverbs[index]}”
          </p>
        </div>
      </div>

      <KitengeStrip className="absolute inset-x-0 bottom-0 h-3 w-full" />
    </div>
  );
}
