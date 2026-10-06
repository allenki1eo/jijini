/** Illustrated portraits of the Kijiweni cast (pure SVG). */

export type CharacterId = "juma" | "baraka" | "neema" | "salum";

const Face = ({ skin }: { skin: string }) => (
  <>
    <ellipse cx="50" cy="56" rx="22" ry="25" fill={skin} />
    <ellipse cx="41" cy="54" rx="2.6" ry="3.2" fill="#10131A" />
    <ellipse cx="59" cy="54" rx="2.6" ry="3.2" fill="#10131A" />
    <path d="M42 67 Q50 73 58 67" stroke="#10131A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </>
);

export function Portrait({ id, className }: { id: CharacterId; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {id === "juma" && (
        <>
          <rect width="100" height="100" fill="#0B6E4F" />
          <path d="M18 100 Q22 78 50 76 Q78 78 82 100Z" fill="#F4F1EA" />
          <Face skin="#5B3A26" />
          {/* White kofia and grey beard */}
          <path d="M30 40 Q30 26 50 26 Q70 26 70 40Z" fill="#FFFFFF" />
          <path d="M30 40 h40" stroke="#D9C9A8" strokeWidth="2" />
          <path d="M33 64 Q36 86 50 86 Q64 86 67 64 Q60 74 50 74 Q40 74 33 64Z" fill="#D8D8D8" />
          <path d="M42 67 Q50 71 58 67" stroke="#10131A" strokeWidth="2" fill="none" />
        </>
      )}
      {id === "baraka" && (
        <>
          <rect width="100" height="100" fill="#FF5A4F" />
          <path d="M16 100 Q20 76 50 74 Q80 76 84 100Z" fill="#10131A" />
          <path d="M30 86 L70 86" stroke="#FFC72C" strokeWidth="4" />
          <Face skin="#4A2E1E" />
          {/* Backwards red cap and a smirk */}
          <path d="M28 44 Q28 28 50 28 Q72 28 72 44Z" fill="#C93A31" />
          <path d="M70 42 h12 a3 3 0 0 1 0 6 h-12Z" fill="#C93A31" />
          <path d="M44 68 Q53 72 60 64" stroke="#10131A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      )}
      {id === "neema" && (
        <>
          <rect width="100" height="100" fill="#FFC72C" />
          <path d="M16 100 Q22 76 50 74 Q78 76 84 100Z" fill="#E0457B" />
          <Face skin="#5B3A26" />
          {/* Kitenge headwrap */}
          <path d="M26 46 Q24 20 50 18 Q76 20 74 46 Q66 36 50 36 Q34 36 26 46Z" fill="#0B6E4F" />
          <circle cx="40" cy="28" r="3" fill="#FFC72C" />
          <circle cx="56" cy="25" r="3" fill="#FF5A4F" />
          <circle cx="66" cy="34" r="3" fill="#FFC72C" />
          <circle cx="68" cy="58" r="3" fill="#FFC72C" />
        </>
      )}
      {id === "salum" && (
        <>
          <rect width="100" height="100" fill="#0D3B66" />
          <path d="M16 100 Q20 76 50 74 Q80 76 84 100Z" fill="#F4F4F2" />
          <path d="M44 76 L50 92 L56 76" fill="#0D3B66" />
          <Face skin="#3E2618" />
          {/* Police cap with badge, moustache */}
          <path d="M26 40 Q26 22 50 22 Q74 22 74 40Z" fill="#F4F4F2" />
          <rect x="24" y="38" width="52" height="7" rx="2" fill="#10131A" />
          <circle cx="50" cy="31" r="4" fill="#FFC72C" />
          <path d="M40 64 Q50 60 60 64" stroke="#10131A" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
