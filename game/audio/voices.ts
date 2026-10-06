/**
 * Recorded voice lines. Drop audio files into public/audio/voices/ and list
 * them in public/audio/voices/manifest.json under the line key they voice
 * (see the README there). Lines without a recording stay text-only, so the
 * game works with any number of recordings, including none.
 */
import { events } from "@/game/core/events";
import { audio } from "./AudioEngine";

const BASE = "/audio/voices/";

interface VoiceManifest {
  /** Line key → files; one is picked at random each time. */
  lines?: Record<string, string[]>;
  /** Person → line key → files, for character voices (checked first). */
  people?: Record<string, Record<string, string[]>>;
  /** Overall loudness, 0..2 (default 1). */
  gain?: number;
}

let manifest: Promise<VoiceManifest> | null = null;

const load = () =>
  (manifest ??= fetch(`${BASE}manifest.json`)
    .then((r): Promise<VoiceManifest> | VoiceManifest => (r.ok ? r.json() : {}))
    .catch((): VoiceManifest => ({})));

/** Play a recording for `key`, preferring one recorded for `who`. Resolves false when there's none. */
export const playVoice = async (key: string, who?: string): Promise<boolean> => {
  if (!audio.ready) return false;
  const m = await load();
  const files = (who && m.people?.[who]?.[key]) || m.lines?.[key];
  if (!files?.length) return false;
  const file = files[Math.floor(Math.random() * files.length)]!;
  return audio.voice(/^https?:|^\//.test(file) ? file : BASE + file, m.gain ?? 1);
};

/** Voice every spoken line (speech bubbles, callers, sellers) that has a recording. */
export const attachVoices = () => events.on("say", ({ key, who }) => void playVoice(key, who));
