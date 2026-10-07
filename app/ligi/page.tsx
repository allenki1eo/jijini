import { MotionProvider } from "@/components/MotionProvider";
import { LeaderboardScreen } from "@/components/screens/LeaderboardScreen";

export const metadata = { title: "Ligi", description: "City leaderboards: this week's race and the top-earning boda riders." };

export default function LeaguePage() {
  return (
    <MotionProvider>
      <LeaderboardScreen />
    </MotionProvider>
  );
}
