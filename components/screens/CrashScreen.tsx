"use client";

import { Home, MonitorX, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, Card } from "@/components/ui";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * What a rider sees when the 3D world can't start or something breaks,
 * instead of a blank page: what happened in plain words, a retry, a way home,
 * and (folded away) the real error for anyone helping to fix it. The error is
 * also logged to the console with where it happened.
 */
export function CrashScreen({ kind, where, error, onRetry }: { kind: "webgl" | "crash"; where: string; error?: (Error & { digest?: string }) | null; onRetry?: () => void }) {
  const t = useT();
  useEffect(() => {
    if (kind === "webgl") console.error(`[BodaGo] ${where}: WebGL is not available on this device/browser`, error ?? "");
    else console.error(`[BodaGo] ${where} crashed`, error);
  }, [kind, where, error]);

  const webgl = kind === "webgl";
  const Icon = webgl ? MonitorX : TriangleAlert;
  const detail = error ? [error.name !== "Error" ? error.name : "", error.message, error.digest ? `#${error.digest}` : ""].filter(Boolean).join(" · ") : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night p-5 text-cream">
      <Card pattern className="w-full max-w-md p-6 text-center">
        <span className={cn("mx-auto grid size-16 place-items-center rounded-3xl", webgl ? "bg-sky/15 text-sky-300" : "bg-coral/15 text-coral")}>
          <Icon className="size-8" strokeWidth={2.2} />
        </span>
        <h1 className="mt-4 font-display text-2xl leading-tight font-extrabold">{webgl ? t.crash.webglTitle : t.crash.title}</h1>
        <p className="mt-2 text-cream/75">{webgl ? t.crash.webglBody : t.crash.body}</p>
        {webgl && (
          <ul className="mt-4 space-y-1.5 rounded-2xl bg-white/5 p-3 text-left text-sm text-cream/70">
            {t.crash.webglTips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="text-sun">•</span>
                {tip}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/" className="chunky inline-flex min-h-12 items-center gap-2 rounded-2xl bg-night-600 px-5 font-display font-bold ring-1 ring-white/10 [--edge:var(--color-night)]">
            <Home className="size-5" /> {t.crash.home}
          </Link>
          <Button variant="sun" icon={<RotateCcw />} onClick={onRetry ?? (() => window.location.reload())}>
            {t.common.retry}
          </Button>
        </div>
        {detail && (
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs font-semibold text-cream/50">{t.crash.details}</summary>
            <p className="mt-2 rounded-xl bg-black/30 p-2.5 font-mono text-xs break-words text-cream/60">{detail}</p>
          </details>
        )}
      </Card>
    </div>
  );
}
