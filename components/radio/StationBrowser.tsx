"use client";

import { Loader2, Radio } from "lucide-react";
import { useEffect } from "react";
import { livePlayer, liveStations, loadLiveStations, useLiveCatalog, useLivePlayback, type LiveStation } from "@/game/audio/LiveRadio";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSettings } from "@/stores/settings";

const freqLabel = (freq: string, liveWord: string) => (!freq || freq === "LIVE" ? liveWord : `${freq} FM`);

/** The same live dial as the ride's radio chip, inside the boda phone. */
export function StationBrowser() {
  const t = useT();
  const ready = useLiveCatalog((s) => s.ready);
  useLiveCatalog((s) => s.revision);
  const playback = useLivePlayback();
  const tunedId = useSettings((s) => s.radio);

  useEffect(() => {
    void loadLiveStations();
  }, []);

  const tune = (station: LiveStation) => {
    const settings = useSettings.getState();
    if (settings.radio !== station.id) settings.set("radio", station.id);
    livePlayer.play(station, settings.masterVolume * settings.musicVolume, "user");
  };

  if (!ready) {
    return (
      <p className="flex items-center justify-center gap-2 px-2 py-8 text-sm text-cream/60">
        <Loader2 className="size-4 animate-spin" /> {t.radio.loadingList}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {liveStations.map((station) => {
        const on = station.id === tunedId;
        const phase = on && playback.stationId === station.id ? playback.phase : "idle";
        return (
          <li key={station.id}>
            <button
              type="button"
              onClick={() => tune(station)}
              aria-pressed={on}
              className={cn(
                "flex min-h-12 w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left ring-1 ring-white/10",
                on ? "bg-night-600" : "bg-night-700/80",
              )}
            >
              {phase === "loading" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-sun" />
              ) : (
                <Radio className="size-4 shrink-0" style={{ color: station.color }} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm leading-tight font-extrabold">{station.name}</span>
                <span className="block truncate text-[11px] text-cream/55">
                  {[station.city, station.genre ? t.radio.genres[station.genre] : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 font-display text-xs font-bold text-cream/70 tabular">{freqLabel(station.freq, t.radio.live)}</span>
              {phase === "playing" && <span className="size-2 shrink-0 animate-pulse rounded-full bg-coral" aria-hidden="true" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
