/**
 * Growing from one boda to a small company: once you own a bike of your own,
 * you can buy more and hand them to riders who bring you hesabu every
 * evening (by BodaPesa), just as you once paid Bosi Mrisho. Bikes wear out
 * and need the fundi; riders sometimes come up short.
 */
import type { BikeId } from "@/game/vehicles/bikes";

/** Bikes worth putting on the road for hire, and what each brings in a day (TZS, before the city's going rate). */
export const FLEET_BIKES: { id: BikeId; daily: number }[] = [
  { id: "kijiweni", daily: 6_000 },
  { id: "sanlg", daily: 9_500 },
  { id: "boxer", daily: 14_000 },
];

export const MAX_FLEET = 8;

/** Riders looking for a boda to work. */
export const FLEET_RIDERS = ["Juma", "Baraka", "Hamisi", "Shabani", "Rajabu", "Musa", "Saidi", "Petro", "Amosi", "Hussein", "Elia", "Kassimu"];

/** Fundi cost to bring a fleet bike back to full condition. */
export const fleetRepairCost = (condition: number) => Math.ceil(((100 - condition) * 350) / 500) * 500;

/** What selling a fleet bike back brings (half the price, less for a worn one). */
export const fleetResale = (price: number, condition: number) => Math.round((price * 0.5 * (0.5 + condition / 200)) / 1000) * 1000;

export interface FleetBike {
  /** Stable id for the list. */
  id: string;
  bike: BikeId;
  rider: string;
  /** 0–100: worn bikes earn less and break down. */
  condition: number;
  /** Lifetime hesabu this bike has brought in. */
  earned: number;
}
