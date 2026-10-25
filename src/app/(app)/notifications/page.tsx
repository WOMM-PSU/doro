import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications-view";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Personalized task and match updates.",
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
