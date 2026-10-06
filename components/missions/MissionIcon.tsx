import { Apple, Bus, Camera, Coffee, Flag, Moon, Package, School, ShoppingBasket, Siren, Timer, User, Utensils, type LucideIcon } from "lucide-react";
import type { MissionType } from "@/game/missions/types";

const ICONS: Record<MissionType, LucideIcon> = {
  abiria: User,
  mzigo: Package,
  dharura: Siren,
  chai: Coffee,
  soko: Apple,
  shule: School,
  wageni: Camera,
  mbio: Flag,
  chipsi: Utensils,
  usiku: Moon,
  ninunulie: ShoppingBasket,
  haraka: Timer,
  stendi: Bus,
};

export const MISSION_ACCENT: Record<MissionType, string> = {
  abiria: "bg-sun text-night",
  mzigo: "bg-sky text-night",
  dharura: "bg-coral text-cream",
  chai: "bg-[#C8913A] text-cream",
  soko: "bg-forest text-sun",
  shule: "bg-sky-700 text-cream",
  wageni: "bg-forest-400 text-night",
  mbio: "bg-coral-700 text-cream",
  chipsi: "bg-sun-600 text-night",
  usiku: "bg-night-500 text-sun",
  ninunulie: "bg-forest text-cream",
  haraka: "bg-coral text-night",
  stendi: "bg-sun-300 text-night",
};

export function MissionIcon({ type, className }: { type: MissionType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} aria-hidden="true" />;
}
