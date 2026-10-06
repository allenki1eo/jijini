import type { Dictionary } from "@/i18n/sw";

/** Place name for a stop, falling back to its category. */
export const stopLabel = (t: Dictionary, stop: { name: string; poi?: string }) =>
  stop.name || t.missions.poi[(stop.poi as keyof Dictionary["missions"]["poi"]) || "street"] || t.missions.poi.street;

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(Math.abs(seconds)));
  return `${seconds < 0 ? "-" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
