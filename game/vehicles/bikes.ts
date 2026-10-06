/** Bike tiers, upgrades and the derived riding stats. Prices are believable TZS. */

export const BIKE_IDS = ["mkopo", "kijiweni", "sanlg", "boxer", "legend"] as const;
export type BikeId = (typeof BIKE_IDS)[number];

export const UPGRADE_IDS = ["engine", "handling", "brakes", "tank", "suspension", "horn"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
export const MAX_UPGRADE = 5;

export interface BikeTier {
  id: BikeId;
  name: string;
  price: number;
  /** m/s */
  topSpeed: number;
  /** m/s² at standstill */
  accel: number;
  /** m/s² */
  brake: number;
  /** 0..1, how quickly sideways slip is killed */
  grip: number;
  /** rad/s at walking pace */
  steer: number;
  /** liters */
  tank: number;
  /** Default paint. */
  color: string;
  /** Silhouette knobs for the procedural model. */
  look: { tank: number; fairing: boolean; exhausts: 1 | 2; gold: boolean; rack: boolean };
}

export const BIKES: Record<BikeId, BikeTier> = {
  mkopo: { id: "mkopo", name: "Mkopo Ride", price: 0, topSpeed: 15, accel: 3.2, brake: 7, grip: 0.8, steer: 2.1, tank: 2.5, color: "#9C4A2E", look: { tank: 0.8, fairing: false, exhausts: 1, gold: false, rack: true } },
  kijiweni: { id: "kijiweni", name: "Kijiweni Classic", price: 90_000, topSpeed: 17.5, accel: 3.8, brake: 8, grip: 0.84, steer: 2.2, tank: 3, color: "#C93A31", look: { tank: 1, fairing: false, exhausts: 1, gold: false, rack: true } },
  sanlg: { id: "sanlg", name: "Sanlg Sport", price: 260_000, topSpeed: 20, accel: 4.6, brake: 9, grip: 0.87, steer: 2.35, tank: 3.5, color: "#0B6E4F", look: { tank: 1.15, fairing: true, exhausts: 1, gold: false, rack: false } },
  boxer: { id: "boxer", name: "Boxer Turbo", price: 650_000, topSpeed: 23, accel: 5.4, brake: 10, grip: 0.9, steer: 2.45, tank: 4, color: "#1F3A63", look: { tank: 1.25, fairing: true, exhausts: 2, gold: false, rack: true } },
  legend: { id: "legend", name: "Legend Boda", price: 1_600_000, topSpeed: 26, accel: 6.2, brake: 11, grip: 0.93, steer: 2.6, tank: 5, color: "#10131A", look: { tank: 1.3, fairing: true, exhausts: 2, gold: true, rack: true } },
};

/** Cost of the next level of an upgrade, by tier. */
export const upgradeCost = (bike: BikeId, upgrade: UpgradeId, level: number): number => {
  const base = { engine: 8000, handling: 6000, brakes: 5000, tank: 4000, suspension: 6000, horn: 2500 }[upgrade];
  const tierMul = 1 + BIKE_IDS.indexOf(bike) * 0.6;
  return Math.round((base * tierMul * 1.6 ** level) / 500) * 500;
};

export interface RideStats {
  topSpeed: number;
  accel: number;
  brake: number;
  grip: number;
  steer: number;
  tank: number;
  /** 0..1, how much rough ground slows you and how hard a hit must be to stumble. */
  suspension: number;
  /** Meters at which NPCs react to the horn. */
  hornRange: number;
}

export const rideStats = (bike: BikeId, upgrades: Partial<Record<UpgradeId, number>> = {}): RideStats => {
  const t = BIKES[bike];
  const lv = (u: UpgradeId) => upgrades[u] ?? 0;
  return {
    topSpeed: t.topSpeed * (1 + 0.04 * lv("engine")),
    accel: t.accel * (1 + 0.07 * lv("engine")),
    brake: t.brake * (1 + 0.08 * lv("brakes")),
    grip: Math.min(0.97, t.grip + 0.015 * lv("handling")),
    steer: t.steer * (1 + 0.05 * lv("handling")),
    tank: t.tank * (1 + 0.15 * lv("tank")),
    suspension: Math.min(1, 0.35 + 0.13 * lv("suspension") + BIKE_IDS.indexOf(bike) * 0.04),
    hornRange: 18 + 6 * lv("horn"),
  };
};

/** Normalized 0..1 values for stat bars in the garage. */
export const statBars = (s: RideStats) => ({
  speed: s.topSpeed / 32,
  accel: s.accel / 8.6,
  handling: (s.steer / 3.3 + s.grip) / 2,
  brakes: s.brake / 15.4,
  tank: s.tank / 8.8,
});

