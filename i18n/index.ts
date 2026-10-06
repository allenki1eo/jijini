"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSettings } from "@/stores/settings";
import { sw, type Dictionary } from "./sw";

export type Locale = "sw" | "en";

// Swahili ships with the app; English loads on demand (keeps the first load small).
let en: Dictionary | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const loadEnglish = () => {
  loading ??= import("./en").then((m) => {
    en = m.en;
    listeners.forEach((l) => l());
  });
  return loading;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Current dictionary for the selected language. */
export const useT = (): Dictionary => {
  const locale = useSettings((s) => s.locale);
  const english = useSyncExternalStore(subscribe, () => en, () => null);
  useEffect(() => {
    if (locale === "en") void loadEnglish();
  }, [locale]);
  return locale === "en" && english ? english : sw;
};

/** Fill `{name}` placeholders. */
export const fmt = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

/** TZS amounts are shown without decimals and with thousands separators. */
export const formatTzs = (amount: number): string => Math.round(amount).toLocaleString("en-US");
