import { useId } from "react";

/**
 * Kitenge / tingatinga-inspired band: alternating sun and forest triangles
 * with coral diamonds and cream dots. Used on card edges and loaders.
 */
export function KitengeStrip({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} aria-hidden="true" preserveAspectRatio="none" focusable="false">
      <defs>
        <pattern id={`k-${id}`} width="32" height="12" patternUnits="userSpaceOnUse">
          <rect width="32" height="12" fill="#10131A" />
          <path d="M0 12 6 1l6 11z" fill="#FFC72C" />
          <path d="M16 12l6-11 6 11z" fill="#0B6E4F" />
          <path d="M14 0l-3 6 3 6 3-6z" fill="#FF5A4F" />
          <path d="M30 0l-3 6 3 6 3-6z" fill="#00A3DD" />
          <circle cx="6" cy="9" r="1.1" fill="#FFF6E5" />
          <circle cx="22" cy="9" r="1.1" fill="#FFF6E5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#k-${id})`} />
    </svg>
  );
}
