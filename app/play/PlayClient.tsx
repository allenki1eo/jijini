"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MotionProvider } from "@/components/MotionProvider";
import { isCityId } from "@/data/cities/config";
import { usePlayer } from "@/stores/player";

// Three.js and the world engine load only on this route, keeping the menu bundle small.
const WorldView = dynamic(() => import("@/game/world/WorldView"), { ssr: false });

export function PlayClient() {
  const params = useSearchParams();
  const router = useRouter();
  const param = params.get("city") ?? "shinyanga";
  const city = isCityId(param) ? param : "shinyanga";
  const hydrated = usePlayer((s) => s.hydrated);
  const unlocked = usePlayer((s) => s.cities.includes(city));

  // Locked cities need a boda-stand membership first.
  useEffect(() => {
    if (hydrated && !unlocked) router.replace("/cities");
  }, [hydrated, unlocked, router]);

  if (hydrated && !unlocked) return null;
  return (
    <MotionProvider>
      <WorldView cityId={city} openBoard={params.get("board") === "1"} />
    </MotionProvider>
  );
}
