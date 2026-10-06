/**
 * Real, live radio. Stations are listed in public/radio/stations.json with
 * their own HTTPS stream URLs. One <audio> element plays them, so only one
 * station is on at a time. The element keeps going when the screen locks;
 * the Media Session API shows the station on the system controls.
 */
import { create } from "zustand";
import { useSettings } from "@/stores/settings";
import { parseLiveStations, shouldStartStream, type LiveStation } from "./stations";

export type { LiveStation };

export let liveStations: LiveStation[] = [];

/** Bumped when the catalog arrives so the radio UI can render it. */
export const useLiveCatalog = create<{ ready: boolean; revision: number }>(() => ({ ready: false, revision: 0 }));

export type LivePhase = "idle" | "loading" | "playing" | "paused" | "error";
export type LiveProblem = "offline" | "down" | null;

export const useLivePlayback = create<{ stationId: string | null; phase: LivePhase; problem: LiveProblem }>(() => ({
  stationId: null,
  phase: "idle",
  problem: null,
}));

let loading: Promise<LiveStation[]> | null = null;

/** Read the live station list once per session. */
export const loadLiveStations = () =>
  (loading ??= fetch("/radio/stations.json")
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : { live: [] }))
    .then((raw) => {
      liveStations = parseLiveStations(raw);
      const tuned = useSettings.getState().radio;
      const known = tuned === "off" || liveStations.some((s) => s.id === tuned);
      if (!known && liveStations[0]) useSettings.getState().set("radio", liveStations[0].id);
      useLiveCatalog.setState((s) => ({ ready: true, revision: s.revision + 1 }));
      return liveStations;
    })
    .catch(() => {
      liveStations = [];
      useLiveCatalog.setState((s) => ({ ready: true, revision: s.revision + 1 }));
      return liveStations;
    }));

const LOAD_TIMEOUT_MS = 12_000;

class LivePlayer {
  private el: HTMLAudioElement | null = null;
  private currentUrl = "";
  private token = 0;
  private timer = 0;
  /** Listener paused or stopped this station; the ride must not restart it on its own. */
  private held = false;
  private heldId: string | null = null;
  private station: LiveStation | null = null;
  /** Called when a stream fails (offline, stream down, blocked). */
  onError: ((station: LiveStation) => void) | null = null;

  /**
   * Start a station. "user" is a tap on play; "follow" is the ride catching
   * up to the tuned station (it will not override pause or stop).
   * Returns false when playback was intentionally left alone.
   */
  play(station: LiveStation, volume: number, reason: "user" | "follow" = "user") {
    if (typeof window === "undefined") return false;
    if (!shouldStartStream(reason, this.held, this.heldId, station.id)) return false;
    if (!navigator.onLine) {
      this.fail(station, "offline");
      return false;
    }
    this.held = false;
    this.heldId = null;
    this.station = station;
    this.ensure();
    const el = this.el!;
    el.volume = clamp(volume);
    const phase = useLivePlayback.getState().phase;

    // The ride and a tap can ask for the same station in one gesture.
    if (this.currentUrl === station.url && phase === "loading") return true;
    if (this.currentUrl === station.url && phase === "playing" && !el.paused) return true;

    if (this.currentUrl === station.url && el.paused && phase === "paused") {
      this.publish(station.id, "loading", null);
      this.armTimeout(station);
      void el.play().then(() => {
        if (!this.held) this.markPlaying(station);
      }).catch(() => {
        if (!this.held) this.fail(station, "down");
      });
      return true;
    }
    const token = ++this.token;
    window.clearTimeout(this.timer);
    this.currentUrl = station.url;
    this.publish(station.id, "loading", null);
    el.src = station.url;
    el.onerror = () => {
      if (token === this.token) this.fail(station, "down");
    };
    el.onwaiting = () => {
      if (token === this.token && useLivePlayback.getState().phase === "playing") this.publish(station.id, "loading", null);
    };
    el.onplaying = () => {
      if (token !== this.token || this.held) return;
      window.clearTimeout(this.timer);
      this.markPlaying(station);
    };
    el.onpause = () => {
      if (token !== this.token || this.held) return;
      // Ignore the pause that fires while a new src is assigned. A pause after
      // sound has started came from the browser or the headphone button.
      if (useLivePlayback.getState().phase !== "playing") return;
      this.held = true;
      this.heldId = station.id;
      this.publish(station.id, "paused", null);
      this.sessionState("paused");
    };
    this.armTimeout(station);
    void el.play().catch(() => {
      if (token === this.token && !this.held) this.fail(station, "down");
    });
    return true;
  }

  setVolume(volume: number) {
    if (this.el) this.el.volume = clamp(volume);
  }

  pause() {
    if (!this.station) return;
    this.held = true;
    this.heldId = this.station.id;
    this.el?.pause();
    window.clearTimeout(this.timer);
    this.publish(this.station.id, "paused", null);
    this.sessionState("paused");
  }

  /** Stop the bytes, but remember the station so Play starts it again. */
  halt() {
    const id = this.station?.id ?? null;
    this.held = true;
    this.heldId = id;
    this.teardown();
    this.publish(id, "idle", null);
    this.clearSession();
  }

  /** Drop the stream entirely (another station, radio off, leaving the ride). */
  stop() {
    this.held = false;
    this.heldId = null;
    this.station = null;
    this.teardown();
    this.publish(null, "idle", null);
    this.clearSession();
  }

  private fail(station: LiveStation, problem: Exclude<LiveProblem, null>) {
    window.clearTimeout(this.timer);
    this.token++;
    this.currentUrl = "";
    const el = this.el;
    if (el) {
      el.onerror = null;
      el.onplaying = null;
      el.onwaiting = null;
      el.onpause = null;
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    this.publish(station.id, "error", problem);
    this.sessionState("none");
    this.onError?.(station);
  }

  private markPlaying(station: LiveStation) {
    this.publish(station.id, "playing", null);
    this.updateSession(station);
  }

  private publish(stationId: string | null, phase: LivePhase, problem: LiveProblem) {
    useLivePlayback.setState({ stationId, phase, problem });
  }

  private ensure() {
    if (this.el) return;
    this.el = new Audio();
    this.el.preload = "none";
    this.el.setAttribute("playsinline", "");
    // Keep it in the document so the lock-screen controls can see it, without shifting layout.
    this.el.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(this.el);
    this.bindSession();
  }

  private armTimeout(station: LiveStation) {
    window.clearTimeout(this.timer);
    const token = this.token;
    this.timer = window.setTimeout(() => {
      if (token === this.token && useLivePlayback.getState().phase === "loading") this.fail(station, "down");
    }, LOAD_TIMEOUT_MS);
  }

  private teardown() {
    window.clearTimeout(this.timer);
    this.token++;
    this.currentUrl = "";
    const el = this.el;
    if (!el) return;
    el.onerror = null;
    el.onplaying = null;
    el.onwaiting = null;
    el.onpause = null;
    el.pause();
    el.removeAttribute("src");
    el.load();
  }

  private bindSession() {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    setHandler(session, "play", () => {
      const station = this.station;
      if (station) this.play(station, this.el?.volume ?? 1, "user");
    });
    setHandler(session, "pause", () => this.pause());
    setHandler(session, "stop", () => this.halt());
  }

  private updateSession(station: LiveStation) {
    if (!("mediaSession" in navigator)) return;
    const artist = [station.freq === "LIVE" ? "" : `${station.freq} FM`, station.city].filter(Boolean).join(" · ");
    const artwork = `${location.origin}/icons/icon-192.png`;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist,
      album: "BodaGo",
      artwork: [{ src: artwork, sizes: "192x192", type: "image/png" }],
    });
    this.sessionState("playing");
  }

  private sessionState(state: "playing" | "paused" | "none") {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state === "playing" ? "playing" : "paused";
    } catch {
      // A few browsers reject the assignment.
    }
    if (state === "none") this.clearSession();
  }

  private clearSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = null;
    try {
      navigator.mediaSession.playbackState = "none";
    } catch {
      // Ignore.
    }
  }

  get playing() {
    return useLivePlayback.getState().phase === "playing";
  }
}

const clamp = (volume: number) => Math.max(0, Math.min(1, volume));

const setHandler = (session: MediaSession, action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // This browser does not support the action.
  }
};

export const livePlayer = new LivePlayer();
