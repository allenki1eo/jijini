import { cn } from "@/lib/cn";

const Wheel = ({ cx }: { cx: number }) => (
  <g>
    <circle cx={cx} cy="96" r="19" fill="#10131A" />
    <circle cx={cx} cy="96" r="12.5" fill="none" stroke="#9AA3B5" strokeWidth="2.5" />
    <g className="animate-spin-wheel" style={{ transformOrigin: `${cx}px 96px`, transformBox: "view-box" }}>
      <path d={`M${cx - 12} 96h24M${cx} 84v24M${cx - 8.5} 87.5l17 17M${cx + 8.5} 87.5l-17 17`} stroke="#C9D0DC" strokeWidth="1.6" />
    </g>
    <circle cx={cx} cy="96" r="3.2" fill="#FFC72C" />
  </g>
);

/**
 * Side-view bodaboda: red Boxer-style bike, rider in a sun-yellow helmet and
 * reflective vest, crate of goods on the rack. Pure SVG + CSS animation.
 */
export function BodaRider({ className, riding = true }: { className?: string; riding?: boolean }) {
  return (
    <svg viewBox="0 0 200 122" className={cn("overflow-visible", className)} aria-hidden="true">
      <ellipse cx="100" cy="117" rx="74" ry="4" fill="#000" opacity="0.28" />
      <g className={riding ? "animate-bob" : undefined}>
        {/* Rack + crate */}
        <rect x="26" y="66" width="34" height="5" rx="2" fill="#2A3040" />
        <g>
          <rect x="28" y="40" width="30" height="26" rx="3" fill="#D69A57" />
          <path d="M28 49h30M28 57h30" stroke="#A86F37" strokeWidth="2" />
          <path d="M37 40v26M49 40v26" stroke="#A86F37" strokeWidth="1.4" opacity="0.6" />
          <rect x="31" y="35" width="10" height="7" rx="2" fill="#FF5A4F" />
          <rect x="43" y="33" width="11" height="9" rx="2" fill="#0B6E4F" />
        </g>
        {/* Exhaust */}
        <path d="M84 98 L42 90" stroke="#C9D0DC" strokeWidth="5" strokeLinecap="round" />
        <path d="M42 90 L34 88" stroke="#7D8698" strokeWidth="6" strokeLinecap="round" />
        {/* Swingarm + engine */}
        <path d="M52 96 L90 86" stroke="#2A3040" strokeWidth="5" strokeLinecap="round" />
        <rect x="78" y="74" width="28" height="20" rx="6" fill="#3A4256" />
        <circle cx="90" cy="86" r="5" fill="#2A3040" stroke="#7D8698" strokeWidth="1.5" />
        {/* Body + tank */}
        <path d="M60 68 Q76 60 96 64 L118 58 Q132 56 134 66 L128 76 L98 80 L64 78 Z" fill="#FF5A4F" />
        <path d="M98 64 L118 58 Q128 57 130 64 L102 70 Z" fill="#FF8A80" opacity="0.7" />
        <path d="M66 74 L126 70" stroke="#C93A31" strokeWidth="2" />
        {/* Seat */}
        <path d="M54 66 Q68 58 96 62 L96 68 Q74 66 56 72 Z" fill="#10131A" />
        {/* Front fork, fender, headlight */}
        <path d="M150 96 L134 58" stroke="#C9D0DC" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M134 80 Q150 72 166 84" stroke="#FF5A4F" strokeWidth="5" fill="none" strokeLinecap="round" />
        <circle cx="140" cy="64" r="6.5" fill="#FFC72C" stroke="#10131A" strokeWidth="2" />
        <path d="M146 62 L176 54 L176 74 Z" fill="#FFC72C" opacity="0.18" />
        <path d="M128 52 L138 54" stroke="#10131A" strokeWidth="3.5" strokeLinecap="round" />
        <Wheel cx={52} />
        <Wheel cx={150} />
        {/* Rider */}
        <g>
          <path d="M80 62 L104 64 L101 88" stroke="#1F3A63" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M98 89 L108 89" stroke="#10131A" strokeWidth="6" strokeLinecap="round" />
          <path d="M77 63 Q76 42 88 30 L98 36 Q96 50 92 64 Z" fill="#0B6E4F" />
          <path d="M80 50 L95 52 M82 42 L97 44" stroke="#FFC72C" strokeWidth="3.2" />
          <path d="M92 36 L110 46 L128 51" stroke="#0B6E4F" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="129" cy="51" r="3.5" fill="#6B4A33" />
          <circle cx="92" cy="20" r="11.5" fill="#FFC72C" />
          <path d="M95 13 Q105 15 104 24 L96 24 Z" fill="#10131A" opacity="0.85" />
          <path d="M82 16 Q90 8 100 11" stroke="#FFF6E5" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.8" />
        </g>
      </g>
    </svg>
  );
}
