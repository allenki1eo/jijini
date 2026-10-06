/**
 * Real, live radio. Stations you have permission to rebroadcast are listed
 * in public/radio/stations.json with their HTTPS stream URLs; they join the
 * built-in stations on the radio button. Streams play through a plain
 * <audio> element (no CORS needed), follow the music volume, pause with the
 * game, and fall back gracefully when offline or when a stream is down.
 */
export interface LiveStation {
  id: string;
  name: string;
  freq: string;
  /** HTTPS stream URL (MP3/AAC/HLS where the browser supports it). */
  url: string;
  color: string;
}

export let liveStations: LiveStation[] = [];

let loading: Promise<LiveStation[]> | null = null;

/** Read the live station list once per session. */
export const loadLiveStations = () =>
  (loading ??= fetch("/radio/stations.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ live?: Partial<LiveStation>[] }>) : { live: [] }))
    .then(({ live = [] }) => {
      liveStations = live
        .filter((s): s is LiveStation => Boolean(s.name && s.url && s.url.startsWith("https://")))
        .map((s, i) => ({ id: `live:${i}`, name: s.name, freq: s.freq ?? "LIVE", url: s.url, color: s.color ?? "#FF5A4F" }));
      return liveStations;
    })
    .catch(() => (liveStations = [])));

class LivePlayer {
  private el: HTMLAudioElement | null = null;
  private current = "";
  /** Called when a stream fails (offline, stream down, blocked). */
  onError: ((station: LiveStation) => void) | null = null;

  play(station: LiveStation, volume: number) {
    if (typeof window === "undefined") return;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "none";
    }
    const el = this.el;
    el.volume = Math.max(0, Math.min(1, volume));
    if (this.current === station.url && !el.paused) return;
    this.current = station.url;
    el.src = station.url;
    el.onerror = () => this.onError?.(station);
    void el.play().catch(() => this.onError?.(station));
  }

  setVolume(volume: number) {
    if (this.el) this.el.volume = Math.max(0, Math.min(1, volume));
  }

  pause() {
    this.el?.pause();
  }

  resume() {
    if (this.el && this.current) void this.el.play().catch(() => {});
  }

  stop() {
    if (!this.el) return;
    this.el.pause();
    // Drop the connection so the stream stops using data.
    this.el.removeAttribute("src");
    this.el.load();
    this.current = "";
  }

  get playing() {
    return Boolean(this.el && this.current && !this.el.paused);
  }
}

export const livePlayer = new LivePlayer();
