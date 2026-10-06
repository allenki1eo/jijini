/**
 * Local businesses that advertise in the game: on billboards, banners
 * strung across main roads, radio spots and boda promo rides (Matangazo).
 *
 * These are all fictional. Real businesses can be added as sponsors in
 * public/ads/manifest.json (with their written permission) and appear in
 * the same slots; see public/ads/README.md.
 */
import type { CityId } from "./cities/config";

export type AdIcon = "utensils" | "wrench" | "smartphone" | "shirt" | "fish" | "pill" | "hammer" | "scissors" | "shield" | "radio" | "wheat" | "droplet";

export interface Business {
  id: string;
  name: string;
  /** Swahili tagline (shown on boards and read on the radio). */
  tagline: string;
  taglineEn: string;
  /** Background, text and accent colours. */
  colors: [string, string, string];
  icon: AdIcon;
  /** Cities it advertises in; omitted = everywhere. */
  cities?: CityId[];
}

export const BUSINESSES: Business[] = [
  { id: "mama-ntilie", name: "Mama Ntilie Bora", tagline: "Wali, maharage na mchicha — TSh 2,000 tu!", taglineEn: "Rice, beans and greens — just TSh 2,000!", colors: ["#FFC72C", "#10131A", "#E85A2A"], icon: "utensils" },
  { id: "juma-spea", name: "Juma Spea za Pikipiki", tagline: "Spea original, fundi wa uhakika", taglineEn: "Genuine spares, a mechanic you can trust", colors: ["#1F3A63", "#FFFFFF", "#FFC72C"], icon: "wrench" },
  { id: "simu-center", name: "Simu Center", tagline: "Simu, chaja na vocha — bei ya jumla", taglineEn: "Phones, chargers and airtime at wholesale prices", colors: ["#E60000", "#FFFFFF", "#10131A"], icon: "smartphone" },
  { id: "boda-bima", name: "Boda Bima Bora", tagline: "Bima ya boda kwa TSh 500 kwa siku", taglineEn: "Boda insurance for TSh 500 a day", colors: ["#0B6E4F", "#FFFFFF", "#FFC72C"], icon: "shield" },
  { id: "saluni-rose", name: "Saluni ya Mama Rose", tagline: "Suka, nywele na urembo", taglineEn: "Braids, hair and beauty", colors: ["#E0457B", "#FFFFFF", "#7C3AED"], icon: "scissors" },
  { id: "uzima-dawa", name: "Duka la Dawa Uzima", tagline: "Afya yako, kipaumbele chetu", taglineEn: "Your health comes first", colors: ["#FFFFFF", "#0B6E4F", "#16A34A"], icon: "pill" },
  { id: "kijiweni-fm", name: "Kijiweni FM 88.5", tagline: "Sauti ya bodaboda mjini!", taglineEn: "The voice of the city's bodas!", colors: ["#10131A", "#FFC72C", "#FF5A4F"], icon: "radio" },
  { id: "nguzo-hardware", name: "Nguzo Nane Hardware", tagline: "Saruji, mabati na misumari", taglineEn: "Cement, iron sheets and nails", colors: ["#F37021", "#FFFFFF", "#10131A"], icon: "hammer", cities: ["shinyanga"] },
  { id: "kahama-mchele", name: "Mchele Bora wa Kanda", tagline: "Mchele safi wa Kanda ya Ziwa", taglineEn: "Clean rice from the Lake Zone", colors: ["#F4EFE2", "#6B4A33", "#2E9E5B"], icon: "wheat", cities: ["shinyanga", "mwanza"] },
  { id: "rock-city-fashion", name: "Rock City Fashion", tagline: "Mitindo mipya kila wiki", taglineEn: "New styles every week", colors: ["#6A1B9A", "#FFFFFF", "#FFC72C"], icon: "shirt", cities: ["mwanza"] },
  { id: "ziwa-samaki", name: "Ziwa Samaki Fresh", tagline: "Sato na sangara kutoka ziwani leo", taglineEn: "Tilapia and Nile perch straight from the lake", colors: ["#00A3DD", "#FFFFFF", "#0D3B66"], icon: "fish", cities: ["mwanza"] },
  { id: "meru-maji", name: "Maji ya Meru", tagline: "Maji safi ya mlimani", taglineEn: "Clean mountain water", colors: ["#E8F4FB", "#0D3B66", "#00A3DD"], icon: "droplet", cities: ["arusha"] },
  { id: "kitenge-house", name: "Kitenge House", tagline: "Vitenge na kanga za kisasa", taglineEn: "Modern kitenge and kanga", colors: ["#C93A31", "#FFF6E5", "#FFC72C"], icon: "shirt", cities: ["arusha", "kariakoo"] },
  { id: "kariakoo-jumla", name: "Kariakoo Jumla", tagline: "Bei ya jumla, mzigo hadi mlangoni", taglineEn: "Wholesale prices, delivered to your door", colors: ["#FFC72C", "#0B6E4F", "#10131A"], icon: "smartphone", cities: ["kariakoo"] },
];

/** Businesses that advertise in a city. */
export const businessesIn = (city: CityId) => BUSINESSES.filter((b) => !b.cities || b.cities.includes(city));
