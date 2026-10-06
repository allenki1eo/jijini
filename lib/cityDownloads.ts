/**
 * Offline city downloads ("Pakua jiji"). Files go into the same Cache Storage
 * bucket the service worker serves /cities/* from, so a downloaded city
 * streams entirely offline.
 */
import type { CityManifest } from "@/game/world/format";

export const CITY_CACHE = "bodago-cities";
const CONCURRENCY = 4;

export const cityFiles = (id: string, manifest: CityManifest) => [
  `/cities/${id}/manifest.json`,
  `/cities/${id}/navgraph.json`,
  `/cities/${id}/pois.json`,
  `/cities/${id}/preview.json`,
  ...manifest.chunks.map((c) => `/cities/${id}/chunks/${c.key}.json`),
];

const available = () => typeof caches !== "undefined";

/** Share of the city's files already cached (0..1). */
export const downloadedShare = async (id: string, manifest: CityManifest): Promise<number> => {
  if (!available()) return 0;
  const cache = await caches.open(CITY_CACHE);
  const files = cityFiles(id, manifest);
  const hits = await Promise.all(files.map((f) => cache.match(f)));
  return hits.filter(Boolean).length / files.length;
};

export const downloadCity = async (id: string, manifest: CityManifest, onProgress: (share: number) => void, signal?: AbortSignal) => {
  if (!available()) throw new Error("Cache Storage unavailable");
  const cache = await caches.open(CITY_CACHE);
  const files = cityFiles(id, manifest);
  let done = 0;
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const url = queue.shift()!;
      if (!(await cache.match(url))) {
        const res = await fetch(url, { signal, cache: "no-cache" });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        await cache.put(url, res);
      }
      done++;
      onProgress(done / files.length);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
};

export const removeCity = async (id: string, manifest: CityManifest) => {
  if (!available()) return;
  const cache = await caches.open(CITY_CACHE);
  await Promise.all(cityFiles(id, manifest).map((f) => cache.delete(f)));
};

export const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
