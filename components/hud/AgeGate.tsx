"use client";

import { AnimatePresence, m } from "motion/react";
import { Wine } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/i18n";
import { useMissions } from "@/stores/missions";
import { usePhone } from "@/stores/phone";
import { useSettings } from "@/stores/settings";
import { useWorld } from "@/stores/world";

/**
 * Asked once, in towns whose billboards advertise alcohol: are you 18 or over?
 * Until it's answered the adverts stay hidden, so it can wait: it never opens on
 * top of another card (phone, job board, results, a character talking).
 */
export function AgeGate({ enabled }: { enabled: boolean }) {
  const t = useT();
  const adult = useSettings((s) => s.adult);
  const set = useSettings((s) => s.set);
  const here = useWorld((s) => s.adultAdsHere);
  const phoneOpen = usePhone((s) => s.open);
  const missionCard = useMissions((s) => s.boardOpen || s.result !== null);
  const talking = useWorld((s) => s.dialogue);
  const busy = phoneOpen || missionCard || talking;
  const open = enabled && here && adult === null && !busy;
  return (
    <AnimatePresence>
      {open && (
        <m.div
          role="dialog"
          aria-label={t.settings.ageTitle}
          className="pointer-events-auto absolute top-[34%] left-1/2 z-30 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.6rem] bg-night-800/95 p-4 shadow-2xl ring-1 ring-white/12 backdrop-blur max-sm:top-auto max-sm:bottom-[19rem] short:top-14"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-cream/80 font-display text-sm font-extrabold">18+</span>
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-extrabold">
                <Wine className="size-5 text-sun" /> {t.settings.ageTitle}
              </p>
              <p className="mt-1 text-sm leading-snug text-cream/75">{t.settings.ageBody}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="night" onClick={() => set("adult", false)}>
              {t.settings.ageNo}
            </Button>
            <Button variant="sun" onClick={() => set("adult", true)}>
              {t.settings.ageYes}
            </Button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
