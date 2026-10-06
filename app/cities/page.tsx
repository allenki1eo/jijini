import { MotionProvider } from "@/components/MotionProvider";
import { CitySelectScreen } from "@/components/screens/CitySelectScreen";

export const metadata = { title: "Majiji" };

export default function CitiesPage() {
  return (
    <MotionProvider>
      <CitySelectScreen />
    </MotionProvider>
  );
}
