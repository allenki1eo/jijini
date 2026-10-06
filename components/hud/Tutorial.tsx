"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DialogueCard } from "@/components/story/DialogueCard";
import { controls } from "@/game/core/controls";
import type { Game } from "@/game/core/Game";
import { hud } from "@/game/core/hud";
import { missionHud } from "@/game/missions/MissionRunner";
import { useT } from "@/i18n";
import { usePlayer } from "@/stores/player";
import { useMissions } from "@/stores/missions";

type Step = "juma1" | "juma2" | "throttle" | "steer" | "brake" | "job" | "pickup" | "deliver" | "done";

/**
 * Guided first ride with Mzee Juma: throttle, steer, brake, then a short
 * paid passenger job. Designed to reach the first payout in under 3 minutes.
 */
export function Tutorial({ game }: { game: Game }) {
  const t = useT();
  const [step, setStep] = useState<Step>("juma1");
  const steerHeld = useRef(0);
  const wasFast = useRef(false);
  const result = useMissions((s) => s.result);

  const finish = () => {
    game.setTutorial(false);
    usePlayer.getState().patch({ tutorialDone: true });
  };

  useEffect(() => {
    game.setTutorial(true);
    return () => game.setTutorial(false);
  }, [game]);

  // Watch the rider for the practice steps.
  useEffect(() => {
    if (!["throttle", "steer", "brake", "job", "pickup", "deliver"].includes(step)) return;
    const id = window.setInterval(() => {
      if (step === "throttle" && hud.speedKmh > 15) setStep("steer");
      if (step === "steer") {
        steerHeld.current = Math.abs(controls.steer) > 0.4 && hud.speedKmh > 2 ? steerHeld.current + 0.1 : steerHeld.current;
        if (steerHeld.current > 0.5) setStep("brake");
      }
      if (step === "brake") {
        if (hud.speedKmh > 10) wasFast.current = true;
        if (wasFast.current && hud.speedKmh < 3) setStep("job");
      }
      if (step === "job" && game.startTutorialMission()) setStep("pickup");
      if (step === "pickup" && missionHud.carrying) setStep("deliver");
    }, 100);
    return () => window.clearInterval(id);
  }, [step, game]);

  useEffect(() => {
    if (result?.success && step === "deliver") {
      const id = window.setTimeout(() => setStep("done"), 0);
      return () => window.clearTimeout(id);
    }
  }, [result, step]);

  const dialogue = step === "juma1" ? t.tutorial.juma1 : step === "juma2" ? t.tutorial.juma2 : step === "done" && !result ? t.tutorial.done : null;
  const hint = { throttle: t.tutorial.throttle, steer: t.tutorial.steer, brake: t.tutorial.brake, job: t.tutorial.job, pickup: t.tutorial.pickup, deliver: t.tutorial.deliver }[step as string];

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-40 flex justify-center px-4 short:bottom-32">
        <DialogueCard
          open={Boolean(dialogue)}
          speaker="juma"
          text={dialogue ?? ""}
          cta={t.tutorial.next}
          onNext={() => (step === "juma1" ? setStep("juma2") : step === "juma2" ? setStep("throttle") : finish())}
          secondary={step === "juma1" ? { label: t.tutorial.skip, onClick: finish } : undefined}
        />
      </div>
      <AnimatePresence>
        {hint && (
          <m.div
            key={step}
            className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center px-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="max-w-lg rounded-2xl bg-night/80 px-5 py-3 text-center font-display text-xl font-extrabold text-sun shadow-xl ring-2 ring-sun/40 backdrop-blur">{hint}</p>
          </m.div>
        )}
      </AnimatePresence>
      {hint && (
        <button
          type="button"
          onClick={() => {
            game.missions?.abandon();
            useMissions.getState().set({ result: null });
            finish();
          }}
          className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-night/70 px-4 py-2 font-display text-sm font-bold text-cream/70 hover:text-cream"
        >
          {t.tutorial.skip}
        </button>
      )}
    </>
  );
}
