import { Suspense } from "react";
import { PlayClient } from "./PlayClient";

export const metadata = { title: "Cheza" };

export default function PlayPage() {
  return (
    <Suspense>
      <PlayClient />
    </Suspense>
  );
}
