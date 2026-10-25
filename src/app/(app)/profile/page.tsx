import type { Metadata } from "next";
import { ProfileView } from "@/components/profile-view";

export const metadata: Metadata = {
  title: "Profile",
  description: "Reputation, preferences and demo controls.",
};

export default function ProfilePage() {
  return <ProfileView />;
}
