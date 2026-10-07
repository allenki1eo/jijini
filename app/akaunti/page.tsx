import { MotionProvider } from "@/components/MotionProvider";
import { AccountScreen } from "@/components/screens/AccountScreen";

export const metadata = { title: "Akaunti", description: "Register or sign in to join the league and keep your progress online." };

export default function AccountPage() {
  return (
    <MotionProvider>
      <AccountScreen />
    </MotionProvider>
  );
}
