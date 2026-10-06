/**
 * The live-station catalog lives in public/radio/stations.json so it can be
 * updated without touching the player. This parser is the one gate: anything
 * that is not a named HTTPS stream is dropped before it can reach the radio.
 */

export const STATION_GROUPS = ["national", "dar", "regional", "religious"] as const;
export type StationGroup = (typeof STATION_GROUPS)[number];

export const STATION_GENRES = ["news", "talk", "bongo", "hits", "gospel", "sports", "music", "community"] as const;
export type StationGenre = (typeof STATION_GENRES)[number];

export interface LiveStation {
  /** Stable id, always `live:<slug>`, stored in the rider's settings. */
  id: string;
  name: string;
  /** Display frequency such as "88.5", or "LIVE" when the station has none. */
  freq: string;
  /** HTTPS stream URL (MP3, AAC, or HLS where the browser supports it). */
  url: string;
  color: string;
  city?: string;
  genre?: StationGenre;
  group?: StationGroup;
  /** Where the stream URL came from, for the next person updating the list. */
  source?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const oneOf = <T extends string>(value: string, allowed: readonly T[]): T | undefined =>
  (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/**
 * A ride that is merely following the tuned station must not restart audio
 * the listener has paused or stopped. Choosing a station (or pressing play)
 * always starts it.
 */
export const shouldStartStream = (
  reason: "user" | "follow",
  held: boolean,
  heldId: string | null,
  stationId: string,
): boolean => reason === "user" || !(held && heldId === stationId);

/** Turn the JSON catalog into stations the player is allowed to tune. */
export const parseLiveStations = (raw: unknown): LiveStation[] => {
  const list = isRecord(raw) && Array.isArray(raw.live) ? raw.live : [];
  const stations: LiveStation[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = text(item.name);
    const url = text(item.url);
    if (!name || !url.startsWith("https://")) continue;

    const slug = text(item.id).toLowerCase().replace(/[^a-z0-9-]+/g, "") || `s${stations.length}`;
    let id = `live:${slug}`;
    let n = 2;
    while (seen.has(id)) id = `live:${slug}-${n++}`;
    seen.add(id);

    const genre = oneOf(text(item.genre), STATION_GENRES);
    const group = oneOf(text(item.group), STATION_GROUPS);
    const city = text(item.city);
    const source = text(item.source);
    const freq = text(item.freq) || "LIVE";
    const color = text(item.color) || "#FF5A4F";

    stations.push({
      id,
      name,
      freq,
      url,
      color,
      ...(city ? { city } : {}),
      ...(genre ? { genre } : {}),
      ...(group ? { group } : {}),
      ...(source ? { source } : {}),
    });
  }

  return stations;
};
