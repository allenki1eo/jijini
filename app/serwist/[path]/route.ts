import { createSerwistRoute } from "@serwist/turbopack";

// Changes every build so precached pages are refreshed on deploy.
const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // Precache the app shell only. City data is cached on demand (and by the download manager later).
  globPatterns: [".next/static/**/*.{js,css,woff2,png,svg,webp,json}", "public/icons/**/*", "public/favicon.svg"],
  additionalPrecacheEntries: ["/", "/play", "/settings", "/credits", "/~offline"].map((url) => ({ url, revision })),
});
