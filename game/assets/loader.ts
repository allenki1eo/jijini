/**
 * External asset loader. Looks a model up in /assets/MANIFEST.json and loads
 * the GLB (Meshopt-compressed) when present. Returns null otherwise, and the
 * caller falls back to its procedural low-poly version. The game is fully
 * playable with zero external assets.
 */
import type * as THREE from "three";

interface ManifestAsset {
  name: string;
  path?: string;
  kind?: "model" | "audio" | "texture";
}

let manifest: Promise<ManifestAsset[]> | null = null;
const cache = new Map<string, Promise<THREE.Object3D | null>>();

const loadManifest = () => {
  manifest ??= fetch("/assets/MANIFEST.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ assets: ManifestAsset[] }>) : { assets: [] }))
    .then((m) => m.assets)
    .catch(() => []);
  return manifest;
};

export const loadModel = (name: string): Promise<THREE.Object3D | null> => {
  let pending = cache.get(name);
  if (!pending) {
    pending = (async () => {
      const entry = (await loadManifest()).find((a) => a.name === name && a.kind === "model" && a.path);
      if (!entry?.path) return null;
      try {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/libs/meshopt_decoder.module.js"),
        ]);
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(entry.path);
        return gltf.scene;
      } catch {
        return null;
      }
    })();
    cache.set(name, pending);
  }
  return pending;
};
