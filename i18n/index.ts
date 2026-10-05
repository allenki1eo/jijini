"use client";

import { useSettings } from "@/stores/settings";
import { en } from "./en";
import { sw, type Dictionary } from "./sw";

export type Locale = "sw" | "en";

export const dictionaries: Record<Locale, Dictionary> = { sw, en };

/** Current dictionary for the selected language. */
export const useT = (): Dictionary => dictionaries[useSettings((s) => s.locale)];

/** Fill `{name}` placeholders. */
export const fmt = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

/** TZS amounts are shown without decimals and with thousands separators. */
export const formatTzs = (amount: number): string => Math.round(amount).toLocaleString("en-US");
