/** OSM tags -> BodaGo world categories. */
import { AREA_KINDS, POI_KINDS, ROAD_CLASSES, ROAD_WIDTH, type AreaKind, type PoiKind, type RoadClass } from "../../game/world/format";

type Tags = Record<string, string>;

const ROAD_MAP: Record<string, RoadClass> = {
  motorway: "primary",
  motorway_link: "primary",
  trunk: "primary",
  trunk_link: "primary",
  primary: "primary",
  primary_link: "primary",
  secondary: "secondary",
  secondary_link: "secondary",
  tertiary: "tertiary",
  tertiary_link: "tertiary",
  residential: "residential",
  unclassified: "residential",
  living_street: "residential",
  road: "residential",
  service: "service",
  track: "track",
  footway: "path",
  path: "path",
  pedestrian: "path",
  cycleway: "path",
  bridleway: "path",
};

export const roadClass = (tags: Tags): RoadClass | null => {
  if (tags.area === "yes") return null;
  return ROAD_MAP[tags.highway ?? ""] ?? null;
};

export const roadClassIndex = (c: RoadClass) => ROAD_CLASSES.indexOf(c);

/** Classes that motor traffic (and the player) can drive on. */
export const isDrivable = (c: RoadClass) => c !== "path";

const UNPAVED = new Set(["unpaved", "dirt", "ground", "gravel", "sand", "earth", "compacted", "fine_gravel", "mud", "grass", "pebblestone", "rock"]);
const PAVED = new Set(["paved", "asphalt", "concrete", "concrete:plates", "paving_stones", "sett", "chipseal", "cobblestone"]);

/** Most Tanzanian side streets are red-earth; main roads are tarmac. */
export const isUnpaved = (tags: Tags, c: RoadClass, rand: number): boolean => {
  const surface = tags.surface;
  if (surface && UNPAVED.has(surface)) return true;
  if (surface && PAVED.has(surface)) return false;
  switch (c) {
    case "primary":
    case "secondary":
    case "tertiary":
      return false;
    case "residential":
      return rand < 0.6;
    default:
      return true;
  }
};

export const roadWidth = (tags: Tags, c: RoadClass): number => {
  const tagged = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(tagged) && tagged >= 2 && tagged <= 24) return tagged;
  const lanes = Number.parseInt(tags.lanes ?? "", 10);
  if (Number.isFinite(lanes) && lanes > 0 && c !== "path") return Math.min(Math.max(lanes * 3.4, ROAD_WIDTH[c]), 18);
  return ROAD_WIDTH[c];
};

/** 1 = forward one-way, -1 = reverse one-way, 0 = two-way. */
export const oneWay = (tags: Tags): -1 | 0 | 1 => {
  const v = tags.oneway;
  if (v === "-1" || v === "reverse") return -1;
  if (v === "yes" || v === "1" || v === "true") return 1;
  if (tags.junction === "roundabout" || tags.junction === "circular") return 1;
  return 0;
};

export const areaKind = (tags: Tags): AreaKind | null => {
  const { landuse, leisure, natural, amenity } = tags;
  if (amenity === "marketplace") return "market";
  if (amenity === "parking") return "parking";
  if (amenity === "grave_yard" || landuse === "cemetery") return "cemetery";
  if (amenity && ["school", "hospital", "university", "college", "kindergarten", "clinic"].includes(amenity)) return "institution";
  if (leisure === "pitch" || leisure === "stadium") return "pitch";
  if (leisure && ["park", "garden", "playground"].includes(leisure)) return "grass";
  if (natural === "wood" || natural === "scrub" || landuse === "forest") return "forest";
  if (natural === "grassland") return "grass";
  if (natural && ["sand", "bare_rock", "beach"].includes(natural)) return "sand";
  switch (landuse) {
    case "grass":
    case "meadow":
    case "village_green":
    case "recreation_ground":
      return "grass";
    case "residential":
      return "residential";
    case "commercial":
    case "retail":
      return "commercial";
    case "industrial":
    case "railway":
    case "depot":
      return "industrial";
    case "farmland":
    case "farmyard":
    case "orchard":
    case "allotments":
    case "plant_nursery":
      return "farmland";
    case "religious":
    case "education":
    case "military":
      return "institution";
    case "construction":
    case "brownfield":
    case "quarry":
      return "sand";
    default:
      return null;
  }
};

export const areaKindIndex = (k: AreaKind) => AREA_KINDS.indexOf(k);

const POI_MAP: Record<string, PoiKind> = {
  hospital: "hospital",
  clinic: "clinic",
  doctors: "clinic",
  dentist: "clinic",
  nursing_home: "clinic",
  pharmacy: "pharmacy",
  school: "school",
  kindergarten: "school",
  college: "school",
  university: "school",
  library: "school",
  marketplace: "market",
  fuel: "fuel",
  bus_station: "bus_station",
  taxi: "bus_station",
  place_of_worship: "place_of_worship",
  bank: "bank",
  atm: "bank",
  bureau_de_change: "bank",
  restaurant: "restaurant",
  fast_food: "restaurant",
  cafe: "restaurant",
  food_court: "restaurant",
  bar: "bar",
  pub: "bar",
  nightclub: "bar",
  police: "police",
  townhall: "office",
  post_office: "office",
  courthouse: "office",
};

const GARAGE_SHOPS = new Set(["motorcycle", "motorcycle_repair", "car_repair", "tyres", "car_parts", "bicycle"]);
const HEALTHCARE: Record<string, PoiKind> = {
  hospital: "hospital",
  clinic: "clinic",
  centre: "clinic",
  doctor: "clinic",
  dentist: "clinic",
  laboratory: "clinic",
  pharmacy: "pharmacy",
};

export const poiKind = (tags: Tags): PoiKind | null => {
  if (tags.amenity === "car_repair" || tags.amenity === "motorcycle_repair" || tags.craft === "motorcycle_repair" || GARAGE_SHOPS.has(tags.shop ?? "")) return "garage";
  if (tags.amenity && POI_MAP[tags.amenity]) return POI_MAP[tags.amenity]!;
  if (tags.healthcare && HEALTHCARE[tags.healthcare]) return HEALTHCARE[tags.healthcare]!;
  if (tags.public_transport === "station") return "bus_station";
  if (tags.highway === "bus_stop" || tags.public_transport === "platform" || tags.public_transport === "stop_position") return "bus_stop";
  if (tags.shop === "supermarket" || tags.shop === "mall") return "market";
  if (tags.shop || tags.craft) return "shop";
  if (tags.tourism && ["hotel", "guest_house", "hostel", "motel"].includes(tags.tourism)) return "hotel";
  if (tags.office) return "office";
  if (tags.amenity) return "other";
  return null;
};

/** The OSM value that says what kind of place this is, for signs and shop menus. */
export const poiSubtype = (tags: Tags): string | undefined => {
  const v = tags.shop ?? tags.office ?? tags.healthcare ?? tags.craft ?? tags.amenity ?? tags.tourism;
  return v && v !== "yes" ? v.slice(0, 24) : undefined;
};

export const poiKindIndex = (k: PoiKind) => POI_KINDS.indexOf(k);

const COMMERCIAL_BUILDINGS = new Set(["commercial", "retail", "kiosk", "supermarket", "office", "hotel", "warehouse"]);
const TALL_BUILDINGS = new Set(["apartments", "commercial", "office", "hotel", "hospital", "university", "college"]);
const SMALL_BUILDINGS = new Set(["shed", "hut", "roof", "kiosk", "toilets", "service", "garage", "garages", "cabin"]);
const WORSHIP_BUILDINGS = new Set(["church", "mosque", "cathedral", "chapel", "temple"]);

export const FLOOR_HEIGHT = 3.2;

/** Wall height in meters. Most Tanzanian buildings lack height tags, so fall back to seeded 1-3 floors. */
export const buildingHeight = (tags: Tags, areaM2: number, rand: () => number): number => {
  const h = Number.parseFloat(tags.height ?? tags["building:height"] ?? "");
  if (Number.isFinite(h) && h > 1) return Math.min(Math.max(h, 2.5), 60);
  const levels = Number.parseInt(tags["building:levels"] ?? "", 10);
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels, 18) * FLOOR_HEIGHT;
  const type = tags.building ?? "yes";
  if (SMALL_BUILDINGS.has(type) || areaM2 < 18) return 2.6 + rand() * 0.4;
  if (WORSHIP_BUILDINGS.has(type) || tags.amenity === "place_of_worship") return 7 + rand() * 3;
  const r = rand();
  let floors = r < 0.66 ? 1 : r < 0.92 ? 2 : 3;
  if (TALL_BUILDINGS.has(type)) floors += 1 + Math.floor(rand() * 2);
  if (areaM2 > 350 && floors < 3 && rand() < 0.5) floors += 1;
  return floors * FLOOR_HEIGHT + rand() * 0.4;
};

export const isCommercialBuilding = (tags: Tags) =>
  COMMERCIAL_BUILDINGS.has(tags.building ?? "") || Boolean(tags.shop) || ["marketplace", "restaurant", "bar", "fast_food", "cafe", "pharmacy"].includes(tags.amenity ?? "");
