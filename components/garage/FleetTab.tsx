"use client";

import { Bike, Building2, Coins, Lock, Wrench } from "lucide-react";
import { FLEET_BIKES, FLEET_RIDERS, MAX_FLEET, fleetRepairCost, fleetResale } from "@/data/fleet";
import { HESABU } from "@/data/prices";
import { BIKES } from "@/game/vehicles/bikes";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer } from "@/stores/player";

/** A fresh id for a new fleet bike: one past the highest number used so far. */
const nextFleetId = (fleet: { id: string }[]) => `boda-${fleet.reduce((max, f) => Math.max(max, Number(f.id.split("-")[1]) || 0), 0) + 1}`;

/**
 * The boda company: buy bikes for hire, see who rides them and what they
 * bring in, send worn ones to the fundi, sell the ones you don't need.
 */
export function FleetTab({ onToast }: { onToast: (text: string) => void }) {
  const t = useT();
  const p = usePlayer();
  const ownBike = p.owned.some((id) => id !== "mkopo");
  const cityRate = HESABU[p.lastCity] / 10_000;
  const daily = p.fleet.reduce((sum, f) => sum + (FLEET_BIKES.find((b) => b.id === f.bike)?.daily ?? 0) * cityRate * (f.condition < 30 ? 0.5 : 1), 0);
  const full = p.fleet.length >= MAX_FLEET;

  if (!ownBike)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-night-700 p-6 text-center">
        <Lock className="size-8 text-cream/50" />
        <p className="text-cream/70">{t.fleet.locked}</p>
      </div>
    );

  const buy = (id: (typeof FLEET_BIKES)[number]["id"]) => {
    const price = BIKES[id].price;
    if (!p.spendAny(price)) return onToast(t.garage.notEnough);
    const taken = new Set(p.fleet.map((f) => f.rider));
    const rider = FLEET_RIDERS.find((n) => !taken.has(n)) ?? `Dereva ${p.fleet.length + 1}`;
    p.patch({ fleet: [...p.fleet, { id: `${nextFleetId(p.fleet)}`, bike: id, rider, condition: 100, earned: 0 }] });
    onToast(fmt(t.fleet.hired, { name: rider }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-gradient-to-br from-forest to-forest-800 p-4">
        <p className="flex items-center gap-2 font-display font-extrabold">
          <Building2 className="size-5 text-sun" /> {t.fleet.title}
        </p>
        <p className="mt-1 text-sm text-cream/75">{t.fleet.intro}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <span className="rounded-xl bg-black/15 px-3 py-2">
            <span className="block text-xs opacity-75">{t.fleet.daily}</span>
            <b className="font-display text-lg tabular">TSh {formatTzs(Math.round(daily / 100) * 100)}</b>
          </span>
          <span className="rounded-xl bg-black/15 px-3 py-2">
            <span className="block text-xs opacity-75">{fmt(t.fleet.bikes, { n: p.fleet.length, max: MAX_FLEET })}</span>
            <span className="mt-1 flex gap-1">
              {Array.from({ length: MAX_FLEET }, (_, i) => (
                <span key={i} className={cn("h-2 flex-1 rounded-full", i < p.fleet.length ? "bg-sun" : "bg-white/15")} />
              ))}
            </span>
          </span>
        </div>
      </div>

      {p.fleet.length > 0 && (
        <ul className="grid gap-2">
          {p.fleet.map((f) => {
            const repair = fleetRepairCost(f.condition);
            const resale = fleetResale(BIKES[f.bike].price, f.condition);
            return (
              <li key={f.id} className="flex flex-col gap-2 rounded-2xl bg-night-700 p-3 ring-1 ring-white/6">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: BIKES[f.bike].color }}>
                    <Bike className="size-5 text-cream" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold">{BIKES[f.bike].name}</p>
                    <p className="text-xs text-cream/60">
                      {fmt(t.fleet.rider, { name: f.rider })} · {fmt(t.fleet.earned, { amount: formatTzs(f.earned) })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" aria-label={fmt(t.fleet.condition, { pct: Math.round(f.condition) })}>
                    <span className={cn("block h-full rounded-full", f.condition < 30 ? "bg-coral" : f.condition < 60 ? "bg-sun" : "bg-forest-400")} style={{ width: `${f.condition}%` }} />
                  </span>
                  <span className="w-20 text-right text-xs text-cream/60 tabular">{fmt(t.fleet.condition, { pct: Math.round(f.condition) })}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={repair <= 0 || p.wallet + p.bodapesa < repair}
                    onClick={() => p.spendAny(repair) && p.patch({ fleet: usePlayer.getState().fleet.map((x) => (x.id === f.id ? { ...x, condition: 100 } : x)) })}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-night-600 py-2 text-sm font-bold ring-1 ring-white/10 disabled:opacity-40"
                  >
                    <Wrench className="size-4" /> {repair <= 0 ? t.station.fine : fmt(t.fleet.repair, { cost: formatTzs(repair) })}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const s = usePlayer.getState();
                      s.patch({ wallet: s.wallet + resale, fleet: s.fleet.filter((x) => x.id !== f.id) });
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold text-coral ring-1 ring-coral/40 hover:bg-coral/10"
                  >
                    <Coins className="size-4" /> {fmt(t.fleet.sell, { price: formatTzs(resale) })}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-2">
        {FLEET_BIKES.map((b) => {
          const price = BIKES[b.id].price;
          const afford = p.wallet + p.bodapesa >= price;
          return (
            <button
              key={b.id}
              type="button"
              disabled={full || !afford}
              onClick={() => buy(b.id)}
              className="chunky flex items-center gap-3 rounded-2xl bg-sun px-4 py-3 text-left text-night [--edge:var(--color-sun-800)] disabled:bg-night-600 disabled:text-cream/50 disabled:[--edge:var(--color-night)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-display font-extrabold">{full ? t.fleet.full : fmt(t.fleet.buy, { bike: BIKES[b.id].name, price: formatTzs(price) })}</span>
                <span className="block text-xs opacity-75">{fmt(t.fleet.perDay, { amount: formatTzs(Math.round((b.daily * cityRate) / 100) * 100) })}</span>
              </span>
              <Building2 className="size-5 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
