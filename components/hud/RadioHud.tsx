"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, ChevronDown, Loader2, Power, Radio as RadioIcon, SignalLow, VolumeX, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { livePlayer, liveStations, loadLiveStations, useLiveCatalog, useLivePlayback, type LiveStation } from "@/game/audio/LiveRadio";
import { Radio, radioHud } from "@/game/audio/Radio";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useHudTick } from "./useHudTick";
import { useSettings } from "@/stores/settings";

/** Three bars bouncing to the beat: this is the station that's on. */
function Equalizer({ color, still }: { color: string; still?: boolean }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {[0, 0.25, 0.5].map((delay) => (
        <span key={delay} className={cn("h-full w-[3px] origin-bottom rounded-full", still ? "scale-y-50" : "animate-eq")} style={{ background: color, animationDelay: `${-delay}s` }} />
      ))}
    </span>
  );
}

function StationRow({ name, freq, sub, color, active, connecting, onPick }: { name: string; freq: string; sub: string; color: string; active: boolean; connecting?: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={cn("group flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors", active ? "bg-white/10" : "hover:bg-white/5")}
      >
        <span
          className="grid h-9 min-w-12 place-items-center rounded-xl px-1.5 font-display text-[11px] leading-none font-extrabold tracking-tight text-night tabular shadow-inner"
          style={{ background: color }}
        >
          {freq}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm leading-tight font-bold text-cream">{name}</span>
          <span className="block truncate text-[11px] text-cream/50">{sub}</span>
        </span>
        <span className="grid size-6 shrink-0 place-items-center">
          {active ? connecting ? <Loader2 className="size-4 animate-spin text-cream/70" /> : <Equalizer color={color} /> : <Check className="size-4 text-transparent" />}
        </span>
      </button>
    </li>
  );
}

/** The boda's radio: tap to pick a live Tanzanian station, R to flip to the next one. */
/** `compact`: icon only (portrait phones), the station shows in the picker. */
export function RadioChip({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const station = useSettings((s) => s.radio);
  const set = useSettings((s) => s.set);
  const phase = useLivePlayback((s) => (s.stationId === station ? s.phase : "idle"));
  const ready = useLiveCatalog((s) => s.ready);
  useLiveCatalog((s) => s.revision);
  const live: LiveStation[] = liveStations;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const info = live.find((s) => s.id === station);
  const connecting = Boolean(info) && phase === "loading";
  useHudTick(2);
  const weak = radioHud.signal < 0.6;

  useEffect(() => {
    void loadLiveStations();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "KeyR" && !e.repeat) Radio.cycle();
      if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tapping anywhere else closes the picker.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (id: string) => {
    // Tapping the station that just failed tries it again.
    const again = id === station && phase === "error" ? live.find((s) => s.id === id) : undefined;
    if (again) {
      const s = useSettings.getState();
      livePlayer.play(again, s.masterVolume * s.musicVolume, "user");
    } else set("radio", id);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t.radio.pick}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={info ? `${info.name} ${info.freq} · ${t.radio.pick}` : `${t.radio.off} · ${t.radio.pick}`}
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-2xl bg-night-600/95 font-display text-sm font-bold text-cream ring-1 backdrop-blur transition-colors",
          compact ? "min-w-12 justify-center px-2" : "px-3",
          open ? "ring-sun/60" : "ring-white/10",
        )}
      >
        {connecting ? (
          <Loader2 className="size-5 animate-spin text-cream/70" />
        ) : info ? (
          <span className="relative">
            <RadioIcon className="size-5" style={{ color: info.color }} />
            {/* Far from town the signal fades (and the static comes in). */}
            {weak && <SignalLow className="absolute -top-1.5 -right-2 size-3.5 rounded-full bg-coral p-[1.5px] text-night" strokeWidth={3} aria-label={t.radio.weak} />}
          </span>
        ) : (
          <VolumeX className="size-5 text-cream/50" />
        )}
        {info ? (
          <span className="flex items-baseline gap-1.5 tabular">
            <span className="animate-pulse rounded bg-coral px-1 text-[10px] leading-4 font-extrabold text-cream">LIVE</span>
            {!compact && <span className="max-w-24 truncate">{info.freq}</span>}
            <span className="hidden max-w-36 truncate text-cream/60 xl:inline">{info.name}</span>
          </span>
        ) : (
          <span className={cn("hidden text-cream/60", !compact && "sm:inline")}>{t.radio.off}</span>
        )}
        {!compact && <ChevronDown className={cn("size-4 text-cream/50 transition-transform", open && "rotate-180")} />}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            role="listbox"
            aria-label={t.radio.pick}
            className="absolute top-14 left-0 z-30 flex max-h-[min(72vh,30rem)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.4rem] bg-night-800/95 shadow-2xl ring-1 ring-white/12 backdrop-blur"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            style={{ transformOrigin: "top left" }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 pt-3 pb-2">
              <span className="font-display text-base font-extrabold">{t.radio.pickerTitle}</span>
              <kbd className="hidden rounded-md bg-white/8 px-1.5 py-0.5 font-display text-[10px] font-bold text-cream/60 sm:inline">{t.radio.cycleHint}</kbd>
            </div>
            <div className="overflow-y-auto overscroll-contain px-2 pb-2">
              {live.length === 0 && (
                <p className="flex items-center gap-2 px-2 pt-4 pb-2 text-sm text-cream/60">
                  {ready ? (
                    t.radio.none
                  ) : (
                    <>
                      <Loader2 className="size-4 animate-spin" /> {t.radio.loadingList}
                    </>
                  )}
                </p>
              )}
              {live.length > 0 && (
                <>
                  <p className="flex items-center gap-1.5 px-2 pt-3 pb-1 font-display text-[11px] font-bold tracking-wide text-cream/45 uppercase">
                    <Wifi className="size-3" /> {t.radio.liveGroup}
                  </p>
                  <ul>
                    {live.map((s) => (
                      <StationRow
                        key={s.id}
                        name={s.name}
                        freq={s.freq}
                        sub={connecting && station === s.id ? t.radio.connecting : (s.city ?? "")}
                        color={s.color}
                        active={station === s.id}
                        connecting={connecting}
                        onPick={() => pick(s.id)}
                      />
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                onClick={() => pick("off")}
                className={cn("mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-2 font-display text-sm font-bold", station === "off" ? "bg-coral/15 text-coral" : "text-cream/60 hover:bg-white/5")}
              >
                <Power className="size-4" /> {t.radio.turnOff}
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
