"use client";

import { useState } from "react";
import { CITIES } from "@/data/cities/config";
import { nextChapter, type Chapter } from "@/data/story";
import { events } from "@/game/core/events";
import { fmt, formatTzs, useT } from "@/i18n";
import { usePlayer } from "@/stores/player";
import { useMissions } from "@/stores/missions";
import { DialogueCard } from "./DialogueCard";

/** Plays the next Kijiweni chapter between jobs when its requirements are met. */
export function StoryDirector({ enabled }: { enabled: boolean }) {
  const t = useT();
  const chapterNo = usePlayer((s) => s.storyChapter);
  const deliveries = usePlayer((s) => s.stats.deliveries);
  const level = usePlayer((s) => s.level);
  const busy = useMissions((s) => Boolean(s.active || s.result || s.boardOpen));
  const [line, setLine] = useState(0);

  const chapter: Chapter | null = enabled && !busy ? nextChapter(chapterNo, { deliveries, level }) : null;
  if (!chapter) return null;
  const lines = t.story[chapter.key];

  const complete = () => {
    const p = usePlayer.getState();
    const { money, reputation, city } = chapter.reward;
    if (money) {
      p.earn(money, 0);
      events.emit("toast", { text: fmt(t.story.rewardMoney, { amount: formatTzs(money) }), tone: "sun" });
    }
    if (reputation) p.adjustReputation(reputation);
    if (city) {
      p.unlockCity(city);
      events.emit("toast", { text: fmt(t.story.rewardCity, { city: CITIES[city].name }), tone: "forest" });
    }
    p.patch({ storyChapter: chapter.id });
    setLine(0);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-40 z-30 flex justify-center px-4 short:bottom-28">
      <DialogueCard
        open
        speaker={chapter.speakers[line] ?? chapter.speakers[0]!}
        text={lines[line] ?? ""}
        cta={line + 1 < lines.length ? t.story.continue : t.tutorial.next}
        onNext={() => (line + 1 < lines.length ? setLine(line + 1) : complete())}
      />
    </div>
  );
}
