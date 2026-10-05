import "@fontsource-variable/baloo-2";
import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: { default: "BodaGo", template: "%s · BodaGo" },
  description: "Bodaboda delivery game in real Tanzanian cities built from OpenStreetMap. Mchezo wa bodaboda mjini.",
  applicationName: "BodaGo",
  appleWebApp: { capable: true, title: "BodaGo", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#10131A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sw" dir="ltr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
