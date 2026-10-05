/** Browser capability helpers. All are safe to call during SSR (they no-op). */

export const isStandalone = (): boolean =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = (): boolean =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);

/** Enter fullscreen and try to lock landscape (only allowed while fullscreen / installed). */
export const enterFullscreen = async (): Promise<void> => {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    // Not supported (iOS Safari) or denied: the game still works in any orientation.
  }
};

export const exitFullscreen = async (): Promise<void> => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Ignore.
  }
};

export const vibrate = (pattern: number | number[], enabled: boolean): void => {
  if (enabled && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
};

/** Keep the screen awake while riding. Returns a release function. */
export const requestWakeLock = async (): Promise<() => void> => {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const sentinel = await nav.wakeLock?.request("screen");
    return () => void sentinel?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
};
