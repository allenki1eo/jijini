import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BodaGo",
    short_name: "BodaGo",
    description: "Bodaboda delivery game in real Tanzanian cities. Mchezo wa bodaboda mjini.",
    lang: "sw",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "landscape",
    background_color: "#10131A",
    theme_color: "#10131A",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      { src: "/screenshots/menu-wide.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "BodaGo main menu" },
      { src: "/screenshots/world-wide.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "Shinyanga built from OpenStreetMap" },
      { src: "/screenshots/menu-narrow.png", sizes: "720x1280", type: "image/png", form_factor: "narrow", label: "BodaGo on a phone" },
    ],
  };
}
