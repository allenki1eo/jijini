"use client";

import { SerwistProvider, useSerwist } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";
import { usePwa, type BeforeInstallPromptEvent } from "@/stores/pwa";

function PwaEvents() {
  const { serwist } = useSerwist();
  const set = usePwa((s) => s.set);

  useEffect(() => {
    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      set({ installEvent: e as BeforeInstallPromptEvent });
    };
    const onInstalled = () => set({ installEvent: null });
    const onNetwork = () => set({ offline: !navigator.onLine });
    onNetwork();
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, [set]);

  useEffect(() => {
    if (!serwist) return;
    // Registration can fail (private mode, blocked storage); the game works without it.
    serwist.register().catch(() => undefined);
    const onWaiting = () => set({ updateReady: true });
    serwist.addEventListener("waiting", onWaiting);
    return () => serwist.removeEventListener("waiting", onWaiting);
  }, [serwist, set]);

  return null;
}

/** Registers the service worker (production only) and tracks install / update / network state. */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"} register={false} reloadOnOnline={false}>
      <PwaEvents />
      {children}
    </SerwistProvider>
  );
}

/** Activate the waiting service worker, then reload into the new version. */
export const applyUpdate = () => {
  const sw = typeof window !== "undefined" ? window.serwist : undefined;
  if (!sw) return window.location.reload();
  sw.addEventListener("controlling", () => window.location.reload());
  sw.messageSkipWaiting();
};
