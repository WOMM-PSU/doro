/**
 * Doro domain model.
 *
 * All money is stored as integer US cents. All timestamps are ISO-8601 UTC
 * strings. IDs are stable, human-readable strings so seeded relationships are
 * easy to trace while debugging.
 */

export type TaskCategory =
  | "delivery"
  | "errands"
  | "tutoring"
  | "tech"
  | "moving"
  | "other";

export type TravelMode = "walk" | "bike" | "bus" | "car";

export type TaskStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_CONFIRMATION"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";

export type AcceptanceMode = "fixed" | "offers";

export type PaymentMethod = "stripe_card" | "cash_handoff";

export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "SUPERSEDED";

export type PaymentState =
  | "DEMO_AUTHORIZED"
  | "DEMO_RELEASED"
  | "DEMO_REFUNDED"
  | "DEMO_DISPUTED";

export type NotificationKind =
  | "MATCH"
  | "OFFER_RECEIVED"
  | "OFFER_ACCEPTED"
  | "OFFER_REJECTED"
  | "TASK_ACCEPTED"
  | "MESSAGE"
  | "TASK_READY"
  | "TASK_COMPLETED"
  | "TASK_CANCELLED"
  | "DEADLINE_SOON"
  | "PAYMENT"
  | "SYSTEM";

export type ReportSubject = "TASK" | "USER" | "MESSAGE";

export interface UserPreferences {
  categories: TaskCategory[];
  minRewardCents: number;
  maxDistanceMiles: number;
  travelMode: TravelMode;
  prefersScheduled: boolean;
  preferredLocationIds: string[];
  skills: string[];
  notifyMatches: boolean;
  quietHours: { startHour: number; endHour: number };
}

export interface UserHistory {
  completed: number;
  cancelled: number;
  disputed: number;
  ratingSum: number;
  ratingCount: number;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatarColor: string;
  bio: string;
  role: "requester" | "helper" | "both";
  joinedLabel: string;
  verified: boolean;
  homeLocationId: string;
  preferences: UserPreferences;
  /** History from before the demo window, used as reputation prior. */
  history: UserHistory;
  isNew?: boolean;
  /** Stripe Connect Express account, once this person starts onboarding. */
  stripeAccountId?: string;
  /** True when Stripe enabled transfers, so a destination charge can pay them. */
  stripeAccountReady?: boolean;
}

export type AttachmentKind = "dropoff" | "receipt";

/** Metadata only; the image bytes live in IndexedDB on this device. */
export interface TaskAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: string;
}

export interface Task {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: TaskCategory;
  /** Pickup point for deliveries, otherwise the task location. */
  locationId: string;
  dropoffLocationId?: string;
  rewardCents: number;
  acceptanceMode: AcceptanceMode;
  paymentMethod?: PaymentMethod;
  deadline: string;
  estimatedMinutes: number;
  status: TaskStatus;
  helperId?: string;
  /** Reward locked once a helper is assigned (may differ from initial ask). */
  agreedRewardCents?: number;
  handoffCode?: string;
  handoffVerified?: boolean;
  /** The helper may still start after the deadline (set when posting or later by the requester). */
  allowLateFinish?: boolean;
  requirements?: string[];
  requiredSkills?: string[];
  expenseCents?: number;
  expenseNote?: string;
  itemDescription?: string;
  instructions?: string;
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  disputedAt?: string;
  disputeReason?: string;
}

export interface Offer {
  id: string;
  taskId: string;
  senderId: string;
  proposedRewardCents: number;
  proposedTime?: string;
  message: string;
  status: OfferStatus;
  createdAt: string;
}

export interface Message {
  id: string;
  taskId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readBy: string[];
}

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId?: string;
  dedupeKey?: string;
  read: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  taskId: string;
  authorId: string;
  subjectId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED";

export interface Report {
  id: string;
  reporterId: string;
  subject: ReportSubject;
  taskId?: string;
  subjectUserId?: string;
  reason: string;
  details?: string;
  status: ReportStatus;
  createdAt: string;
}

/** Simulated ledger entry. Never represents a real money movement. */
export interface DemoPayment {
  id: string;
  taskId: string;
  requesterId: string;
  helperId: string;
  rewardCents: number;
  expenseCents?: number;
  platformFeeCents?: number;
  totalCents?: number;
  paymentMethod?: PaymentMethod;
  stripePaymentIntentId?: string;
  stripeMode?: "live_stripe" | "test_fallback";
  /** Latest PaymentIntent status, e.g. requires_payment_method or requires_capture. */
  stripeStatus?: string;
  state: PaymentState;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export type TaskEventType =
  | "CREATED"
  | "ASSIGNED"
  | "OFFER_ACCEPTED"
  | "STARTED"
  | "HANDOFF_VERIFIED"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED"
  | "OFFERED"
  | "REVIEWED"
  | "LATE_ALLOWED";

export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  actorId: string;
  label: string;
  createdAt: string;
}

export interface DemoState {
  version: number;
  seededAt: string;
  /** Last local mutation, used to reconcile devices. */
  updatedAt: string;
  activeUserId: string;
  onboardingDismissed: boolean;
  users: User[];
  tasks: Task[];
  offers: Offer[];
  messages: Message[];
  notifications: Notification[];
  reviews: Review[];
  reports: Report[];
  payments: DemoPayment[];
  events: TaskEvent[];
}

export interface TaskDraft {
  title: string;
  description: string;
  category: TaskCategory;
  locationId: string;
  dropoffLocationId?: string;
  rewardCents: number;
  acceptanceMode: AcceptanceMode;
  paymentMethod?: PaymentMethod;
  /** ISO string for scheduled tasks, or a relative preset resolved to ISO. */
  deadline: string;
  estimatedMinutes: number;
  requirements?: string;
  requiredSkills?: string[];
  expenseCents?: number;
  expenseNote?: string;
  itemDescription?: string;
  instructions?: string;
  allowLateFinish?: boolean;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
