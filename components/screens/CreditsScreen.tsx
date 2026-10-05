"use client";

import { ExternalLink, Map as MapIcon, Palette, Type } from "lucide-react";
import manifest from "@/public/assets/MANIFEST.json";
import { Card } from "@/components/ui";
import { useT } from "@/i18n";
import { ScreenHeader } from "./ScreenHeader";

interface AssetCredit {
  name: string;
  author: string;
  source: string;
  license: string;
  attribution?: string;
}

const assets = (manifest as { assets: AssetCredit[] }).assets;

export function CreditsScreen() {
  const t = useT();
  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-3xl flex-col gap-5 py-4">
        <ScreenHeader title={t.credits.title} />

        <Card pattern className="p-6">
          <div className="flex gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest text-sun">
              <MapIcon className="size-6" />
            </span>
            <div>
              <p className="font-display text-xl font-bold">OpenStreetMap</p>
              <p className="mt-1 text-cream/80">{t.credits.osm}</p>
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-12 items-center gap-1.5 font-display font-bold text-sun underline-offset-4 hover:underline"
              >
                {t.credits.osmLink} <ExternalLink className="size-4" />
              </a>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-coral text-cream">
              <Palette className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-bold">{t.credits.assets}</p>
              {assets.length === 0 ? (
                <p className="mt-1 text-cream/70">{t.credits.assetsEmpty}</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/6">
                  {assets.map((a) => (
                    <li key={a.name} className="py-2">
                      <p className="font-semibold">{a.name}</p>
                      <p className="text-sm text-cream/65">
                        {a.attribution ?? `${a.author} · ${a.license}`} ·{" "}
                        <a href={a.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          source
                        </a>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky text-night">
              <Type className="size-6" />
            </span>
            <p className="self-center text-cream/80">{t.credits.fonts}</p>
          </div>
        </Card>

        <p className="text-center font-display text-lg font-semibold text-sun-300">{t.credits.made}</p>
      </div>
    </main>
  );
}
