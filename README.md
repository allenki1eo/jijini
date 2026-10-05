# BodaGo 🏍️

A PWA-first 3D bodaboda delivery game set in **real Tanzanian cities generated from OpenStreetMap data**.
Swahili-first, landscape-first, built to hold 60 FPS on a budget Android phone.

> **Status: Phases 1–2 done.** The design system, PWA shell, i18n, splash and main menu are in place, and the
> OSM bake pipeline turns Shinyanga into a streamed 3D world you can explore with map and free-fly debug cameras.

| Main menu | Shinyanga, from OpenStreetMap |
|---|---|
| ![Menu](public/screenshots/menu-wide.png) | ![World](public/screenshots/world-wide.png) |

## Run it

```bash
npm install
npm run dev            # http://localhost:3000 (service worker disabled in dev)

npm run build && npm start   # production build with the service worker
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run bake -- shinyanga` | Rebuild `public/cities/shinyanga/` from cached OSM data (`scripts/.cache/`) |
| `npm run bake -- shinyanga --refresh` | Re-download from Overpass first (falls back to the OSM API for small boxes) |
| `npm run icons` | Regenerate the favicon and PWA icons from the SVG design in `scripts/gen-icons.ts` |
| `npm run typecheck` / `npm run lint` | Strict TypeScript / ESLint |

The baked Shinyanga data is committed, so you don't need to run the bake to play.
If your network sits behind an HTTP proxy, run the bake with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) so Node's `fetch` uses it.

## Stack

| Concern | Package |
|---|---|
| Framework | `next` 16 (App Router, Turbopack), `react` 19, TypeScript 5.9 strict (`noUncheckedIndexedAccess`) |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` (only `MapControls`), loaded only on `/play` |
| State | `zustand` (settings persisted to localStorage, world and PWA session stores) |
| UI | `tailwindcss` v4 (tokens in `@theme`), `motion` (`LazyMotion` + `m`), `lucide-react` |
| Fonts | `@fontsource-variable/baloo-2`, `@fontsource-variable/inter` (self-hosted) |
| PWA | `serwist` + `@serwist/turbopack` |
| Geometry | `earcut` (polygon triangulation, in a Web Worker) |
| Tooling | `tsx` (bake script), `sharp` (icons), `eslint-config-next` |
| Reserved for later phases | `idb` (saves and offline city downloads) |

## Project layout

```
app/                      routes: / (splash + menu), /play, /settings, /credits, /~offline
  manifest.ts             web app manifest
  sw.ts                   service worker (Serwist)
  serwist/[path]/route.ts builds and serves /serwist/sw.js
components/
  ui/                     design system: Button, Card, Chip, Meter, Modal, Segmented, Slider, Toggle, IconButton
  brand/                  Logo, Kitenge pattern, animated BodaRider, Skyline illustration
  screens/                BootGate (splash), LoadingScreen, MainMenu, Settings, Credits
  hud/                    ExploreHud, StatsPanel, VirtualJoystick
  pwa/                    SW registration, install banner, update toast, offline chip
game/
  core/                   quality presets, shared input + render stats
  world/
    format.ts             baked data format, shared by the bake script and the runtime
    palette.ts            Tanzanian wall, roof and ground palette
    build/                chunk → geometry builders (ground, roads, buildings), run in the worker
    chunk.worker.ts       fetch chunk JSON → transferable buffers
    ChunkStreamer.ts      streams chunks around the camera, disposes far ones
    materials.ts          Lambert materials with facade, ground grain, water and tree-sway shader patches
    trees.ts              instanced low-poly mango, acacia and palm trees
    SkyDome.tsx, CameraRig.tsx, CityChunks.tsx, DebugOverlays.tsx, WorldScene.tsx, WorldView.tsx
data/cities/config.ts     city definitions (bbox, chunk size, skyline, tree mix, landmarks)
i18n/                     sw.ts (source of truth), en.ts (type-checked against it)
stores/                   settings, player, world, pwa
scripts/                  bake-city.ts + lib/ (osm download, classify, geometry), gen-icons.ts
public/cities/<id>/       baked output: manifest.json, navgraph.json, pois.json, chunks/<cx>_<cz>.json
```

## The OSM pipeline

**Bake (offline, `scripts/bake-city.ts`).** Overpass is never called at runtime.

1. Downloads the city box plus a 60 m margin. It tries the Overpass mirrors in order, then falls back to the OSM API v0.6 `map` call.
2. Projects lat/lon to local meters (equirectangular around the city centre, +x east, +z south).
3. Roads are simplified with Douglas–Peucker *between junctions*, so junction vertices stay exact. Width comes from the `width` or `lanes` tags, or a class default (primary 9 m, residential 5 m, track 3 m). Surface comes from `surface`, or a believable default (most side streets are red earth).
4. Buildings are simplified, tiny footprints are dropped, and heights come from `height` or `building:levels`. Untagged buildings get a seeded 1–3 floors. Near-rectangular houses get a hipped iron roof over their oriented bounding box.
5. Land use, water and parks are clipped exactly to each chunk. Roads are clipped too, and each piece carries its neighbour points so ribbons miter seamlessly across chunk seams.
6. Builds a **navigation graph** from drivable ways: nodes at junctions, edges with length, class, width, speed limit and one-way flag. Only the largest connected component is kept.
7. Scatters trees into open ground, avoiding roads, buildings and water, weighted per land-use type.
8. Writes 200 m × 200 m chunks. Each chunk is one file containing all of its layers, to keep requests low on 3G. Shinyanga is 64 chunks and about 440 KB of JSON before gzip.

The Overpass query for Shinyanga (the bbox is derived from `data/cities/config.ts`):

```
[out:json][timeout:120];
(
  way["highway"](-3.67163,33.41406,-3.65617,33.42954);
  way["building"](-3.67163,33.41406,-3.65617,33.42954);
  relation["building"](-3.67163,33.41406,-3.65617,33.42954);
  way["natural"~"^(water|wood|scrub|grassland|sand|bare_rock|beach)$"](-3.67163,33.41406,-3.65617,33.42954);
  relation["natural"="water"](-3.67163,33.41406,-3.65617,33.42954);
  way["waterway"](-3.67163,33.41406,-3.65617,33.42954);
  way["landuse"](-3.67163,33.41406,-3.65617,33.42954);
  relation["landuse"](-3.67163,33.41406,-3.65617,33.42954);
  way["leisure"~"^(park|pitch|garden|playground|stadium)$"](-3.67163,33.41406,-3.65617,33.42954);
  way["amenity"](-3.67163,33.41406,-3.65617,33.42954);
  node["amenity"](-3.67163,33.41406,-3.65617,33.42954);
  node["shop"](-3.67163,33.41406,-3.65617,33.42954);
  node["tourism"](-3.67163,33.41406,-3.65617,33.42954);
  way["barrier"](-3.67163,33.41406,-3.65617,33.42954);
  node["natural"="tree"](-3.67163,33.41406,-3.65617,33.42954);
);
out body;
>;
out skel qt;
```

**Runtime.** `ChunkStreamer` keeps the chunks within the quality preset's radius loaded: 300 m on Low, 400 m on Medium, 520 m on High. It drops chunks 140 m past that radius. A Web Worker fetches each chunk and triangulates it into transferable typed arrays, so the main thread only wraps buffers in meshes. Each chunk is at most three draw calls: ground (areas, sidewalks, roads, junctions and markings merged into one mesh), buildings and water. Trees are three instanced meshes for the whole city. Window strips, shop shutters, painted sign bands and dust plinths are drawn by a shader from a per-vertex facade attribute, so they cost no geometry.

Measured with Shinyanga in the explorer (Medium): **about 35 draw calls and 75k triangles** with 20 chunks loaded. The budget is 150 draw calls and 300k triangles.

## Notes and decisions

- **Baked data location.** The bake writes to `public/cities/` rather than `data/cities/` so the files can be fetched, streamed and cached by the service worker. City *config* lives in `data/cities/config.ts`.
- **Chunk files.** There is one file per chunk with all layers, instead of separate `roads.json` and `buildings.json` per chunk. `navgraph.json` and `pois.json` are city-wide because the traffic AI and the mission generator need the whole graph.
- **Turbopack + service worker.** Turbopack passes a worker's bootstrap config in the URL fragment. `app/sw.ts` serves worker scripts as synthesized responses so the fragment survives when the SW answers from cache. Without this, the chunk worker fails once the SW takes control.
- **Updates never interrupt a ride.** The SW waits, and the menu shows a "Toleo jipya lipo!" toast that activates it on tap.
- **Attribution.** "© OpenStreetMap contributors" is always visible in the explorer, in the menu footer, and on the credits screen. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Next: Phase 3

Bike physics, mobile and desktop controls (the `VirtualJoystick` and the `analogInput` channel are already in place), a chase camera, and the GLB asset loader with procedural fallbacks.
