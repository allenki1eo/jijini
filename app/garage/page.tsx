import { MotionProvider } from "@/components/MotionProvider";
import { GarageScreen } from "@/components/screens/GarageScreen";

export const metadata = { title: "Gereji" };

export default function GaragePage() {
  return (
    <MotionProvider>
      <GarageScreen />
    </MotionProvider>
  );
}
