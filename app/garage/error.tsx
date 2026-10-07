"use client";

import { CrashScreen } from "@/components/screens/CrashScreen";
import { hasWebGL, isWebGLError } from "@/lib/webgl";

/** Anything that breaks on /garage lands here instead of a blank page. */
export default function GarageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const kind = !hasWebGL() || isWebGLError(error) ? "webgl" : "crash";
  return <CrashScreen kind={kind} where="/garage" error={error} onRetry={retry} />;
}
