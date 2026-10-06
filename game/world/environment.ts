import type { SkylineKind } from "@/data/cities/config";

/** Distant backdrop silhouette colors per skyline kind. */
export const BACKDROP: Record<SkylineKind, { near: string; far: string; height: number }> = {
  savanna: { near: "#8E9B8C", far: "#AEB8B6", height: 70 },
  meru: { near: "#7E8FA3", far: "#A4B3C4", height: 260 },
  kilimanjaro: { near: "#7C8FA0", far: "#A9B8C8", height: 120 },
  highlands: { near: "#6F8A78", far: "#9DB0A6", height: 190 },
  lake: { near: "#8FA29A", far: "#B4C3C4", height: 45 },
  ocean: { near: "#9AA79C", far: "#BCC6C4", height: 30 },
};
