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
import { useSettings } from "@/stores/settings";
import { useTouchDevice } from "./RideHud";

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
  const touchDevice = useTouchDevice();
  const tilt = useSettings((s) => s.tiltSteer);

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
  // Phones get button-only wording; keyboards keep the W/A/S/D hints.
  const hints = touchDevice
    ? { throttle: t.tutorial.throttleTouch, steer: tilt ? t.tutorial.steerTilt : t.tutorial.steerTouch, brake: t.tutorial.brakeTouch }
    : { throttle: t.tutorial.throttle, steer: t.tutorial.steer, brake: t.tutorial.brake };
  const hint = { ...hints, job: t.tutorial.job, pickup: t.tutorial.pickup, deliver: t.tutorial.deliver }[step as string];
  const skipPractice = () => {
    game.missions?.abandon();
    useMissions.getState().set({ result: null });
    finish();
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-40 z-30 flex justify-center px-4 short:bottom-32">
        <DialogueCard
          open={Boolean(dialogue)}
          speaker="juma"
          text={dialogue ?? ""}
          voiceKey={dialogue ? `tutorial.${step}` : undefined}
          cta={t.tutorial.next}
          onNext={() => (step === "juma1" ? setStep("juma2") : step === "juma2" ? setStep("throttle") : finish())}
          secondary={step === "juma1" ? { label: t.tutorial.skip, onClick: finish } : undefined}
        />
      </div>
      <AnimatePresence>
        {hint && (
          <m.div
            key={step}
            className="pointer-events-none absolute inset-x-0 top-[38%] z-30 flex justify-center px-4 short:top-[30%]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* The skip link rides with the hint, clear of the pedals (it used to sit under the brake). */}
            <div className="flex max-w-lg flex-col items-center gap-1.5">
              <p className="rounded-2xl bg-night/80 px-5 py-3 text-center font-display text-xl font-extrabold text-sun shadow-xl ring-2 ring-sun/40 backdrop-blur short:py-2 short:text-lg">{hint}</p>
              <button
                type="button"
                onClick={skipPractice}
                className="pointer-events-auto min-h-11 rounded-full bg-night/70 px-4 font-display text-sm font-bold text-cream/75 hover:text-cream"
              >
                {t.tutorial.skip}
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
