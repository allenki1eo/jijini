import { Shield } from "lucide-react";
import { tierFor, type TierId, TIERS } from "@/data/league";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

/** Helmet colours for avatars, picked from the name so a rider always looks the same. */
const HELMETS = ["#FFC72C", "#FF6B5B", "#4FC3F7", "#2EBD7E", "#B388FF", "#FF9F43", "#F06292", "#9CCC65"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("") || "?";

/** A round avatar with the rider's initials on their helmet colour. */
export function RiderAvatar({ name, className }: { name: string; className?: string }) {
  const bg = HELMETS[hash(name.toLowerCase()) % HELMETS.length];
  return (
    <span
      aria-hidden
      className={cn("grid size-11 shrink-0 place-items-center rounded-full font-display font-extrabold text-night shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)] ring-2 ring-night", className)}
      style={{ background: bg }}
    >
      {initials(name)}
    </span>
  );
}

/** A division badge: shield in the division's metal, with its name unless `compact`. */
export function TierBadge({ tier, points, compact = false, className }: { tier?: TierId; points?: number; compact?: boolean; className?: string }) {
  const t = useT();
  const info = tier ? TIERS.find((x) => x.id === tier)! : tierFor(points ?? 0);
  const label = t.league.tiers[info.id];
  return (
    <span
      title={label}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full font-display text-xs font-extrabold", compact ? "size-6 justify-center" : "py-0.5 pr-2.5 pl-1.5", className)}
      style={{ background: info.bg, color: info.ink, boxShadow: `inset 0 0 0 1.5px ${info.ring}` }}
    >
      <Shield className="size-3.5 fill-current/25" strokeWidth={2.5} />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
