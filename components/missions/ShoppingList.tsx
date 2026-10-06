"use client";

import { GOODS, type GoodId } from "@/data/prices";
import { formatTzs } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSettings } from "@/stores/settings";

export interface ListItem {
  id: string;
  qty: number;
  unit: number;
  /** When set and different from `unit`, the expected price is shown struck through. */
  expected?: number;
}

/** A customer's shopping list with street prices, as written on the back of a receipt. */
export function ShoppingList({ items, compact, className }: { items: ListItem[]; compact?: boolean; className?: string }) {
  const english = useSettings((s) => s.locale) === "en";
  return (
    <ul className={cn("divide-y divide-dashed divide-cream/12", className)}>
      {items.map((item) => {
        const good = GOODS[item.id as GoodId];
        const changed = item.expected !== undefined && item.expected !== item.unit;
        return (
          <li key={item.id} className={cn("flex items-baseline gap-2", compact ? "py-1 text-sm" : "py-2")}>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{english ? good.en : good.sw}</span>
              <span className="text-cream/55"> · {item.qty} × {english ? good.unitEn : good.unitSw}</span>
            </span>
            {!compact && changed && <s className="text-xs text-cream/40 tabular">{formatTzs(item.expected! * item.qty)}</s>}
            <span className={cn("font-display font-bold tabular", changed && item.unit < item.expected! ? "text-forest-400" : changed ? "text-coral" : "")}>
              {formatTzs(item.qty * item.unit)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
