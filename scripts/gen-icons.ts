/**
 * Generates PWA icons from a single SVG design:
 *   npm run icons
 * Writes public/favicon.svg and PNGs in public/icons (192, 512, maskable 512, apple 180).
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** Boda + rider silhouette in the BodaRider coordinate space (200 x 122). */
const SILHOUETTE = `
  <g fill="#10131A" stroke="#10131A" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="52" cy="96" r="19" fill="none" stroke-width="9"/>
    <circle cx="150" cy="96" r="19" fill="none" stroke-width="9"/>
    <rect x="28" y="40" width="30" height="26" rx="3" stroke="none"/>
    <rect x="26" y="64" width="36" height="7" rx="2" stroke="none"/>
    <path d="M52 96 L90 86" stroke-width="7" fill="none"/>
    <rect x="76" y="72" width="32" height="22" rx="6" stroke="none"/>
    <path d="M54 66 Q70 56 98 62 L118 56 Q134 54 136 66 L128 78 L64 80 Z" stroke="none"/>
    <path d="M150 96 L134 58" stroke-width="7" fill="none"/>
    <path d="M128 52 L140 54" stroke-width="6" fill="none"/>
    <path d="M80 62 L104 64 L101 88" stroke-width="11" fill="none"/>
    <path d="M77 64 Q76 42 88 30 L99 36 Q96 50 93 66 Z" stroke="none"/>
    <path d="M92 36 L110 46 L128 51" stroke-width="9" fill="none"/>
    <circle cx="92" cy="20" r="13" stroke="none"/>
  </g>`;

const icon = ({ maskable }: { maskable: boolean }) => {
  // Maskable icons need the art inside the central 80% safe zone.
  const art = maskable ? "translate(96 120) scale(1.6)" : "translate(66 104) scale(1.9)";
  const sun = maskable ? { cx: 256, cy: 236, r: 132 } : { cx: 256, cy: 226, r: 160 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0E8A63"/><stop offset="1" stop-color="#063F2D"/>
    </linearGradient>
    <pattern id="k" width="64" height="24" patternUnits="userSpaceOnUse">
      <rect width="64" height="24" fill="#10131A"/>
      <path d="M0 24 12 2l12 22z" fill="#FFC72C"/><path d="M32 24l12-22 12 22z" fill="#0B6E4F"/>
      <path d="M28 0l-6 12 6 12 6-12z" fill="#FF5A4F"/><path d="M60 0l-6 12 6 12 6-12z" fill="#00A3DD"/>
    </pattern>
  </defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#bg)"/>
  <circle cx="${sun.cx}" cy="${sun.cy}" r="${sun.r + 26}" fill="#FFC72C" opacity="0.18"/>
  <circle cx="${sun.cx}" cy="${sun.cy}" r="${sun.r}" fill="#FFC72C"/>
  <g transform="${art}">${SILHOUETTE}</g>
  ${maskable ? "" : `<rect x="0" y="420" width="512" height="28" fill="url(#k)"/>`}
</svg>`;
};

const main = async () => {
  const pub = path.join(process.cwd(), "public");
  await fs.mkdir(path.join(pub, "icons"), { recursive: true });
  const any = icon({ maskable: false });
  const maskable = icon({ maskable: true });
  await fs.writeFile(path.join(pub, "favicon.svg"), any);
  const out: [string, string, number][] = [
    ["icon-192.png", any, 192],
    ["icon-512.png", any, 512],
    ["maskable-512.png", maskable, 512],
    ["apple-touch-icon.png", maskable, 180],
  ];
  for (const [name, svg, size] of out) {
    await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(pub, "icons", name));
    console.log(`  ✓ icons/${name}`);
  }
};

void main();
