import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid h-dvh place-items-center bg-night p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size="md" />
        <p className="font-display text-2xl font-bold">Huna mtandao · You&apos;re offline</p>
        <p className="max-w-sm text-cream/70">Ukurasa huu haujahifadhiwa bado. This page hasn&apos;t been saved for offline play yet.</p>
        <Link href="/" className="chunky rounded-2xl bg-sun px-6 py-3 font-display text-lg font-bold text-night [--edge:var(--color-sun-800)]">
          BodaGo
        </Link>
      </div>
    </main>
  );
}
