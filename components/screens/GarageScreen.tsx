"use client";

import { AnimatePresence, m } from "motion/react";
import { Bike, Check, Coins, Fuel, Gauge, Lock, Megaphone, Paintbrush, ShieldHalf, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, Chip, Segmented, Toggle } from "@/components/ui";
import { BIKE_IDS, BIKES, FUEL_PRICE_PER_L, MAX_UPGRADE, REPAIR_PRICE_PER_POINT, UPGRADE_IDS, rideStats, statBars, upgradeCost, type BikeId, type UpgradeId } from "@/game/vehicles/bikes";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { currentRideStats, usePlayer, type Customization } from "@/stores/player";
import { ScreenHeader } from "./ScreenHeader";

const GarageStage = dynamic(() => import("@/components/garage/GarageStage"), { ssr: false });

type Tab = "bikes" | "upgrades" | "style";

const SWATCHES = ["#C93A31", "#9C4A2E", "#FFC72C", "#0B6E4F", "#00A3DD", "#1F3A63", "#10131A", "#F4F1EA", "#E0457B", "#6A1B9A", "#E37A1F", "#7D8698"];
const COSMETIC_PRICES: Record<string, number> = { led: 6000, mudflaps: 2000, "sticker:reds": 1500, "sticker:yellows": 1500, "sticker:blues": 1500, "sticker:kitenge": 2500 };
const UPGRADE_ICONS: Record<UpgradeId, LucideIcon> = { engine: Gauge, handling: Bike, brakes: ShieldHalf, tank: Fuel, suspension: Sparkles, horn: Megaphone };

function StatBar({ label, value, compare }: { label: string; value: number; compare?: number }) {
  const base = Math.min(1, compare ?? value);
  const v = Math.min(1, value);
  const up = v > base;
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
      <span className="font-display text-sm font-bold text-cream/70">{label}</span>
      <div className="relative h-3 overflow-hidden rounded-full bg-night-600">
        <m.div className="absolute inset-y-0 left-0 rounded-full bg-cream/85" animate={{ width: `${Math.min(v, base) * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 24 }} />
        {compare !== undefined && v !== base && (
          <m.div
            className={cn("absolute inset-y-0 rounded-full", up ? "bg-forest-400" : "bg-coral")}
            animate={{ left: `${Math.min(v, base) * 100}%`, width: `${Math.abs(v - base) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
          />
        )}
      </div>
    </div>
  );
}

function Stats({ id, upgrades, compareTo }: { id: BikeId; upgrades?: Partial<Record<UpgradeId, number>>; compareTo?: ReturnType<typeof rideStats> }) {
  const t = useT();
  const bars = statBars(rideStats(id, upgrades));
  const cmp = compareTo ? statBars(compareTo) : undefined;
  return (
    <div className="grid gap-2">
      {(Object.keys(bars) as (keyof typeof bars)[]).map((k) => (
        <StatBar key={k} label={t.garage.stats[k]} value={bars[k]} compare={cmp?.[k]} />
      ))}
    </div>
  );
}

function Swatches({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-2 font-display text-sm font-bold text-cream/70">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c.toLowerCase()}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn("grid size-10 place-items-center rounded-full ring-2 transition-transform active:scale-90", value.toLowerCase() === c.toLowerCase() ? "scale-110 ring-sun" : "ring-white/15")}
            style={{ background: c }}
          >
            {value.toLowerCase() === c.toLowerCase() && <Check className="size-4 text-white mix-blend-difference" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toast({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <m.p
          key={text}
          className="absolute top-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-sun px-5 py-2 font-display font-extrabold text-night shadow-xl"
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {text}
        </m.p>
      )}
    </AnimatePresence>
  );
}

export function GarageScreen() {
  const t = useT();
  const p = usePlayer();
  const [tab, setTab] = useState<Tab>("bikes");
  const [selected, setSelected] = useState<BikeId>(p.equipped);
  const [preview, setPreview] = useState<UpgradeId | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const current = currentRideStats(p);
  const viewed = tab === "bikes" ? selected : p.equipped;
  const custom: Customization = tab === "bikes" && selected !== p.equipped ? { ...p.custom, body: BIKES[selected].color } : p.custom;
  const levels = p.upgrades[p.equipped] ?? {};
  const fuelCost = Math.ceil(((current.tank - p.fuel) * FUEL_PRICE_PER_L) / 50) * 50;
  const repairCost = Math.ceil((p.damage * REPAIR_PRICE_PER_POINT) / 50) * 50;

  const buyCosmetic = (key: string, apply: () => void) => {
    if (p.cosmetics.includes(key)) return apply();
    const price = COSMETIC_PRICES[key] ?? 0;
    if (!p.spend(price)) return setToast(t.garage.notEnough);
    p.patch({ cosmetics: [...p.cosmetics, key] });
    apply();
  };

  const tabs: Record<Tab, ReactNode> = {
    bikes: (
      <div className="flex flex-col gap-4">
        <ul className="grid gap-2">
          {BIKE_IDS.map((id) => {
            const bike = BIKES[id];
            const owned = p.owned.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSelected(id)}
                  aria-pressed={selected === id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors",
                    selected === id ? "bg-night-600 ring-sun" : "bg-night-700 ring-white/6 hover:bg-night-600",
                  )}
                >
                  <span className="size-8 shrink-0 rounded-full ring-2 ring-white/20" style={{ background: bike.color }} />
                  <span className="flex-1 font-display text-lg leading-tight font-bold">{bike.name}</span>
                  {p.equipped === id ? (
                    <Chip size="sm" tone="forest">
                      {t.garage.equipped}
                    </Chip>
                  ) : owned ? (
                    <Chip size="sm">{t.garage.owned}</Chip>
                  ) : (
                    <span className="font-display font-extrabold text-sun tabular">{formatTzs(bike.price)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <Stats id={selected} upgrades={p.upgrades[selected]} compareTo={selected === p.equipped ? undefined : current} />
        {p.equipped === selected ? null : p.owned.includes(selected) ? (
          <Button variant="forest" size="lg" icon={<Check />} onClick={() => p.equipBike(selected)}>
            {t.garage.equip}
          </Button>
        ) : (
          <Button
            variant="sun"
            size="lg"
            icon={p.wallet >= BIKES[selected].price ? <Coins /> : <Lock />}
            disabled={p.wallet < BIKES[selected].price}
            onClick={() => p.buyBike(selected) && setToast(t.garage.bought)}
          >
            {p.wallet >= BIKES[selected].price ? `${t.garage.buy} · ${formatTzs(BIKES[selected].price)}` : t.garage.notEnough}
          </Button>
        )}
      </div>
    ),
    upgrades: (
      <div className="flex flex-col gap-4">
        <Stats id={p.equipped} upgrades={preview ? { ...levels, [preview]: Math.min(MAX_UPGRADE, (levels[preview] ?? 0) + 1) } : levels} compareTo={preview ? current : undefined} />
        <ul className="grid gap-2">
          {UPGRADE_IDS.map((id) => {
            const level = levels[id] ?? 0;
            const cost = upgradeCost(p.equipped, id, level);
            const Icon = UPGRADE_ICONS[id];
            const maxed = level >= MAX_UPGRADE;
            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-2xl bg-night-700 p-3 ring-1 ring-white/6"
                onPointerEnter={() => setPreview(maxed ? null : id)}
                onPointerLeave={() => setPreview(null)}
                onFocus={() => setPreview(maxed ? null : id)}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-night-600 text-sun">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display leading-tight font-bold">{t.garage.upgradeNames[id]}</p>
                  <p className="truncate text-xs text-cream/55">{t.garage.upgradeHints[id]}</p>
                  <div className="mt-1.5 flex gap-1" aria-label={fmt(t.garage.level, { n: level })}>
                    {Array.from({ length: MAX_UPGRADE }, (_, i) => (
                      <span key={i} className={cn("h-1.5 w-5 rounded-full", i < level ? "bg-sun" : "bg-night-500")} />
                    ))}
                  </div>
                </div>
                <Button
                  variant={maxed ? "ghost" : "sun"}
                  disabled={maxed || p.wallet < cost}
                  onClick={() => p.buyUpgrade(id) && setToast(t.garage.upgraded)}
                  className="shrink-0 tabular"
                >
                  {maxed ? t.garage.max : `+${formatTzs(cost)}`}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    ),
    style: (
      <div className="flex flex-col gap-5">
        <Swatches label={t.garage.paint} value={p.custom.body} onChange={(body) => p.setCustom({ body })} />
        <Swatches label={t.garage.helmet} value={p.custom.helmet} onChange={(helmet) => p.setCustom({ helmet })} />
        <Swatches label={t.garage.jacket} value={p.custom.jacket} onChange={(jacket) => p.setCustom({ jacket })} />
        <Swatches label={t.garage.cushion} value={p.custom.cushion} onChange={(cushion) => p.setCustom({ cushion })} />
        <div>
          <p className="mb-2 font-display text-sm font-bold text-cream/70">{t.garage.sticker}</p>
          <div className="flex flex-wrap gap-2">
            {(["none", "reds", "yellows", "blues", "kitenge"] as const).map((st) => {
              const key = `sticker:${st}`;
              const owned = st === "none" || p.cosmetics.includes(key);
              return (
                <Button key={st} variant={p.custom.sticker === st ? "sun" : "night"} onClick={() => buyCosmetic(key, () => p.setCustom({ sticker: st }))}>
                  {t.garage.stickers[st]}
                  {!owned && <span className="ml-1 text-xs opacity-70">{formatTzs(COSMETIC_PRICES[key] ?? 0)}</span>}
                </Button>
              );
            })}
          </div>
        </div>
        {(
          [
            ["vest", t.garage.vest, null],
            ["mudflaps", t.garage.mudflaps, "mudflaps"],
            ["led", t.garage.led, "led"],
          ] as const
        ).map(([key, label, cosmetic]) => (
          <div key={key} className="flex items-center justify-between gap-3 rounded-2xl bg-night-700 p-3">
            <span className="font-display font-bold">
              {label}
              {cosmetic && !p.cosmetics.includes(cosmetic) && <span className="ml-2 text-sm text-sun tabular">{formatTzs(COSMETIC_PRICES[cosmetic] ?? 0)}</span>}
            </span>
            <Toggle
              label={label}
              checked={p.custom[key]}
              onChange={(v) => (cosmetic && v ? buyCosmetic(cosmetic, () => p.setCustom({ [key]: v })) : p.setCustom({ [key]: v }))}
            />
          </div>
        ))}
        <label className="grid gap-2">
          <span className="font-display text-sm font-bold text-cream/70">{t.garage.plate}</span>
          <input
            value={p.custom.plate}
            maxLength={10}
            onChange={(e) => p.setCustom({ plate: e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "") })}
            className="h-12 rounded-xl bg-[#FFD54A] px-4 text-center font-display text-xl font-extrabold tracking-widest text-night ring-2 ring-night select-text"
          />
        </label>
      </div>
    ),
  };

  return (
    <main className="grain relative min-h-dvh overflow-hidden bg-night lg:h-dvh">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_30%_40%,#2A3550,transparent_70%)]" />
      <div className="safe-x safe-top relative z-10 flex items-center gap-3 py-3">
        <div className="flex-1">
          <ScreenHeader title={t.garage.title} />
        </div>
        <Chip icon={<Coins className="text-sun" />} className="tabular">
          {formatTzs(p.wallet)}
        </Chip>
      </div>
      <Toast text={toast} />
      <div className="relative grid gap-4 pb-6 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[1.2fr_1fr]">
        <section className="relative h-[42dvh] min-h-64 lg:h-full" aria-label={BIKES[viewed].name}>
          <GarageStage bike={viewed} custom={custom} />
          <div className="safe-x pointer-events-none absolute bottom-4 left-0">
            <p className="sticker text-4xl">{BIKES[viewed].name}</p>
            {p.damage > 0 && <p className="font-display font-bold text-coral">{fmt(t.garage.damage, { n: Math.round(p.damage) })}</p>}
          </div>
        </section>
        <section className="safe-x lg:overflow-y-auto lg:pr-4">
          <Card pattern className="p-4">
            <Segmented<Tab>
              label={t.garage.title}
              value={tab}
              onChange={setTab}
              options={[
                { value: "bikes", label: t.garage.bikes, icon: <Bike /> },
                { value: "upgrades", label: t.garage.upgrades, icon: <Wrench /> },
                { value: "style", label: t.garage.style, icon: <Paintbrush /> },
              ]}
            />
            <div className="mt-4">{tabs[tab]}</div>
          </Card>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="sky"
              icon={<Fuel />}
              disabled={fuelCost <= 0 || p.wallet <= 0}
              onClick={() => {
                const liters = Math.min(current.tank - p.fuel, p.wallet / FUEL_PRICE_PER_L);
                if (liters <= 0) return;
                p.spend(Math.min(p.wallet, Math.ceil((liters * FUEL_PRICE_PER_L) / 50) * 50));
                p.setRide(p.fuel + liters, p.damage);
              }}
            >
              {fuelCost <= 0 ? t.station.full : `${t.station.refuel} · ${formatTzs(Math.min(fuelCost, p.wallet))}`}
            </Button>
            <Button variant="night" icon={<Wrench />} disabled={repairCost <= 0 || p.wallet < repairCost} onClick={() => p.spend(repairCost) && p.setRide(p.fuel, 0)}>
              {repairCost <= 0 ? t.station.fine : `${t.station.repair} · ${formatTzs(repairCost)}`}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
