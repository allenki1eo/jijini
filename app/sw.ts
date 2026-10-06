/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Updates wait for the player to tap "Refresh" so a ride is never interrupted.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Baked city chunks: serve instantly from cache, refresh in the background.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/cities/"),
      handler: new StaleWhileRevalidate({
        cacheName: "bodago-cities",
        plugins: [new ExpirationPlugin({ maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

/**
 * Turbopack boots web workers with their config in the URL fragment
 * (`worker.js#params=…`). A response passed through from cache or network
 * carries a fragment-less URL and the worker can't find its config, so serve
 * worker scripts as synthesized responses, which keep the request URL.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.destination !== "worker") return;
  event.stopImmediatePropagation();
  event.respondWith(
    (async () => {
      const url = event.request.url.split("#")[0]!;
      const res = (await serwist.matchPrecache(url)) ?? (await caches.match(url)) ?? (await fetch(url));
      return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
    })(),
  );
});

/** Live radio streams never end: let the browser fetch them directly instead of caching them. */
self.addEventListener("fetch", (event) => {
  if (event.request.destination === "audio" && new URL(event.request.url).origin !== self.location.origin) event.stopImmediatePropagation();
});

serwist.addEventListeners();
