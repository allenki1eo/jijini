/**
 * Spoken lines: passengers, callers, market sellers and conductors. Each
 * line is shown as a speech bubble and played from the voice bank when a
 * recording exists for its key (see public/audio/voices/README.md).
 */
import { events } from "@/game/core/events";
import { currentDictionary, fmt } from "@/i18n";
import type { Dictionary } from "@/i18n/sw";

export type LineKey = keyof Dictionary["lines"];

/** A random line for `key` in the current language, with `{placeholders}` filled. */
export const line = (key: LineKey, vars: Record<string, string | number> = {}, random: () => number = Math.random) => {
  const options = currentDictionary().lines[key];
  return fmt(options[Math.floor(random() * options.length)] ?? "", vars);
};

/** Someone says a line out loud. */
export const say = (key: LineKey, who: string, vars: Record<string, string | number> = {}) => {
  const text = line(key, vars);
  events.emit("say", { key, who, text });
  return text;
};
