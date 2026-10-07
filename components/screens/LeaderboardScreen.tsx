"use client";

import { Award, Flag, Gift, LogIn, Play, RefreshCw, Timer, Trophy, UserPlus, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RiderAvatar, TierBadge } from "@/components/account/RiderBadge";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { formatClock } from "@/components/missions/stopLabel";
import { ButtonLink, Card, Segmented } from "@/components/ui";
import { CITIES, CITY_ORDER, isCityId, type CityId } from "@/data/cities/config";
import { NATIONAL, nextTier, previousWeek, tierFor } from "@/data/league";
import { leaguePrize } from "@/game/systems/money";
import { fmt, formatTzs, useT } from "@/i18n";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/cn";
import { claimPrizes, fetchBoard, fetchPrizes, type Board, type BoardKind, type BoardRow, type Prizes } from "@/lib/leaderboard";
import { weekKey } from "@/lib/week";
import { usePlayer } from "@/stores/player";
import { ScreenHeader } from "./ScreenHeader";

type Scope = CityId | typeof NATIONAL;

/** Days until the ISO week ends (Sunday night). */
const daysLeft = () => {
  const day = new Date().getDay() || 7;
  return 8 - day;
};

const cityName = (id?: string) => (id && isCityId(id) ? CITIES[id].name : "");

/**
 * Ligi: the week's standings (points from every job and race, per city and
 * for all Tanzania), the weekly race and the earnings board. Registered
 * riders score; guests see the boards and an invitation to join. Last
 * week's winners collect their prizes here.
 */
export function LeaderboardScreen() {
  const t = useT();
  const unlocked = usePlayer((s) => s.cities);
  const lastCity = usePlayer((s) => s.lastCity);
  const account = useAccount((s) => s.account);
  const [scope, setScope] = useState<Scope>(lastCity);
  const [kind, setKind] = useState<BoardKind>("points");
  const [board, setBoard] = useState<{ key: string; data: Board } | null>(null);
  const [mine, setMine] = useState<{ key: string; points: number; rank: number | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const shownKind: BoardKind = scope === NATIONAL ? "points" : kind;
  const wanted = `${scope}:${shownKind}:${nonce}`;
  const loading = board?.key !== wanted;
  const meKey = `${account?.id ?? ""}:${nonce}`;

  // Fetch whenever the scope, the board or the refresh button changes; results are keyed so a slow answer never shows under the wrong tab.
  useEffect(() => {
    let live = true;
    fetchBoard(scope, shownKind)
      .catch((): Board => ({ rows: [], configured: true, error: true }))
      .then((data) => live && setBoard({ key: wanted, data }));
    return () => {
      live = false;
    };
  }, [scope, shownKind, wanted]);

  // The rider's own week, from the national standings.
  useEffect(() => {
    if (!account) return;
    let live = true;
    fetchBoard(NATIONAL, "points")
      .then((b) => live && setMine({ key: meKey, points: b.me?.value ?? 0, rank: b.me?.rank ?? null }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account, meKey]);

  const load = useCallback(() => setNonce((n) => n + 1), []);
  const shown = board?.data ?? null;
  const canRace = scope !== NATIONAL && unlocked.includes(scope);
  const hint = scope === NATIONAL ? t.league.nationalHint : kind === "race" ? t.league.raceHint : kind === "earn" ? t.league.earnHint : t.league.pointsHint;

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

        {account ? <MyWeek name={account.name} city={cityName(account.city)} points={mine?.key === meKey ? mine.points : null} rank={mine?.key === meKey ? mine.rank : null} /> : <JoinCard />}
        {account && <PrizeBanner onClaimed={load} />}

        {/* Where: all Tanzania, or one city. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {([NATIONAL, ...CITY_ORDER] as Scope[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              aria-pressed={scope === id}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 font-display text-sm font-bold ring-1 transition-colors",
                scope === id ? "bg-sun text-night ring-sun" : "bg-night-600 text-cream/80 ring-white/10 hover:bg-night-500",
              )}
            >
              {id === NATIONAL && <TzFlag />}
              {id === NATIONAL ? t.league.national : CITIES[id].name}
            </button>
          ))}
        </div>

        <Card pattern className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {scope === NATIONAL ? (
              <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                <Trophy className="size-5 text-sun" /> {t.league.points}
              </h2>
            ) : (
              <Segmented<BoardKind>
                size="sm"
                label={t.league.title}
                value={kind}
                onChange={setKind}
                options={[
                  { value: "points", label: t.league.points, icon: <Trophy /> },
                  { value: "race", label: t.league.raceTab, icon: <Timer /> },
                  { value: "earn", label: t.league.earnings, icon: <Wallet /> },
                ]}
              />
            )}
            <p className="text-xs text-cream/60">
              {weekKey().replace("-W", " · ")} · {fmt(t.league.endsIn, { days: daysLeft() })}
            </p>
          </div>
          <p className="mt-3 text-sm text-cream/70">{hint}</p>

          {shown && !shown.configured ? (
            <p className="mt-5 rounded-2xl bg-white/5 p-4 text-center text-sm text-cream/60">{t.league.offline}</p>
          ) : shown && !shown.rows.length ? (
            <p className="mt-5 rounded-2xl bg-white/5 p-6 text-center text-cream/70">
              <Flag className="mx-auto mb-2 size-7 text-sun" />
              {t.league.empty}
            </p>
          ) : (
            <BoardList rows={shown?.rows ?? []} kind={shownKind} national={scope === NATIONAL} dim={loading} />
          )}
          {shown?.me && !shown.rows.some((r) => r.me) && account && (
            <div className="mt-2 flex items-center gap-3 rounded-2xl bg-sun/15 px-3 py-2.5 ring-1 ring-sun/50">
              <span className="w-9 text-center font-display font-extrabold tabular">#{shown.me.rank}</span>
              <span className="min-w-0 flex-1 truncate font-display font-bold">{account.name}</span>
              {shown.me.value !== null && <b className="font-display tabular">{formatValue(shownKind, shown.me.value, t.league.pointsUnit)}</b>}
            </div>
          )}
          {shown?.total ? <p className="mt-3 text-center text-xs text-cream/50">{fmt(t.league.riders, { n: shown.total })}</p> : null}
        </Card>

        {scope !== NATIONAL &&
          kind === "race" &&
          (canRace ? (
            <Link
              href={`/play?city=${scope}&race=weekly`}
              className="chunky flex min-h-14 items-center justify-center gap-2 rounded-[1.15rem] bg-sun font-display text-lg font-extrabold text-night [--edge:var(--color-sun-800)]"
            >
              <Play className="size-5" /> {fmt(t.league.raceNow, { city: CITIES[scope].name })}
            </Link>
          ) : (
            <p className="text-center text-sm text-cream/60">{t.league.locked}</p>
          ))}

        <p className="flex items-start gap-2 px-1 text-sm text-cream/55">
          <Gift className="mt-0.5 size-4 shrink-0 text-sun" /> {t.league.prizesInfo}
        </p>
      </div>
    </main>
  );
}

const formatValue = (kind: BoardKind, v: number, unit: string) => (kind === "race" ? formatClock(v) : kind === "earn" ? `TSh ${formatTzs(v)}` : `${formatTzs(v)} ${unit}`);

/** The tiny flag for the national board. */
function TzFlag() {
  return (
    <svg viewBox="0 0 30 20" className="h-3 w-[1.1rem] rounded-[2px]" aria-hidden>
      <path d="M0 0h30L0 20z" fill="#1EB53A" />
      <path d="M30 0v20H0z" fill="#00A3DD" />
      <path d="M0 20 30 0" stroke="#FCD116" strokeWidth="8" />
      <path d="M0 20 30 0" stroke="#000" strokeWidth="5" />
    </svg>
  );
}

const PODIUM = [
  { place: 2, h: "h-16", medal: "from-[#E8ECF2] to-[#AEB7C4]" },
  { place: 1, h: "h-24", medal: "from-sun-300 to-sun-600" },
  { place: 3, h: "h-12", medal: "from-[#E2A06A] to-[#A9643A]" },
];

function BoardList({ rows, kind, national, dim }: { rows: BoardRow[]; kind: BoardKind; national: boolean; dim: boolean }) {
  const t = useT();
  const podium = rows.length >= 3 ? rows.slice(0, 3) : [];
  const rest = podium.length ? rows.slice(3) : rows;
  return (
    <div className={cn("transition-opacity", dim && "opacity-60")}>
      {podium.length > 0 && (
        <div className="mt-5 grid grid-cols-3 items-end gap-2">
          {PODIUM.map(({ place, h, medal }) => {
            const r = podium[place - 1]!;
            return (
              <div key={place} className="flex min-w-0 flex-col items-center gap-1.5">
                <div className="relative">
                  <RiderAvatar name={r.name} className={cn(place === 1 ? "size-16 text-xl" : "size-12", r.me && "ring-sun")} />
                  {place === 1 && <Trophy className="absolute -top-3 left-1/2 size-5 -translate-x-1/2 fill-sun text-sun-700" />}
                </div>
                <p className="w-full truncate text-center font-display text-sm font-extrabold">{r.name}</p>
                <p className="font-display text-xs font-bold text-cream/70 tabular">{formatValue(kind, r.value, t.league.pointsUnit)}</p>
                <div className={cn("grid w-full place-items-center rounded-t-2xl bg-gradient-to-b font-display text-2xl font-extrabold text-night shadow-[inset_0_2px_0_rgb(255_255_255/0.4)]", h, medal)}>{place}</div>
              </div>
            );
          })}
        </div>
      )}
      <ol className={cn("flex flex-col gap-1.5", podium.length ? "mt-2" : "mt-4")}>
        {rest.map((r) => (
          <li key={r.rank} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2 ring-1", r.me ? "bg-sun/15 ring-sun/50" : "bg-night-700 ring-white/5")}>
            <span className="w-7 text-center font-display font-extrabold text-cream/60 tabular">{r.rank}</span>
            <RiderAvatar name={r.name} className="size-9 text-sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-bold">
                {r.name}
                {r.me && <span className="ml-2 text-xs text-sun">{t.league.meTag}</span>}
              </span>
              {national && r.city && <span className="block text-xs text-cream/50">{cityName(r.city)}</span>}
            </span>
            {kind === "points" && <TierBadge points={r.value} compact />}
            <b className="font-display tabular">{formatValue(kind, r.value, t.league.pointsUnit)}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The signed-in rider's week: division, points, rank and how far to the next division. */
function MyWeek({ name, city, points, rank }: { name: string; city: string; points: number | null; rank: number | null }) {
  const t = useT();
  const p = points ?? 0;
  const tier = tierFor(p);
  const next = nextTier(p);
  const progress = next ? (p - tier.min) / (next.tier.min - tier.min) : 1;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 p-4">
        <RiderAvatar name={name} className="size-14 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl leading-tight font-extrabold">{name}</p>
          <p className="text-sm text-cream/60">
            {city} · {rank ? fmt(t.league.rank, { n: rank }) : t.league.unranked}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <TierBadge tier={tier.id} />
          <p className="font-display text-lg font-extrabold tabular">
            {points === null ? "–" : formatTzs(p)} <span className="text-sm text-cream/60">{t.league.pointsUnit}</span>
          </p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="h-2.5 overflow-hidden rounded-full bg-night-600" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(4, progress * 100)}%`, background: `linear-gradient(90deg, ${tier.bg}, ${(next?.tier ?? tier).bg})` }} />
        </div>
        <p className="mt-1.5 text-xs text-cream/60">{next ? fmt(t.league.toNext, { n: formatTzs(next.need), tier: t.league.tiers[next.tier.id] }) : t.league.topTier}</p>
      </div>
    </Card>
  );
}

/** Guests: what the league is, and the way in. */
function JoinCard() {
  const t = useT();
  return (
    <Card pattern className="overflow-hidden p-0 ring-sun/40">
      <KitengeStrip className="h-3 w-full" />
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sun text-night shadow-[inset_0_-4px_0_var(--color-sun-800)]">
          <Award className="size-7" />
        </span>
        <div className="flex-1">
          <h2 className="font-display text-xl font-extrabold">{t.league.joinTitle}</h2>
          <p className="mt-1 text-sm text-cream/70">{t.league.joinText}</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/akaunti?next=/ligi" variant="sun" icon={<UserPlus />}>
            {t.league.joinCta}
          </ButtonLink>
          <ButtonLink href="/akaunti?next=/ligi#ingia" variant="night" icon={<LogIn />}>
            {t.league.signIn}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/** Last week's prizes, if any, with the button that pays them into BodaPesa. */
function PrizeBanner({ onClaimed }: { onClaimed: () => void }) {
  const t = useT();
  const [prizes, setPrizes] = useState<Prizes | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    fetchPrizes()
      .then((p) => live && setPrizes(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (done)
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-forest/20 px-4 py-3 font-display font-bold text-forest-300 ring-1 ring-forest/40">
        <Gift className="size-5" /> {t.league.claimed}
      </p>
    );
  if (!prizes || prizes.claimed || !prizes.total) return null;
  const lastWeek = previousWeek(weekKey());
  const board = { points: t.league.points, race: t.league.race, tier: "" };
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-sun/25 via-night-800 to-night-800 p-5 ring-sun/60">
      <Gift className="absolute -top-3 -right-3 size-28 rotate-12 text-sun/10" />
      <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-sun">
        <Gift className="size-5" /> {t.league.prizesTitle}
      </h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {prizes.wins.map((w) => (
          <li key={`${w.board}:${w.city}`} className="flex items-center justify-between gap-3 rounded-xl bg-night/50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {w.tier && <TierBadge tier={w.tier} compact />}
              {w.board === "tier" ? fmt(t.league.prizeTier, { tier: t.league.tiers[w.tier!] }) : fmt(t.league.prizeRank, { rank: w.rank, board: board[w.board], city: cityName(w.city) })}
            </span>
            <b className="shrink-0 font-display whitespace-nowrap text-sun tabular">TSh {formatTzs(w.amount)}</b>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void claimPrizes(lastWeek).then((out) => {
            setBusy(false);
            if (out?.ok && out.paid) leaguePrize(out.paid, lastWeek);
            if (out?.ok || out?.error === "claimed") {
              setDone(Boolean(out.ok && out.paid));
              setPrizes({ ...prizes, claimed: true });
              onClaimed();
            }
          });
        }}
        className="chunky mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-sun font-display text-lg font-extrabold text-night [--edge:var(--color-sun-800)] disabled:opacity-60"
      >
        <Gift className="size-5" /> {fmt(t.league.claim, { amount: formatTzs(prizes.total) })}
      </button>
    </Card>
  );
}
