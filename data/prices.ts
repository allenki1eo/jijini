/**
 * Street prices in Tanzanian shillings, so errands, fuel and repairs cost
 * what they cost on the street. Base prices are typical Dar es Salaam retail
 * (2025); other cities shift per item (rice is cheaper in the Lake Zone, fish
 * cheaper in Mwanza, everything a little dearer in Arusha). Prices drift a
 * few percent day to day, like a real market.
 *
 * Fuel follows the EWURA cap structure: cheapest at the Dar port, rising
 * inland with transport costs.
 */
import type { CityId } from "./cities/config";

export type GoodId =
  | "oil1"
  | "oil5"
  | "sugar"
  | "rice"
  | "unga"
  | "beans"
  | "tomatoes"
  | "onions"
  | "bananas"
  | "dagaa"
  | "sato"
  | "eggs"
  | "milk"
  | "bread"
  | "salt"
  | "soap"
  | "charcoal"
  | "gas"
  | "water"
  | "voucher"
  | "panadol"
  | "ors"
  | "nails"
  | "cement";

/** Where a good is sold: open-air market stalls, ordinary shops (maduka), chemists or hardware. */
export type Seller = "market" | "shop" | "pharmacy" | "hardware";

export interface Good {
  id: GoodId;
  sw: string;
  en: string;
  /** Unit, e.g. "kg", "lita 1", "trei". */
  unitSw: string;
  unitEn: string;
  /** Dar es Salaam street price for one unit (TZS). */
  price: number;
  sellers: Seller[];
  /** Typical quantities someone asks for. */
  qty: number[];
}

export const GOODS: Record<GoodId, Good> = {
  oil1: { id: "oil1", sw: "Mafuta ya kupikia", en: "Cooking oil", unitSw: "lita 1", unitEn: "1 litre", price: 5500, sellers: ["market", "shop"], qty: [1, 2] },
  oil5: { id: "oil5", sw: "Mafuta ya kupikia", en: "Cooking oil", unitSw: "dumu la lita 5", unitEn: "5 L jerrycan", price: 25000, sellers: ["market", "shop"], qty: [1] },
  sugar: { id: "sugar", sw: "Sukari", en: "Sugar", unitSw: "kilo", unitEn: "kg", price: 3000, sellers: ["market", "shop"], qty: [1, 2, 3] },
  rice: { id: "rice", sw: "Mchele", en: "Rice", unitSw: "kilo", unitEn: "kg", price: 3000, sellers: ["market", "shop"], qty: [2, 3, 5] },
  unga: { id: "unga", sw: "Unga wa sembe", en: "Maize flour", unitSw: "kilo", unitEn: "kg", price: 1800, sellers: ["market", "shop"], qty: [2, 5] },
  beans: { id: "beans", sw: "Maharage", en: "Beans", unitSw: "kilo", unitEn: "kg", price: 3500, sellers: ["market"], qty: [1, 2] },
  tomatoes: { id: "tomatoes", sw: "Nyanya", en: "Tomatoes", unitSw: "fungu", unitEn: "heap", price: 1000, sellers: ["market"], qty: [2, 3] },
  onions: { id: "onions", sw: "Vitunguu", en: "Onions", unitSw: "kilo", unitEn: "kg", price: 3000, sellers: ["market"], qty: [1, 2] },
  bananas: { id: "bananas", sw: "Ndizi", en: "Bananas", unitSw: "chana", unitEn: "hand", price: 2000, sellers: ["market"], qty: [1, 2] },
  dagaa: { id: "dagaa", sw: "Dagaa", en: "Dagaa (sardines)", unitSw: "kilo", unitEn: "kg", price: 10000, sellers: ["market"], qty: [1] },
  sato: { id: "sato", sw: "Samaki sato", en: "Tilapia", unitSw: "mmoja", unitEn: "fish", price: 12000, sellers: ["market"], qty: [1, 2] },
  eggs: { id: "eggs", sw: "Mayai", en: "Eggs", unitSw: "trei (30)", unitEn: "tray of 30", price: 11000, sellers: ["market", "shop"], qty: [1] },
  milk: { id: "milk", sw: "Maziwa", en: "Milk", unitSw: "lita 1", unitEn: "1 litre", price: 2000, sellers: ["shop", "market"], qty: [1, 2, 3] },
  bread: { id: "bread", sw: "Mkate", en: "Bread", unitSw: "mmoja", unitEn: "loaf", price: 2000, sellers: ["shop"], qty: [1, 2] },
  salt: { id: "salt", sw: "Chumvi", en: "Salt", unitSw: "kilo", unitEn: "kg", price: 800, sellers: ["market", "shop"], qty: [1] },
  soap: { id: "soap", sw: "Sabuni ya kipande", en: "Bar soap", unitSw: "kipande", unitEn: "bar", price: 1500, sellers: ["shop", "market"], qty: [2, 3] },
  charcoal: { id: "charcoal", sw: "Mkaa", en: "Charcoal", unitSw: "ndoo", unitEn: "bucket", price: 5000, sellers: ["market"], qty: [1, 2] },
  gas: { id: "gas", sw: "Gesi ya kupikia", en: "Cooking gas", unitSw: "mtungi kg 15", unitEn: "15 kg refill", price: 56000, sellers: ["shop"], qty: [1] },
  water: { id: "water", sw: "Maji ya kunywa", en: "Drinking water", unitSw: "chupa lita 1.5", unitEn: "1.5 L bottle", price: 1000, sellers: ["shop"], qty: [2, 4, 6] },
  voucher: { id: "voucher", sw: "Vocha ya simu", en: "Airtime voucher", unitSw: "ya 2,000", unitEn: "2,000", price: 2000, sellers: ["shop"], qty: [1, 2] },
  panadol: { id: "panadol", sw: "Panadol", en: "Paracetamol", unitSw: "kadi", unitEn: "strip", price: 1000, sellers: ["pharmacy"], qty: [1, 2] },
  ors: { id: "ors", sw: "ORS", en: "ORS sachets", unitSw: "pakiti", unitEn: "sachet", price: 500, sellers: ["pharmacy"], qty: [2, 4] },
  nails: { id: "nails", sw: "Misumari", en: "Nails", unitSw: "kilo", unitEn: "kg", price: 4500, sellers: ["hardware"], qty: [1, 2] },
  cement: { id: "cement", sw: "Saruji", en: "Cement", unitSw: "mfuko kg 50", unitEn: "50 kg bag", price: 17500, sellers: ["hardware"], qty: [1] },
};

/** Per-city price multipliers: an overall level plus item overrides. */
const CITY_PRICES: Record<CityId, { all: number; items?: Partial<Record<GoodId, number>> }> = {
  kariakoo: { all: 1 },
  shinyanga: { all: 0.95, items: { rice: 0.8, dagaa: 0.75, sato: 0.75, charcoal: 0.7, cement: 1.12, gas: 1.08 } },
  mwanza: { all: 0.97, items: { rice: 0.85, dagaa: 0.6, sato: 0.65, cement: 1.1, gas: 1.07 } },
  arusha: { all: 1.05, items: { tomatoes: 0.85, onions: 0.8, bananas: 0.75, milk: 0.85, dagaa: 1.1 } },
  dodoma: { all: 0.97, items: { onions: 0.8, beans: 0.9, unga: 0.9, dagaa: 0.95, cement: 1.06 } },
  moshi: { all: 1.03, items: { bananas: 0.65, milk: 0.8, tomatoes: 0.85, beans: 0.9, dagaa: 1.12 } },
  tanga: { all: 0.98, items: { dagaa: 0.75, sato: 1.1, cement: 0.88, sugar: 0.95, charcoal: 0.85 } },
  mbeya: { all: 0.96, items: { rice: 0.72, bananas: 0.7, beans: 0.85, unga: 0.85, gas: 1.1, dagaa: 1.05 } },
};

/** Petrol, TZS per litre (approximate EWURA cap levels). */
export const FUEL_PRICE: Record<CityId, number> = {
  kariakoo: 2850,
  arusha: 2940,
  mwanza: 2980,
  shinyanga: 2990,
  dodoma: 2930,
  moshi: 2950,
  tanga: 2870,
  mbeya: 3010,
};

/** A fundi's rate per damage point (labour + small parts). */
export const REPAIR_RATE: Record<CityId, number> = {
  kariakoo: 140,
  arusha: 160,
  mwanza: 150,
  shinyanga: 130,
  dodoma: 140,
  moshi: 150,
  tanga: 140,
  mbeya: 140,
};

const dayNumber = () => Math.floor(Date.now() / 86_400_000);

/** A gentle, repeatable daily drift of ±6 % per item. */
const drift = (city: string, id: string, day: number) => {
  let h = 2166136261;
  for (const c of `${city}:${id}:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return 0.94 + ((h >>> 0) % 1000) / 1000 * 0.12;
};

/** Rounded to the nearest 50, as prices are on the street. */
const street = (v: number) => Math.max(50, Math.round(v / 50) * 50);

/** Today's price of one unit of a good in a city. */
export const priceOf = (id: GoodId, city: CityId, day = dayNumber()): number => {
  const c = CITY_PRICES[city];
  return street(GOODS[id].price * c.all * (c.items?.[id] ?? 1) * drift(city, id, day));
};

export interface ShoppingItem {
  id: GoodId;
  qty: number;
  /** Price per unit when the list was made (what the customer expects to pay). */
  unit: number;
}

/** What kind of seller an OSM shop is, from its subtype. */
export const sellerOf = (kind: string, subtype?: string): Seller | null => {
  if (kind === "pharmacy") return "pharmacy";
  if (kind === "market") return "market";
  if (kind === "garage") return null;
  if (kind === "shop") {
    if (subtype === "hardware" || subtype === "doityourself" || subtype === "building_materials") return "hardware";
    return "shop";
  }
  return null;
};

/** Market stalls haggle; supermarkets and chemists don't. */
export const canHaggle = (seller: Seller) => seller === "market" || seller === "hardware";

/**
 * Hesabu: what a rider on a borrowed boda hands the owner every evening.
 * Typical daily rates; Dar is dearest.
 */
export const HESABU: Record<CityId, number> = {
  kariakoo: 12_000,
  arusha: 10_000,
  mwanza: 10_000,
  shinyanga: 8_000,
  dodoma: 9_000,
  moshi: 9_000,
  tanga: 9_000,
  mbeya: 10_000,
};

/** The owner who lends you the Mkopo Ride. */
export const BODA_OWNER = "Bosi Mrisho";
/** Hesabu is collected at this hour of the game day. */
export const HESABU_HOUR = 20;

/** Motorcycle (class A) licence renewal fee, and how long it lasts in game hours (10 game days). */
export const LICENCE_FEE = 70_000;
export const LICENCE_HOURS = 240;
