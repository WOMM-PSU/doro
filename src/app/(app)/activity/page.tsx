import type { Metadata } from "next";
import { ActivityView } from "@/components/activity-view";

export const metadata: Metadata = {
  title: "My activity",
  description: "Manage tasks you posted or accepted.",
};

export default function ActivityPage() {
  return <ActivityView />;
}
