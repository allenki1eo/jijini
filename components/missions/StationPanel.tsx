"use client";

import { FileBadge, Fuel, IdCard, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { BankPanel, WakalaPanel } from "./BankPanel";
import { LICENCE_FEE, PERMIT_FEE } from "@/data/prices";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import { fmt, formatTzs, useT } from "@/i18n";
import { usePlayer } from "@/stores/player";
import { useHudTick } from "@/components/hud/useHudTick";

/** Appears when the rider stops at a petrol station (fill up and fix) or a fundi (fix only). */
export function StationPanel({ game }: { game: Game }) {
  useHudTick(4);
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  const bodapesa = usePlayer((s) => s.bodapesa);
  const [, bump] = useState(0);
  const service = game.serviceNearby();
  if (!service) return null;
  if (service.police) return <LicencePanel game={game} name={service.name} />;
  if (service.bank) return <BankPanel bank={service.bank} name={service.name} />;
  if (service.wakala) return <WakalaPanel name={service.name} />;
  if (service.bottle) return <BottlePanel game={game} name={service.name} wallet={wallet} onBuy={() => bump((n) => n + 1)} />;
  const fuelCost = game.refuelCost();
  const repairCost = game.repairCost();
  const Icon = service.fuel ? Fuel : Wrench;
  return (
    <div className="pointer-events-auto flex w-60 flex-col gap-2 rounded-2xl bg-night-800/92 p-3 shadow-xl ring-1 ring-sky/40 backdrop-blur">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-5 shrink-0 text-sky-300" />
        <div className="min-w-0">
          <p className="truncate font-display leading-tight font-extrabold text-sky-300">
            {service.name || (service.fuel ? t.station.title : t.station.fundi)}
          </p>
          <p className="text-xs text-cream/60">{service.fuel ? `${t.station.title} · ${formatTzs(game.fuelPrice)} ${t.station.perLitre}` : t.station.fundi}</p>
        </div>
      </div>
      {service.fuel && (
        <Button
          variant="sky"
          icon={<Fuel />}
          disabled={fuelCost <= 0 || wallet <= 0}
          onClick={() => {
            game.refuel();
            bump((n) => n + 1);
          }}
        >
          {fuelCost <= 0 ? t.station.full : `${t.station.refuel} · ${formatTzs(Math.min(fuelCost, wallet))}`}
        </Button>
      )}
      {service.fuel && fuelCost > 0 && bodapesa > 0 && (
        <Button
          variant="forest"
          icon={<Smartphone />}
          onClick={() => {
            game.refuel(true);
            bump((n) => n + 1);
          }}
        >
          {`${t.bank.payBodaPesa} · ${formatTzs(Math.min(fuelCost, bodapesa))}`}
        </Button>
      )}
      <Button
        variant="night"
        icon={<Wrench />}
        disabled={repairCost <= 0 || wallet < repairCost}
        onClick={() => {
          game.repair();
          bump((n) => n + 1);
        }}
      >
        {repairCost <= 0 ? t.station.fine : wallet < repairCost ? t.station.broke : `${t.station.repair} · ${formatTzs(repairCost)}`}
      </Button>
    </div>
  );
}

/** At a police post: see how long the leseni has left and renew it. */
/** A roadside petrol seller: a litre or two from a bottle, cash only, a little dearer than the pump. */
function BottlePanel({ game, name, wallet, onBuy }: { game: Game; name: string; wallet: number; onBuy: () => void }) {
  const t = useT();
  const price = game.bottlePrice;
  const room = game.tankRoom;
  return (
    <div className="pointer-events-auto flex w-60 flex-col gap-2 rounded-2xl bg-night-800/92 p-3 shadow-xl ring-1 ring-[#F2A14A]/50 backdrop-blur">
      <div className="flex items-start gap-2">
        <Fuel className="mt-0.5 size-5 shrink-0 text-[#F2A14A]" />
        <div className="min-w-0">
          <p className="truncate font-display leading-tight font-extrabold text-[#F2A14A]">{name}</p>
          <p className="text-xs text-cream/60">{fmt(t.station.bottleHint, { price: formatTzs(price) })}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2].map((l) => {
          const liters = Math.min(l, room);
          const cost = Math.ceil((liters * price) / 50) * 50;
          return (
            <Button
              key={l}
              variant="night"
              disabled={liters <= 0.05 || wallet < cost}
              onClick={() => {
                game.buyBottleFuel(l);
                onBuy();
              }}
              className="!min-h-11 !px-2 !text-sm"
            >
              {liters <= 0.05 ? t.station.full : fmt(t.station.bottleBuy, { l, cost: formatTzs(cost) })}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function LicencePanel({ game, name }: { game: Game; name: string }) {
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  const [, bump] = useState(0);
  const days = Math.ceil(game.licenceHours / 24);
  const expired = game.licenceHours <= 0;
  const permitExpired = game.permitHours <= 0;
  return (
    <div className="pointer-events-auto flex w-64 flex-col gap-2 rounded-2xl bg-night-800/92 p-3 shadow-xl ring-1 ring-[#2D6BFF]/50 backdrop-blur">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sky-300" />
        <div className="min-w-0">
          <p className="truncate font-display leading-tight font-extrabold text-sky-300">{name || t.missions.poi.police}</p>
          <p className={expired ? "text-xs font-semibold text-coral" : "text-xs text-cream/60"}>
            {t.hesabu.licence} · {expired ? t.hesabu.licenceExpired : fmt(t.hesabu.licenceLeft, { days })}
          </p>
        </div>
      </div>
      <Button
        variant={expired ? "sun" : "night"}
        icon={<IdCard />}
        disabled={wallet < LICENCE_FEE}
        onClick={() => {
          game.renewLicence();
          bump((n) => n + 1);
        }}
      >
        {wallet < LICENCE_FEE ? t.station.broke : fmt(t.hesabu.renew, { fee: formatTzs(LICENCE_FEE) })}
      </Button>
      {/* The LATRA permit (kibali) is paid here too. */}
      <p className={permitExpired ? "text-xs font-semibold text-coral" : "text-xs text-cream/60"}>
        {t.gear.permit} · {permitExpired ? t.gear.permitExpired : fmt(t.gear.permitLeft, { days: Math.ceil(game.permitHours / 24) })}
      </p>
      <Button
        variant={permitExpired ? "sun" : "night"}
        icon={<FileBadge />}
        disabled={wallet < PERMIT_FEE}
        onClick={() => {
          game.renewPermit();
          bump((n) => n + 1);
        }}
      >
        {wallet < PERMIT_FEE ? t.station.broke : fmt(t.gear.renew, { fee: formatTzs(PERMIT_FEE) })}
      </Button>
    </div>
  );
}
