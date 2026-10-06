"use client";

import { StationBrowser } from "@/components/radio/StationBrowser";
import { Segmented } from "@/components/ui";
import { useT } from "@/i18n";
import { useSettings } from "@/stores/settings";
import { ScreenHeader } from "./ScreenHeader";

/** Browse Tanzanian stations and play one live stream. */
export function RadioScreen() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const set = useSettings((s) => s.set);

  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_100%_0%,rgb(0_163_221/0.28),transparent_55%),radial-gradient(70%_40%_at_0%_100%,rgb(11_110_79/0.35),transparent_60%)]" />
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-lg flex-col gap-4 py-4">
        <ScreenHeader
          title={t.radio.title}
          action={
            <Segmented
              size="sm"
              label={t.settings.language}
              value={locale}
              onChange={(v) => set("locale", v)}
              options={[
                { value: "sw", label: "SW" },
                { value: "en", label: "EN" },
              ]}
            />
          }
        />
        <p className="text-sm leading-relaxed text-cream/70">{t.radio.intro}</p>
        <StationBrowser variant="page" />
        <p className="pb-2 text-center text-xs text-cream/40">{t.radio.data}</p>
      </div>
    </main>
  );
}
