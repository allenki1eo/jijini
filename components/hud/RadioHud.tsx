"use client";

import { AnimatePresence, m } from "motion/react";
import { Loader2, Pause, Play, Radio as RadioIcon, Square, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { livePlayer, liveStations, loadLiveStations, useLiveCatalog, useLivePlayback } from "@/game/audio/LiveRadio";
import { Radio } from "@/game/audio/Radio";
import { events } from "@/game/core/events";
import { fmt, useT } from "@/i18n";
import { useSettings } from "@/stores/settings";

const SHOW_FOR = 9000;

const freqLabel = (freq: string, liveWord: string) => (!freq || freq === "LIVE" ? liveWord : freq);

/** The boda's radio. Tap the chip (or press R) for the next station; pause and stop use the same player as the phone. */
export function RadioChip() {
  const t = useT();
  const stationId = useSettings((s) => s.radio);
  useLiveCatalog((s) => s.revision);
  const playback = useLivePlayback();
  const station = liveStations.find((s) => s.id === stationId);
  const phase = playback.stationId === station?.id ? playback.phase : "idle";
  const [line, setLine] = useState<{ id: number; text: string; color: string } | null>(null);

  useEffect(() => {
    void loadLiveStations();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyR" && !e.repeat && !(e.target instanceof HTMLInputElement)) Radio.cycle();
    };
    window.addEventListener("keydown", onKey);
    const off = events.on("radio", ({ station: id, text }) => {
      const color = liveStations.find((s) => s.id === id)?.color ?? "#FFC72C";
      const entry = { id: performance.now(), text, color };
      setLine(entry);
      window.setTimeout(() => setLine((cur) => (cur?.id === entry.id ? null : cur)), SHOW_FOR);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, []);

  const status =
    phase === "loading"
      ? t.radio.loading
      : phase === "error"
        ? playback.problem === "offline"
          ? t.radio.offline
          : fmt(t.radio.unavailable, { name: station?.name ?? "" })
        : null;

  const volume = () => {
    const s = useSettings.getState();
    return s.masterVolume * s.musicVolume;
  };

  const toggle = () => {
    if (!station) return;
    if (phase === "playing" || phase === "loading") livePlayer.pause();
    else livePlayer.play(station, volume(), "user");
  };

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => Radio.cycle()}
        title={t.radio.change}
        aria-label={station ? `${station.name} ${freqLabel(station.freq, t.radio.live)} · ${t.radio.change}` : t.radio.off}
        className="flex min-h-12 max-w-[11rem] items-center gap-2 rounded-2xl bg-night-600/95 px-3 font-display text-sm font-bold text-cream ring-1 ring-white/10 backdrop-blur"
      >
        {station ? (
          phase === "loading" ? <Loader2 className="size-5 shrink-0 animate-spin text-sun" /> : <RadioIcon className="size-5 shrink-0" style={{ color: station.color }} />
        ) : (
          <VolumeX className="size-5 shrink-0 text-cream/50" />
        )}
        {station ? (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate">{station.name}</span>
            <span className="shrink-0 text-cream/60 tabular">{freqLabel(station.freq, t.radio.live)}</span>
          </span>
        ) : (
          <span className="truncate text-cream/60">{t.radio.off}</span>
        )}
      </button>
      {station && (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-label={phase === "playing" || phase === "loading" ? t.radio.pause : t.radio.play}
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-night-600/95 text-cream ring-1 ring-white/10 backdrop-blur"
          >
            {phase === "playing" || phase === "loading" ? <Pause className="size-5" /> : <Play className="size-5 fill-cream" />}
          </button>
          <button
            type="button"
            onClick={() => livePlayer.halt()}
            aria-label={t.radio.stop}
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-night-600/95 text-cream ring-1 ring-white/10 backdrop-blur"
          >
            <Square className="size-4 fill-cream" />
          </button>
        </>
      )}
      <AnimatePresence>
        {(line || status) && (
          <m.p
            key={line?.id ?? status}
            className="absolute top-14 left-0 w-[min(18rem,calc(100vw-2rem))] rounded-2xl rounded-tl-sm border-l-4 bg-night/85 px-3 py-2 text-sm leading-snug text-cream/90 shadow-lg backdrop-blur"
            style={{ borderColor: station?.color ?? "#FFC72C" }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {status ?? (
              <>
                <span className="mr-1.5 font-display font-extrabold" style={{ color: line?.color }}>
                  {station ? freqLabel(station.freq, t.radio.live) : ""}
                </span>
                {line?.text}
              </>
            )}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
