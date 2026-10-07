"use client";

import { CrashScreen } from "@/components/screens/CrashScreen";
import { hasWebGL, isWebGLError } from "@/lib/webgl";

/** Anything that breaks on /play lands here instead of a blank page. */
export default function PlayError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const kind = !hasWebGL() || isWebGLError(error) ? "webgl" : "crash";
  return <CrashScreen kind={kind} where="/play" error={error} onRetry={retry} />;
}
