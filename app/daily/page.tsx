import { MotionProvider } from "@/components/MotionProvider";
import { ProgressScreen } from "@/components/screens/ProgressScreen";

export const metadata = { title: "Changamoto" };

export default function DailyPage() {
  return (
    <MotionProvider>
      <ProgressScreen />
    </MotionProvider>
  );
}
