/**
 * Anonymous play telemetry for the public /stats page: how many people ride,
 * where, and how much. No names, no locations beyond the city, no save data:
 * a random install id (so unique players can be counted), the city, the
 * device class, and totals for jobs, kilometres and minutes. Riders can turn
 * it off in Settings ("Shiriki takwimu"). Events go out with sendBeacon so
 * they never slow the game.
 */
import { events } from "@/game/core/events";
import { useSettings } from "@/stores/settings";

export type TelemetryEvent =
  | { e: "session"; city: string; device: "phone" | "tablet" | "desktop"; locale: string }
  | { e: "delivery"; city: string; type: string; fare: number }
  | { e: "ride"; city: string; km: number; minutes: number };

const ID_KEY = "bodago:install";

const installId = () => {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
};

export const track = (event: TelemetryEvent) => {
  if (typeof window === "undefined" || !useSettings.getState().shareStats) return;
  const body = JSON.stringify({ ...event, id: installId() });
  try {
    if (navigator.sendBeacon?.(new URL("/api/track", location.origin), new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
};

const deviceClass = (): "phone" | "tablet" | "desktop" => {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "desktop";
  return Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone";
};

/**
 * Report a ride session in `city`: the start, every finished job, and the
 * distance and time when the rider leaves (or the tab goes to the background).
 * `odometerKm` reads the kilometres ridden since the last report. Returns a cleanup.
 */
export const attachTelemetry = (city: string, odometerKm: () => number) => {
  track({ e: "session", city, device: deviceClass(), locale: useSettings.getState().locale });
  let since = performance.now();
  const flush = () => {
    const minutes = (performance.now() - since) / 60_000;
    const km = odometerKm();
    since = performance.now();
    if (minutes < 0.2 && km < 0.05) return;
    track({ e: "ride", city, km: Math.round(km * 100) / 100, minutes: Math.round(minutes * 10) / 10 });
  };
  const onHide = () => document.visibilityState === "hidden" && flush();
  document.addEventListener("visibilitychange", onHide);
  const off = events.on("delivery", (d) => track({ e: "delivery", city, type: d.type, fare: Math.round(d.earned) }));
  return () => {
    flush();
    off();
    document.removeEventListener("visibilitychange", onHide);
  };
};
