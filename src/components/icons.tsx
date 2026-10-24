import {
  AlertTriangle,
  Banknote,
  Bell,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Code2,
  GraduationCap,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { NotificationKind, TaskCategory } from "@/types";

export const CATEGORY_ICONS: Record<TaskCategory, LucideIcon> = {
  delivery: Truck,
  errands: ShoppingBag,
  tutoring: GraduationCap,
  tech: Code2,
  moving: Boxes,
  other: Sparkles,
};

export const NOTIFICATION_ICONS: Record<NotificationKind, LucideIcon> = {
  MATCH: Sparkles,
  OFFER_RECEIVED: Banknote,
  OFFER_ACCEPTED: CheckCircle2,
  OFFER_REJECTED: Bell,
  TASK_ACCEPTED: UserCheck,
  MESSAGE: MessageSquare,
  TASK_READY: CheckCircle2,
  TASK_COMPLETED: CheckCircle2,
  TASK_CANCELLED: AlertTriangle,
  DEADLINE_SOON: CalendarClock,
  PAYMENT: Banknote,
  SYSTEM: Star,
};
