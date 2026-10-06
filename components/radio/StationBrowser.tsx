"use client";

import { Loader2, Pause, Play, Radio, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { livePlayer, liveStations, loadLiveStations, useLiveCatalog, useLivePlayback, type LiveStation } from "@/game/audio/LiveRadio";
import type { StationGroup } from "@/game/audio/stations";
import { fmt, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSettings } from "@/stores/settings";

const GROUPS: (StationGroup | "all")[] = ["all", "national", "dar", "regional", "religious"];

const markLetters = (name: string) => {
  const parts = name.split(/[^A-Za-z0-9]+/).filter((part) => /[A-Za-z]/.test(part));
  const letters = parts.length > 1 ? `${parts[0]![0]!}${parts[parts.length - 1]![0]!}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
};

export function StationMark({ station, className }: { station: LiveStation; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-2xl font-display font-extrabold text-night", className)}
      style={{ background: station.color }}
    >
      {markLetters(station.name)}
    </span>
  );
}

const freqLabel = (freq: string, liveWord: string) => (!freq || freq === "LIVE" ? liveWord : `${freq} FM`);

/** Shared station list: the Redio page, and the boda phone while you ride. */
export function StationBrowser({ variant }: { variant: "page" | "phone" }) {
  const t = useT();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("all");
  const ready = useLiveCatalog((s) => s.ready);
  useLiveCatalog((s) => s.revision);
  const playback = useLivePlayback();
  const tunedId = useSettings((s) => s.radio);
  const master = useSettings((s) => s.masterVolume);
  const music = useSettings((s) => s.musicVolume);
  const phone = variant === "phone";

  useEffect(() => {
    void loadLiveStations();
  }, []);

  useEffect(() => {
    livePlayer.setVolume(master * (music > 0 ? music : 0.7));
  }, [master, music]);

  const volume = () => {
    const s = useSettings.getState();
    return s.masterVolume * (s.musicVolume > 0 ? s.musicVolume : 0.7);
  };

  const tune = (station: LiveStation) => {
    const settings = useSettings.getState();
    if (settings.radio !== station.id) settings.set("radio", station.id);
    livePlayer.play(station, volume(), "user");
  };

  const tuned = liveStations.find((s) => s.id === tunedId);
  const active = playback.stationId === tuned?.id ? playback : null;
  const phase = active?.phase ?? "idle";
  const stations = liveStations.filter((s) => group === "all" || s.group === group);

  const status = !tuned
    ? t.radio.data
    : phase === "loading"
      ? t.radio.loading
      : phase === "playing"
        ? t.radio.playing
        : phase === "paused"
          ? t.radio.paused
          : phase === "error"
            ? active?.problem === "offline"
              ? t.radio.offline
              : fmt(t.radio.unavailable, { name: tuned.name })
            : t.radio.data;

  return (
    <div className={cn("flex flex-col", phone ? "gap-2" : "gap-4")}>
      <div className={cn("flex gap-2 overflow-x-auto pb-1", phone && "-mx-1 px-1")} role="toolbar" aria-label={t.radio.title}>
        {GROUPS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={group === id}
            onClick={() => setGroup(id)}
            className={cn(
              "shrink-0 rounded-full font-display font-bold",
              phone ? "min-h-9 px-3 text-xs" : "min-h-10 px-3.5 text-sm",
              group === id ? "bg-sun text-night" : "bg-night-700 text-cream/80 ring-1 ring-white/10",
            )}
          >
            {t.radio.groups[id]}
          </button>
        ))}
      </div>

      {tuned && (
        <div className={cn("sticky top-0 z-10 rounded-[1.4rem] bg-night-700 p-3 ring-1 ring-white/10", phone ? "" : "top-2 shadow-lg")} aria-live="polite">
          <div className="flex items-center gap-3">
            <StationMark station={tuned} className={phone ? "size-11 text-sm" : "size-14 text-lg"} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-wide text-cream/50 uppercase">{t.radio.now}</p>
              <p className="truncate font-display text-lg leading-tight font-extrabold">{tuned.name}</p>
              <p className="truncate text-sm text-cream/55">
                {[tuned.city, tuned.genre ? t.radio.genres[tuned.genre] : "", freqLabel(tuned.freq, t.radio.live)].filter(Boolean).join(" · ")}
              </p>
              <p className={cn("text-sm leading-snug", phase === "error" ? "text-coral" : phase === "playing" ? "text-sun" : "text-cream/60")}>{status}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => (phase === "playing" || phase === "loading" ? livePlayer.pause() : tune(tuned))}
              aria-label={phase === "playing" || phase === "loading" ? t.radio.pause : t.radio.play}
              className="chunky flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sun font-display font-extrabold text-night [--edge:var(--color-sun-800)]"
            >
              {phase === "loading" ? <Loader2 className="size-5 animate-spin" /> : phase === "playing" ? <Pause className="size-5" /> : <Play className="size-5 fill-night" />}
              {phase === "loading" ? t.radio.loading : phase === "playing" ? t.radio.pause : t.radio.play}
            </button>
            <button
              type="button"
              onClick={() => livePlayer.halt()}
              aria-label={t.radio.stop}
              disabled={phase === "idle" && playback.stationId !== tuned.id}
              className="chunky grid size-12 shrink-0 place-items-center rounded-2xl bg-night-600 text-cream ring-1 ring-white/10 [--edge:var(--color-night)] disabled:opacity-40"
            >
              <Square className="size-4 fill-cream" />
            </button>
          </div>
        </div>
      )}

      {!ready ? (
        <p className="flex items-center justify-center gap-2 px-2 py-8 text-sm text-cream/60">
          <Loader2 className="size-4 animate-spin" /> {t.radio.loadingList}
        </p>
      ) : stations.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-cream/60">{t.radio.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {stations.map((station) => {
            const on = station.id === tunedId;
            const spinning = on && phase === "loading";
            const playing = on && phase === "playing";
            return (
              <li key={station.id}>
                <button
                  type="button"
                  onClick={() => tune(station)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl bg-night-800 px-3 py-2.5 text-left ring-1 ring-white/8",
                    phone ? "min-h-14" : "min-h-16",
                    on && "bg-night-700 ring-2 ring-sun",
                  )}
                >
                  <StationMark station={station} className={phone ? "size-10 text-xs" : "size-12 text-sm"} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-display leading-tight font-extrabold", phone ? "text-base" : "text-lg")}>{station.name}</span>
                    <span className="block truncate text-sm text-cream/55">
                      {[station.city, station.genre ? t.radio.genres[station.genre] : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-sm font-bold text-cream/70 tabular">{freqLabel(station.freq, t.radio.live)}</span>
                  {playing && <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-coral" aria-hidden="true" />}
                  {spinning && <Loader2 className="size-4 shrink-0 animate-spin text-sun" aria-hidden="true" />}
                  {!playing && !spinning && <Radio className="size-4 shrink-0 text-cream/30" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
