"use client";

import { AnimatePresence, m } from "motion/react";
import { Hammer, HandCoins, Pill, ShoppingBasket, Store, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { ShoppingList } from "@/components/missions/ShoppingList";
import { Button } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useMissions } from "@/stores/missions";
import { usePhone } from "@/stores/phone";
import { usePlayer } from "@/stores/player";

const SELLER_ICON: Record<string, LucideIcon> = { market: ShoppingBasket, shop: Store, pharmacy: Pill, hardware: Hammer };

/** The counter at an errand's shop: today's prices, haggling, paying and the change you'll owe. */
export function ShopCounter({ game }: { game: Game }) {
  const t = useT();
  const shop = usePhone((s) => s.shop);
  const client = useMissions((s) => s.active?.client ?? "");
  const wallet = usePlayer((s) => s.wallet);
  const [broke, setBroke] = useState(false);

  const total = shop ? shop.items.reduce((sum, i) => sum + i.qty * i.unit, 0) : 0;
  const change = shop ? shop.advance - total : 0;
  const Icon = SELLER_ICON[shop?.seller ?? "shop"] ?? Store;
  const sellerName = shop ? (t.shop as Record<string, string>)[shop.seller] : "";

  return (
    <AnimatePresence>
      {shop && (
        <m.section
          aria-label={sellerName}
          className="pointer-events-auto absolute top-20 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[1.75rem] bg-night-800/95 shadow-2xl ring-1 ring-white/10 backdrop-blur short:top-3"
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <KitengeStrip className="h-2.5 w-full" />
          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto p-4 short:max-h-[calc(100dvh-1.5rem)]">
            <header className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-forest text-sun">
                <Icon className="size-6" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl leading-tight font-extrabold">{shop.place || sellerName}</h2>
                <p className="truncate text-sm text-cream/60">
                  {shop.place ? `${sellerName} · ` : ""}
                  {fmt(t.shop.list, { client })}
                </p>
              </div>
            </header>

            <ShoppingList items={shop.items} className="mt-3" />

            <dl className="mt-2 grid gap-1 border-t border-cream/15 pt-2 text-sm">
              <div className="flex justify-between font-display text-lg font-extrabold">
                <dt>{t.results.total}</dt>
                <dd className="tabular">{formatTzs(total)}</dd>
              </div>
              <div className="flex justify-between text-cream/70">
                <dt>{t.shop.advance}</dt>
                <dd className="tabular">{formatTzs(shop.advance)}</dd>
              </div>
              <p className={cn("mt-1 rounded-xl px-3 py-2 font-semibold", change >= 0 ? "bg-forest/25 text-forest-400" : "bg-coral/20 text-coral")}>
                {change >= 0 ? fmt(t.shop.change, { amount: formatTzs(change) }) : fmt(t.shop.short, { amount: formatTzs(-change) })}
              </p>
            </dl>

            {shop.haggled !== null && (
              <p className={cn("mt-2 text-center font-display font-bold", shop.haggled ? "text-sun" : "text-cream/60")}>{shop.haggled ? t.shop.haggled : t.shop.refused}</p>
            )}
            {broke && <p className="mt-2 text-center font-semibold text-coral">{t.shop.broke}</p>}

            <div className={cn("mt-3 grid gap-2", shop.canHaggle && shop.haggled === null ? "grid-cols-2" : "grid-cols-1")}>
              {shop.canHaggle && shop.haggled === null && (
                <Button variant="night" icon={<HandCoins />} onClick={() => game.haggle()}>
                  {t.shop.haggle}
                </Button>
              )}
              <Button
                variant="sun"
                disabled={wallet < total}
                onClick={() => {
                  const ok = game.purchase();
                  setBroke(!ok);
                }}
              >
                {fmt(t.shop.pay, { amount: formatTzs(total) })}
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-cream/50">{wallet < total ? t.shop.broke : t.shop.hint}</p>
          </div>
        </m.section>
      )}
    </AnimatePresence>
  );
}
