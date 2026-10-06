"use client";

import { Fuel, Wrench } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import { formatTzs, useT } from "@/i18n";
import { usePlayer } from "@/stores/player";
import { useHudTick } from "@/components/hud/useHudTick";

/** Appears when the rider stops at a petrol station (fill up and fix) or a fundi (fix only). */
export function StationPanel({ game }: { game: Game }) {
  useHudTick(4);
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  const [, bump] = useState(0);
  const service = game.serviceNearby();
  if (!service) return null;
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
