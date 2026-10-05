"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/i18n";

/** Back button + title for secondary screens. */
export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex items-center gap-4">
      <Link
        href="/"
        aria-label={t.common.back}
        className="chunky grid size-12 shrink-0 place-items-center rounded-2xl bg-night-600 text-cream ring-1 ring-white/10 [--edge:var(--color-night)]"
      >
        <ArrowLeft className="size-6" />
      </Link>
      <h1 className="sticker flex-1 text-4xl short:text-3xl">{title}</h1>
      {action}
    </header>
  );
}
