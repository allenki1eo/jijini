"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { isCityId } from "@/data/cities/config";

// Three.js and the world engine load only on this route, keeping the menu bundle small.
const WorldView = dynamic(() => import("@/game/world/WorldView"), { ssr: false });

export function PlayClient() {
  const param = useSearchParams().get("city") ?? "shinyanga";
  return <WorldView cityId={isCityId(param) ? param : "shinyanga"} />;
}
