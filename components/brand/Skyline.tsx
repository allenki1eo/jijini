import { cn } from "@/lib/cn";
import { BodaRider } from "./BodaRider";

/**
 * Golden-hour Tanzanian townscape for the main menu: layered hills, a
 * silhouetted skyline with minaret, church, water tower and mast, mango and
 * acacia trees, and a road with a boda passing by.
 */
export function Skyline({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B2547" />
            <stop offset="0.38" stopColor="#6B3F6E" />
            <stop offset="0.62" stopColor="#E3725A" />
            <stop offset="0.8" stopColor="#FFB547" />
            <stop offset="1" stopColor="#FFD77A" />
          </linearGradient>
          <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFF3C4" />
            <stop offset="0.55" stopColor="#FFD45A" />
            <stop offset="1" stopColor="#FFC72C" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFB547" stopOpacity="0" />
            <stop offset="1" stopColor="#FFB547" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        <rect width="1600" height="900" fill="url(#sky)" />
        <circle cx="1130" cy="560" r="230" fill="url(#sun)" opacity="0.75" />
        <circle cx="1130" cy="560" r="96" fill="#FFE9A3" />

        {/* Far hills and granite kopjes (Shinyanga's boulder hills). */}
        <path d="M0 610 C120 570 210 590 320 560 S520 600 640 575 S860 520 980 560 S1240 590 1360 548 S1520 570 1600 556 V900 H0Z" fill="#B0566A" opacity="0.55" />
        <path d="M0 650 C90 630 180 640 260 612 C300 598 318 606 340 622 S420 640 520 628 S700 600 820 622 S1020 650 1120 620 C1160 606 1190 590 1230 604 S1340 640 1460 626 S1560 640 1600 634 V900 H0Z" fill="#7D3F62" opacity="0.8" />
        <g fill="#7D3F62">
          <ellipse cx="300" cy="606" rx="34" ry="22" />
          <ellipse cx="330" cy="598" rx="20" ry="16" />
          <ellipse cx="1220" cy="600" rx="30" ry="20" />
        </g>
        <rect y="560" width="1600" height="160" fill="url(#haze)" />

        {/* Town silhouette. */}
        <g fill="#3B2346">
          <path d="M0 700 V662 h70 v-18 h60 v26 h40 v-40 h52 v44 h36 v-22 h60 v34 h28 V700Z" />
          {/* Mosque with dome and minaret */}
          <path d="M360 700 V640 h80 V700Z" />
          <path d="M370 640 a30 26 0 0 1 60 0Z" />
          <rect x="452" y="560" width="14" height="140" />
          <path d="M448 566 h22 l-11 -22Z" />
          <rect x="449" y="600" width="20" height="5" />
          <path d="M498 700 V650 h90 v-12 h40 v62Z" />
          {/* Church with cross */}
          <path d="M660 700 V630 l40 -36 l40 36 V700Z" />
          <rect x="696" y="560" width="8" height="40" />
          <rect x="686" y="572" width="28" height="7" />
          {/* Water tower */}
          <rect x="800" y="600" width="70" height="38" rx="6" />
          <path d="M812 638 l-10 62 h8 l9 -62Z M858 638 l10 62 h-8 l-9 -62Z M820 660 h30 v5 h-30Z" />
          <path d="M890 700 V646 h56 v-16 h34 v70Z M990 700 V660 h80 V700Z" />
          {/* Telecom mast */}
          <path d="M1100 700 L1122 520 L1144 700Z M1110 640 h24 M1106 676 h32" stroke="#3B2346" strokeWidth="5" />
          <circle cx="1122" cy="516" r="5" fill="#FF5A4F" />
          <path d="M1160 700 V652 h46 v-20 h52 v68Z M1270 700 V664 h70 v-16 h60 v52Z M1400 700 V640 h70 v28 h40 v-14 h90 V700Z" />
        </g>
        {/* Windows catching the sunset */}
        <g fill="#FFC72C" opacity="0.85">
          <rect x="84" y="652" width="8" height="8" /><rect x="100" y="652" width="8" height="8" />
          <rect x="520" y="660" width="8" height="8" /><rect x="560" y="660" width="8" height="8" />
          <rect x="1180" y="664" width="8" height="8" /><rect x="1292" y="676" width="8" height="8" />
          <rect x="1430" y="656" width="8" height="8" /><rect x="1520" y="668" width="8" height="8" />
        </g>
        {/* Power line */}
        <path d="M0 610 Q200 640 400 612 T800 616 T1200 610 T1600 618" stroke="#3B2346" strokeWidth="2" fill="none" />

        {/* Mid trees: mango blobs, acacia umbrellas, a palm. */}
        <g fill="#24152E">
          <path d="M150 720 v-50" stroke="#24152E" strokeWidth="8" />
          <ellipse cx="150" cy="660" rx="58" ry="40" />
          <ellipse cx="190" cy="676" rx="34" ry="26" />
          <path d="M610 724 q6 -40 -4 -74" stroke="#24152E" strokeWidth="7" fill="none" />
          <ellipse cx="612" cy="648" rx="84" ry="14" />
          <ellipse cx="600" cy="638" rx="54" ry="10" />
          <path d="M1490 722 q-12 -80 6 -140" stroke="#24152E" strokeWidth="7" fill="none" />
          <path d="M1496 582 q-50 -10 -80 26 q40 -20 80 -26 q-30 -40 -76 -40 q46 6 76 40 q10 -44 50 -60 q-36 28 -50 60 q44 -26 90 -10 q-54 -4 -90 10 q40 14 56 50 q-30 -34 -56 -50Z" />
          <path d="M1010 724 q4 -36 -6 -66" stroke="#24152E" strokeWidth="6" fill="none" />
          <ellipse cx="1004" cy="656" rx="70" ry="12" />
        </g>

        {/* Road */}
        <rect y="720" width="1600" height="180" fill="#2A1A2E" />
        <rect y="720" width="1600" height="10" fill="#4A2E3E" />
        <rect y="800" width="1600" height="100" fill="#1E1424" />
      </svg>

      {/* Moving lane dashes */}
      <div className="absolute inset-x-0 bottom-[13%] h-1.5 overflow-hidden opacity-70">
        <div className="animate-road h-full w-[calc(100%+48px)] bg-[repeating-linear-gradient(90deg,#FFC72C_0_24px,transparent_24px_48px)]" />
      </div>

      {/* Boda crossing the scene */}
      <div className="absolute bottom-[10.5%] left-0 w-full">
        <div className="animate-drift w-[clamp(110px,14vw,190px)] [animation-duration:14s]">
          <BodaRider className="w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.45)]" />
        </div>
      </div>

      {/* Birds */}
      <svg viewBox="0 0 120 40" className="absolute top-[18%] left-[58%] w-24 opacity-60" aria-hidden="true">
        <path d="M2 20 q8 -8 16 0 q8 -8 16 0 M50 10 q6 -6 12 0 q6 -6 12 0 M84 26 q5 -5 10 0 q5 -5 10 0" stroke="#24152E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
