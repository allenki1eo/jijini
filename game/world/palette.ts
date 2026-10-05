/**
 * Tanzanian street palette. Shared by the bake script (which stores palette
 * indices) and the runtime (which turns them into vertex colors).
 */

/** Wall colors: whitewash, ochre, faded pastels, shopfront teal, terracotta. */
export const WALL_COLORS = [
  "#F2EDE3", // whitewash
  "#ECE4D3", // dusty cream
  "#E3B862", // ochre
  "#D69A57", // burnt sand
  "#A9CBD9", // faded sky blue
  "#AFCFA5", // pale mint
  "#E9B7A8", // dusty pink
  "#F0D58A", // limewash yellow
  "#6DB3A8", // shopfront teal
  "#C9774E", // terracotta
  "#D8D2C4", // raw plaster
  "#B9C7E0", // periwinkle
] as const;

/** Weights for picking a wall color (whitewash and plaster dominate). */
export const WALL_WEIGHTS = [10, 7, 4, 3, 3, 3, 2, 3, 2, 2, 6, 2] as const;

/** Roof colors. 0-5 corrugated iron, 6-8 flat concrete. */
export const ROOF_COLORS = [
  "#9A4B2E", // rusty iron
  "#A7AEB2", // galvanised silver
  "#B4523A", // faded red
  "#4F7C5C", // green iron
  "#3F6E9A", // blue iron
  "#7D6A58", // weathered brown
  "#BDB6A8", // concrete
  "#A9A396", // stained concrete
  "#CFC8B8", // light screed
] as const;

export const IRON_ROOFS = [0, 1, 2, 3, 4, 5] as const;
export const FLAT_ROOFS = [6, 7, 8] as const;

/** Ground colors per AREA_KINDS index. */
export const AREA_COLORS = [
  "#7FA24A", // grass
  "#C98A5B", // residential (red earth, slightly lighter)
  "#C7A27C", // commercial (packed dust)
  "#C9935F", // market
  "#A99C8A", // industrial
  "#9DA757", // farmland
  "#5E8A3E", // forest
  "#E0C38E", // sand
  "#B9A27E", // institution grounds
  "#8E8A84", // parking
  "#8DA45E", // cemetery
  "#5FA14D", // pitch
] as const;

/** Render order (higher draws on top) per AREA_KINDS index. */
export const AREA_LAYER = [6, 0, 1, 7, 2, 3, 5, 4, 8, 10, 9, 11] as const;

export const EARTH_COLOR = "#B9714A";
export const TARMAC_COLOR = "#4A4A4F";
export const DIRT_ROAD_COLOR = "#A2603E";
export const PATH_COLOR = "#B47B55";
export const SIDEWALK_COLOR = "#B8AFA2";
export const MARKING_COLOR = "#F4EFE2";
export const WATER_COLOR = "#2E7FA3";
