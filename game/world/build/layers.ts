/**
 * Height offsets (m) that layer coplanar ground features without z-fighting.
 * Areas < water < sidewalks < roads (by class) < markings. Steps are large
 * enough for 24-bit depth at ~200 m with a 0.5 m near plane, and far too
 * small to notice from a rider's eye height.
 */
export const Y_AREA_BASE = 0.02;
export const Y_AREA_STEP = 0.012;
export const Y_WATER = 0.17;
export const Y_SIDEWALK = 0.19;
export const Y_ROAD_BASE = 0.21;
export const Y_ROAD_STEP = 0.012;
export const Y_MARKING = 0.3;

/** Road surface height for a class index (0 = primary is highest). */
export const roadY = (classIndex: number) => Y_ROAD_BASE + (6 - classIndex) * Y_ROAD_STEP;
