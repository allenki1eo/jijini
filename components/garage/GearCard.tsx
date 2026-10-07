"use client";

import { BadgeCheck, FileBadge, HardHat, ShieldAlert, Shirt } from "lucide-react";
import type { ReactNode } from "react";
import { Card, Toggle } from "@/components/ui";
import { HELMET_PRICE, REFLECTOR_PRICE } from "@/data/prices";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer } from "@/stores/player";

function Row({ icon, title, status, ok, children }: { icon: ReactNode; title: string; status: string; ok: boolean; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-night-700 p-3 ring-1 ring-white/6">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5", ok ? "bg-forest/25 text-forest-400" : "bg-coral/20 text-coral")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display leading-tight font-bold">{title}</p>
        <p className={cn("flex items-center gap-1 text-xs", ok ? "text-forest-400" : "text-coral")}>
          {ok ? <BadgeCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
          {status}
        </p>
      </div>
      {children}
    </li>
  );
}

/**
 * Safety gear Afande checks at a roadblock: a helmet (cracks in a bad crash),
 * a reflector vest you have to actually wear, and the LATRA permit (paid at
 * a police post; here you just see how long it has left).
 */
export function GearCard({ onToast }: { onToast: (text: string) => void }) {
  const t = useT();
  const p = usePlayer();
  const days = Math.ceil(p.gear.permitHours / 24);
  const buy = (price: number, item: string, patch: Partial<typeof p.gear>, vest?: boolean) => {
    if (!p.spendAny(price)) return onToast(t.garage.notEnough);
    p.patch({ gear: { ...p.gear, ...patch } });
    if (vest) p.setCustom({ vest: true });
    onToast(fmt(t.gear.bought, { item }));
  };
  const buyButton = (price: number, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={p.wallet + p.bodapesa < price}
      className="chunky shrink-0 rounded-xl bg-sun px-3 py-2 font-display text-sm font-extrabold text-night [--edge:var(--color-sun-800)] disabled:opacity-45"
    >
      {fmt(t.gear.buy, { price: formatTzs(price) })}
    </button>
  );

  return (
    <Card className="mt-4 p-4">
      <h2 className="font-display text-lg font-extrabold">{t.gear.title}</h2>
      <p className="mt-0.5 text-sm text-cream/60">{t.gear.hint}</p>
      <ul className="mt-3 grid gap-2">
        <Row icon={<HardHat />} title={t.gear.helmet} ok={p.gear.helmet} status={p.gear.helmet ? t.gear.helmetOk : t.gear.helmetBroken}>
          {!p.gear.helmet && buyButton(HELMET_PRICE, () => buy(HELMET_PRICE, t.gear.helmet, { helmet: true }))}
        </Row>
        <Row icon={<Shirt />} title={t.gear.reflector} ok={p.gear.reflector && p.custom.vest} status={!p.gear.reflector ? fmt(t.gear.buy, { price: formatTzs(REFLECTOR_PRICE) }) : p.custom.vest ? t.gear.helmetOk : t.gear.reflectorOff}>
          {p.gear.reflector ? (
            <Toggle label={t.gear.reflector} checked={p.custom.vest} onChange={(v) => p.setCustom({ vest: v })} />
          ) : (
            buyButton(REFLECTOR_PRICE, () => buy(REFLECTOR_PRICE, t.gear.reflector, { reflector: true }, true))
          )}
        </Row>
        <Row icon={<FileBadge />} title={t.gear.permit} ok={p.gear.permitHours > 0} status={p.gear.permitHours > 0 ? fmt(t.gear.permitLeft, { days }) : `${t.gear.permitExpired} · ${t.gear.permitWhere}`} />
      </ul>
    </Card>
  );
}
