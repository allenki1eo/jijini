"use client";

import { Crown, Flag, Medal, Pencil, Play, RefreshCw, Timer, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { formatClock } from "@/components/missions/stopLabel";
import { Card, Segmented } from "@/components/ui";
import { CITIES, CITY_ORDER, type CityId } from "@/data/cities/config";
import { weekKey } from "@/game/systems/progression";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { fetchBoard, riderName, type Board, type BoardKind } from "@/lib/leaderboard";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { ScreenHeader } from "./ScreenHeader";

const PODIUM = ["from-sun-300 to-sun-600 text-night", "from-[#E8ECF2] to-[#AEB7C4] text-night", "from-[#E2A06A] to-[#A9643A] text-night"];

const noop = () => () => {};

/** Days until the ISO week ends (Sunday night). */
const daysLeft = () => {
  const day = new Date().getDay() || 7;
  return 8 - day;
};

/**
 * Ligi: each city's boards for the week. The weekly race is the same course
 * for everyone (best time wins); the earnings board adds up every job's pay.
 * Pick your name, pick a city, and race from here.
 */
export function LeaderboardScreen() {
  const t = useT();
  const unlocked = usePlayer((s) => s.cities);
  const lastCity = usePlayer((s) => s.lastCity);
  const shareStats = useSettings((s) => s.shareStats);
  const name = useSettings((s) => s.riderName);
  // The default name comes from the install id in localStorage: browser-only, so it isn't part of the server render.
  const shownName = useSyncExternalStore(noop, () => name || riderName(), () => name);
  const setSetting = useSettings((s) => s.set);
  const [city, setCity] = useState<CityId>(lastCity);
  const [kind, setKind] = useState<BoardKind>("race");
  const [board, setBoard] = useState<{ key: string; data: Board } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const wanted = `${city}:${kind}:${nonce}`;
  const loading = board?.key !== wanted;

  // Fetch whenever the city, the board or the refresh button changes; the result is keyed so a slow answer never shows under the wrong tab.
  useEffect(() => {
    let live = true;
    fetchBoard(city, kind)
      .catch((): Board => ({ rows: [], configured: true, error: true }))
      .then((data) => live && setBoard({ key: wanted, data }));
    return () => {
      live = false;
    };
  }, [city, kind, wanted]);
  const load = useCallback(() => setNonce((n) => n + 1), []);
  const shown = board?.data ?? null;

  const value = (v: number) => (kind === "race" ? formatClock(v) : `TSh ${formatTzs(v)}`);
  const canRace = unlocked.includes(city);

  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_100%_0%,rgb(255_199_44/0.16),transparent_60%)]" />
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-3xl flex-col gap-5 py-4">
        <ScreenHeader
          title={t.league.title}
          action={
            <button type="button" onClick={load} aria-label={t.common.retry} className="chunky grid size-12 place-items-center rounded-2xl bg-night-600 ring-1 ring-white/10 [--edge:var(--color-night)]">
              <RefreshCw className={cn("size-5", loading && "animate-spin")} />
            </button>
          }
        />

        {/* Who you are on the boards. */}
        <Card className="flex items-center gap-3 p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun text-night">
            <Crown className="size-5" />
          </span>
          {editing ? (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSetting("riderName", draft.trim().slice(0, 20));
                setEditing(false);
              }}
            >
              <input
                autoFocus
                value={draft}
                maxLength={20}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t.league.namePlaceholder}
                className="h-11 min-w-0 flex-1 rounded-xl bg-night-600 px-3 font-display font-bold ring-1 ring-white/10 outline-none select-text focus:ring-sun"
              />
              <button type="submit" className="chunky rounded-xl bg-sun px-4 font-display font-extrabold text-night [--edge:var(--color-sun-800)]">
                {t.league.save}
              </button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-cream/55">{t.league.you}</p>
                <p className="truncate font-display text-lg font-extrabold">{shownName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-cream/70 ring-1 ring-white/10 hover:bg-white/5"
              >
                <Pencil className="size-4" /> {t.league.rename}
              </button>
            </>
          )}
        </Card>
        {!shareStats && <p className="rounded-2xl bg-coral/15 p-3 text-sm text-coral">{t.league.sharingOff}</p>}

        {/* Cities. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {CITY_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCity(id)}
              aria-pressed={city === id}
              className={cn("shrink-0 rounded-full px-4 py-2 font-display text-sm font-bold ring-1 transition-colors", city === id ? "bg-sun text-night ring-sun" : "bg-night-600 text-cream/80 ring-white/10 hover:bg-night-500")}
            >
              {CITIES[id].name}
            </button>
          ))}
        </div>

        <Card pattern className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<BoardKind>
              label={t.league.title}
              value={kind}
              onChange={setKind}
              options={[
                { value: "race", label: t.league.race, icon: <Timer /> },
                { value: "earn", label: t.league.earnings, icon: <Wallet /> },
              ]}
            />
            <p className="text-xs text-cream/60">
              {weekKey().replace("-W", " · ")} · {fmt(t.league.endsIn, { days: daysLeft() })}
            </p>
          </div>
          <p className="mt-3 text-sm text-cream/70">{kind === "race" ? t.league.raceHint : t.league.earnHint}</p>

          {shown && !shown.configured ? (
            <p className="mt-5 rounded-2xl bg-white/5 p-4 text-center text-sm text-cream/60">{t.league.offline}</p>
          ) : shown && !shown.rows.length ? (
            <p className="mt-5 rounded-2xl bg-white/5 p-6 text-center text-cream/70">
              <Flag className="mx-auto mb-2 size-7 text-sun" />
              {t.league.empty}
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-1.5">
              {(shown?.rows ?? []).map((r) => (
                <li key={r.rank} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1", r.me ? "bg-sun/15 ring-sun/50" : "bg-night-700 ring-white/5")}>
                  {r.rank <= 3 ? (
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-b font-display font-extrabold", PODIUM[r.rank - 1])}>
                      {r.rank === 1 ? <Trophy className="size-4" /> : <Medal className="size-4" />}
                    </span>
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-night-500 font-display font-extrabold text-cream/70 tabular">{r.rank}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-display font-bold">
                    {r.name}
                    {r.me && <span className="ml-2 text-xs text-sun">{t.league.meTag}</span>}
                  </span>
                  <b className="font-display tabular">{value(r.value)}</b>
                </li>
              ))}
            </ol>
          )}
          {shown?.me && !shown.rows.some((r) => r.me) && (
            <p className="mt-3 flex items-center justify-between rounded-2xl bg-sun/15 px-3 py-2.5 ring-1 ring-sun/50">
              <span className="font-display font-bold">
                #{shown.me.rank} · {shownName}
              </span>
              {shown.me.value !== null && <b className="font-display tabular">{value(shown.me.value)}</b>}
            </p>
          )}
          {shown?.total ? <p className="mt-3 text-center text-xs text-cream/50">{fmt(t.league.riders, { n: shown.total })}</p> : null}
        </Card>

        {kind === "race" &&
          (canRace ? (
            <Link
              href={`/play?city=${city}&race=weekly`}
              className="chunky flex min-h-14 items-center justify-center gap-2 rounded-[1.15rem] bg-sun font-display text-lg font-extrabold text-night [--edge:var(--color-sun-800)]"
            >
              <Play className="size-5" /> {fmt(t.league.raceNow, { city: CITIES[city].name })}
            </Link>
          ) : (
            <p className="text-center text-sm text-cream/60">{t.league.locked}</p>
          ))}
      </div>
    </main>
  );
}
