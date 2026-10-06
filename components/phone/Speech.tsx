"use client";

import { AnimatePresence, m } from "motion/react";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHudTick } from "@/components/hud/useHudTick";
import type { Game } from "@/game/core/Game";
import { events } from "@/game/core/events";
import { missionHud, type TalkOption } from "@/game/missions/MissionRunner";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { Avatar } from "./Phone";

interface Bubble {
  id: number;
  who: string;
  text: string;
  mine: boolean;
}

const LIFETIME = 3600;

/** What people say: passengers, callers, sellers and the rider, as speech bubbles above the speedometer. */
export function SpeechBubbles() {
  const t = useT();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const nextId = useRef(1);
  const you = useRef(t.ride.you);
  useEffect(() => {
    you.current = t.ride.you;
  }, [t]);

  useEffect(
    () =>
      events.on("say", ({ who, text, key }) => {
        const id = nextId.current++;
        const mine = key.startsWith("rider.") || who === you.current;
        setBubbles((list) => [...list.slice(-1), { id, who, text, mine }]);
        window.setTimeout(() => setBubbles((list) => list.filter((b) => b.id !== id)), LIFETIME + text.length * 25);
      }),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-44 flex flex-col items-center gap-2 px-4 short:bottom-28" aria-live="polite">
      <AnimatePresence initial={false}>
        {bubbles.map((b) => (
          <m.div
            key={b.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 520, damping: 32 }}
            className={cn("flex max-w-[min(30rem,100%)] items-end gap-2", b.mine && "flex-row-reverse")}
          >
            <Avatar name={b.who} className="size-8 text-xs ring-2 ring-night/60" />
            <div className={cn("rounded-2xl px-3.5 py-2 shadow-lg", b.mine ? "rounded-br-sm bg-sun text-night" : "rounded-bl-sm bg-cream text-night")}>
              {!b.mine && <p className="font-display text-xs leading-none font-extrabold text-forest-600">{b.who}</p>}
              <p className="text-[0.95rem] leading-snug font-semibold">{b.text}</p>
            </div>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const OPTIONS: TalkOption[] = ["hello", "sorry", "hold", "near"];

/** Quick things to say to the passenger on board (keys 1–4). */
export function ChatBar({ game, touch }: { game: Game; touch: boolean }) {
  const t = useT();
  useHudTick(4);
  const runner = game.missions;
  const onBoard = Boolean(runner?.active && runner.active.passenger !== "none" && missionHud.carrying);
  const ready = runner?.canTalk ?? false;

  useEffect(() => {
    if (!onBoard) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code);
      if (i >= 0 && !e.repeat) game.talk(OPTIONS[i]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBoard, game]);

  return (
    <AnimatePresence>
      {onBoard && (
        <m.div
          className={cn("safe-x pointer-events-auto absolute left-0 flex flex-col items-start gap-1.5", touch ? "top-20 short:top-16" : "bottom-24")}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          <p className="flex items-center gap-1.5 rounded-full bg-night/70 px-2.5 py-1 font-display text-xs font-bold text-cream/80 backdrop-blur">
            <MessageCircle className="size-3.5" /> {t.phone.chat}
          </p>
          <div className={cn("flex gap-1.5", touch ? "flex-col" : "flex-wrap")}>
            {OPTIONS.map((option, i) => (
              <button
                key={option}
                type="button"
                disabled={!ready}
                onClick={() => game.talk(option)}
                className="rounded-full bg-night-600/90 px-3 py-1.5 text-left text-sm font-semibold text-cream ring-1 ring-white/10 backdrop-blur transition-opacity enabled:hover:bg-night-500 disabled:opacity-45"
              >
                {!touch && <span className="mr-1.5 text-xs text-sun tabular">{i + 1}</span>}
                {t.phone.chatOptions[option]}
              </button>
            ))}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
