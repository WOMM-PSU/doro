/**
 * Central demo store.
 *
 * All marketplace rules live here: eligibility, transitions, ownership,
 * negotiation, simulated payments and notifications. UI components only call
 * these methods and re-read the snapshot through useSyncExternalStore.
 */

import type {
  ActionResult,
  DemoPayment,
  DemoState,
  Message,
  Notification,
  Offer,
  Report,
  ReportStatus,
  ReportSubject,
  Review,
  Task,
  TaskDraft,
  TaskEvent,
  TaskStatus,
  User,
  UserPreferences,
} from "@/types";
import { createSeedState } from "@/features/seed";
import { saveState } from "@/lib/persistence";
import { calculateMatch, CATEGORY_LABELS, MATCH_CONFIG } from "@/features/matching";
import { formatMiles, formatMoney } from "@/lib/format";
import { getLocation } from "@/lib/locations";
import { inQuietHours, minutesUntil } from "@/lib/time";
import { detectProhibitedRequest, REPORT_REASONS } from "@/features/moderation";
import { getTask } from "@/features/selectors";

/** The only legal task transitions. Components cannot bypass this table. */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ["ASSIGNED", "CANCELLED", "EXPIRED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_CONFIRMATION", "CANCELLED", "DISPUTED"],
  AWAITING_CONFIRMATION: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  DISPUTED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

const PAYMENT_NOTE = "Demo ledger entry · No real money has been charged or transferred.";
const PAYOUT_NOTE = "Demo payout recorded · No actual transfer occurred.";

function newId(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function handoffCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

function addEvent(
  draft: DemoState,
  taskId: string,
  type: TaskEvent["type"],
  actorId: string,
  label: string,
  now: string,
): void {
  draft.events.push({
    id: newId("e"),
    taskId,
    type,
    actorId,
    label,
    createdAt: now,
  });
}

function addNotification(
  draft: DemoState,
  input: {
    userId: string;
    kind: Notification["kind"];
    title: string;
    body: string;
    taskId?: string;
    dedupeKey?: string;
  },
  now: string,
): void {
  if (
    input.dedupeKey &&
    draft.notifications.some(
      (n) => n.userId === input.userId && n.dedupeKey === input.dedupeKey,
    )
  ) {
    return;
  }
  draft.notifications.unshift({
    id: newId("n"),
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    taskId: input.taskId,
    dedupeKey: input.dedupeKey,
    read: false,
    createdAt: now,
  });
}

function taskParticipants(task: Task): string[] {
  return [task.requesterId, task.helperId].filter((id): id is string => Boolean(id));
}

function notifyCounterpart(
  draft: DemoState,
  task: Task,
  actorId: string,
  input: { kind: Notification["kind"]; title: string; body: string; dedupeKey?: string },
  now: string,
): void {
  for (const userId of taskParticipants(task)) {
    if (userId === actorId) continue;
    addNotification(draft, { ...input, userId, taskId: task.id }, now);
  }
}

function authorizePayment(
  draft: DemoState,
  task: Task,
  now: string,
): void {
  if (draft.payments.some((p) => p.taskId === task.id)) return;
  const rewardCents = task.agreedRewardCents ?? task.rewardCents;
  const expenseCents = task.expenseCents ?? 0;
  const platformFeeCents = 0;
  const totalCents = rewardCents + expenseCents + platformFeeCents;
  const paymentMethod = task.paymentMethod ?? "stripe_card";
  draft.payments.push({
    id: newId("p"),
    taskId: task.id,
    requesterId: task.requesterId,
    helperId: task.helperId ?? "",
    rewardCents,
    expenseCents,
    platformFeeCents,
    totalCents,
    paymentMethod,
    stripePaymentIntentId:
      paymentMethod === "stripe_card"
        ? `pi_doro_${task.id.replace(/[^a-zA-Z0-9]/g, "")}`
        : undefined,
    stripeMode: paymentMethod === "stripe_card" ? "test_fallback" : undefined,
    state: "DEMO_AUTHORIZED",
    createdAt: now,
    updatedAt: now,
    note: PAYMENT_NOTE,
  });
}

function setPaymentState(
  draft: DemoState,
  task: Task,
  state: DemoPayment["state"],
  now: string,
): void {
  const payment = draft.payments.find((p) => p.taskId === task.id);
  if (!payment) return;
  if (payment.state === state) return;
  const rewardCents = task.agreedRewardCents ?? payment.rewardCents;
  const expenseCents = task.expenseCents ?? payment.expenseCents ?? 0;
  payment.state = state;
  payment.updatedAt = now;
  payment.rewardCents = rewardCents;
  payment.expenseCents = expenseCents;
  payment.platformFeeCents = 0;
  payment.totalCents = rewardCents + expenseCents;
  payment.note = state === "DEMO_RELEASED" ? PAYOUT_NOTE : PAYMENT_NOTE;
}

function transition(
  draft: DemoState,
  task: Task,
  next: TaskStatus,
  actorId: string,
  label: string,
  now: string,
): ActionResult {
  if (!canTransition(task.status, next)) {
    return {
      ok: false,
      error: `Cannot move this task from ${task.status} to ${next}.`,
    };
  }
  task.status = next;
  task.updatedAt = now;
  if (next === "COMPLETED") task.completedAt = now;
  if (next === "CANCELLED") task.cancelledAt = now;
  if (next === "DISPUTED") task.disputedAt = now;
  const eventType: TaskEvent["type"] =
    next === "ASSIGNED"
      ? "ASSIGNED"
      : next === "IN_PROGRESS"
        ? "STARTED"
        : next === "AWAITING_CONFIRMATION"
          ? "READY"
          : next === "COMPLETED"
            ? "COMPLETED"
            : next === "CANCELLED"
              ? "CANCELLED"
              : next === "DISPUTED"
                ? "DISPUTED"
                : "CREATED";
  addEvent(draft, task.id, eventType, actorId, label, now);
  return { ok: true, data: undefined };
}

function validateTaskDraft(draft: TaskDraft, now: Date): string | null {
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (title.length < 4) return "Give the task a clear title (at least 4 characters).";
  if (title.length > 90) return "Keep the title under 90 characters.";
  if (description.length < 12) return "Add a short description so helpers know what to do.";
  if (description.length > 1000) return "Keep the description under 1,000 characters.";
  if (!CATEGORY_LABELS[draft.category]) return "Choose a task category.";
  if (!getLocation(draft.locationId)) return "Choose a valid location.";
  if (draft.dropoffLocationId && draft.dropoffLocationId === draft.locationId) {
    return "Pickup and drop-off need to be different locations.";
  }
  if (!Number.isFinite(draft.rewardCents) || draft.rewardCents < 100) {
    return "Set a reward of at least $1.00.";
  }
  if (draft.rewardCents > 100_000) return "This demo supports rewards up to $1,000.";
  if (draft.acceptanceMode !== "fixed" && draft.acceptanceMode !== "offers") {
    return "Choose an acceptance mode.";
  }
  const deadline = new Date(draft.deadline);
  if (Number.isNaN(deadline.getTime())) return "Choose a valid deadline.";
  if (minutesUntil(draft.deadline, now) < 5) return "The deadline needs to be at least 5 minutes away.";
  if (minutesUntil(draft.deadline, now) > 30 * 24 * 60) {
    return "For the demo, choose a deadline within 30 days.";
  }
  if (draft.estimatedMinutes < 5 || draft.estimatedMinutes > 240) {
    return "Estimated duration should be between 5 and 240 minutes.";
  }
  if (draft.expenseCents && draft.expenseCents > 20_000) {
    return "Keep reimbursable expenses under $200 in the demo.";
  }
  const prohibited = detectProhibitedRequest(`${title} ${description} ${draft.requirements ?? ""}`);
  if (prohibited) {
    return `Doro can't support ${prohibited}. See the permitted-task guidance before posting.`;
  }
  return null;
}

export class DemoStore {
  private state: DemoState;
  private listeners = new Set<() => void>();
  private persist: boolean;
  storageAvailable = true;

  constructor(initial: DemoState, options: { persist?: boolean } = {}) {
    this.state = initial;
    this.persist = options.persist ?? true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): DemoState => this.state;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private apply<T>(updater: (draft: DemoState, now: string) => ActionResult<T>): ActionResult<T> {
    const draft = structuredClone(this.state) as DemoState;
    const now = new Date().toISOString();
    const result = updater(draft, now);
    if (!result.ok) return result;
    this.state = draft;
    if (this.persist) {
      this.storageAvailable = saveState(draft);
    }
    this.emit();
    return result;
  }

  private currentUser(draft: DemoState): User {
    return draft.users.find((u) => u.id === draft.activeUserId) ?? draft.users[0];
  }

  setActiveUser(userId: string): ActionResult<User> {
    return this.apply((draft) => {
      const user = draft.users.find((u) => u.id === userId);
      if (!user) return { ok: false, error: "That demo persona no longer exists." };
      draft.activeUserId = user.id;
      return { ok: true, data: user };
    });
  }

  dismissOnboarding(): void {
    this.apply((draft) => {
      draft.onboardingDismissed = true;
      return { ok: true, data: undefined };
    });
  }

  resetDemo(): ActionResult<DemoState> {
    const fresh = createSeedState(new Date());
    this.state = fresh;
    if (this.persist) this.storageAvailable = saveState(fresh);
    this.emit();
    return { ok: true, data: fresh };
  }

  updatePreferences(patch: Partial<UserPreferences>): ActionResult<User> {
    return this.apply((draft) => {
      const user = this.currentUser(draft);
      const next: UserPreferences = { ...user.preferences, ...patch };
      if (!Array.isArray(next.categories) || next.categories.length === 0) {
        return { ok: false, error: "Choose at least one task category." };
      }
      if (!Number.isFinite(next.minRewardCents) || next.minRewardCents < 0 || next.minRewardCents > 10_000) {
        return { ok: false, error: "Minimum reward should be between $0 and $100." };
      }
      if (!Number.isFinite(next.maxDistanceMiles) || next.maxDistanceMiles < 0.5 || next.maxDistanceMiles > 5) {
        return { ok: false, error: "Discovery distance should be between 0.5 and 5 miles." };
      }
      if (!["walk", "bike", "bus", "car"].includes(next.travelMode)) {
        return { ok: false, error: "Choose a valid travel mode." };
      }
      const { startHour, endHour } = next.quietHours;
      if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
        return { ok: false, error: "Quiet hours must be valid hours of the day." };
      }
      if (!Array.isArray(next.preferredLocationIds)) {
        next.preferredLocationIds = [];
      }
      next.skills = (next.skills ?? []).filter((s) => typeof s === "string").slice(0, 12);
      user.preferences = next;
      return { ok: true, data: user };
    });
  }

  createTask(input: TaskDraft): ActionResult<Task> {
    return this.apply((draft, nowIso) => {
      const now = new Date(nowIso);
      const requester = this.currentUser(draft);
      const validationError = validateTaskDraft(input, now);
      if (validationError) return { ok: false, error: validationError };

      const task: Task = {
        id: newId("t"),
        requesterId: requester.id,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        locationId: input.locationId,
        dropoffLocationId: input.dropoffLocationId || undefined,
        rewardCents: Math.round(input.rewardCents),
        acceptanceMode: input.acceptanceMode,
        paymentMethod: input.paymentMethod ?? "stripe_card",
        deadline: input.deadline,
        estimatedMinutes: Math.round(input.estimatedMinutes),
        status: "OPEN",
        requirements: input.requirements
          ? input.requirements.split("\n").map((r) => r.trim()).filter(Boolean)
          : undefined,
        requiredSkills: input.requiredSkills?.length ? input.requiredSkills : undefined,
        expenseCents: input.expenseCents || undefined,
        expenseNote: input.expenseNote?.trim() || undefined,
        itemDescription: input.itemDescription?.trim() || undefined,
        instructions: input.instructions?.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.tasks.push(task);
      addEvent(draft, task.id, "CREATED", requester.id, "Task posted", nowIso);

      // Personalized match notifications: eligibility + explicit preference
      // rules + quiet hours, with one notification per helper and task.
      for (const helper of draft.users) {
        if (helper.id === requester.id) continue;
        if (helper.role === "requester") continue;
        if (!helper.preferences.notifyMatches) continue;
        if (task.rewardCents < helper.preferences.minRewardCents) continue;
        if (
          inQuietHours(
            now.getHours(),
            helper.preferences.quietHours.startHour,
            helper.preferences.quietHours.endHour,
          )
        ) {
          continue;
        }
        const completedBefore = draft.tasks.some(
          (t) =>
            t.id !== task.id &&
            t.helperId === helper.id &&
            t.requesterId === requester.id &&
            t.status === "COMPLETED",
        );
        const match = calculateMatch(
          task,
          helper,
          { now },
          { completedForRequester: completedBefore },
        );
        if (!match.eligible || match.score < MATCH_CONFIG.notificationThreshold) continue;
        addNotification(
          draft,
          {
            userId: helper.id,
            kind: "MATCH",
            title: "A task you might like",
            body: `${task.title} · ${formatMoney(task.rewardCents)} · ${formatMiles(
              match.routeMiles,
            )} away`,
            taskId: task.id,
            dedupeKey: `match:${task.id}:${helper.id}`,
          },
          nowIso,
        );
      }

      return { ok: true, data: task };
    });
  }

  acceptTask(taskId: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const helper = this.currentUser(draft);
      if (task.requesterId === helper.id) {
        return { ok: false, error: "You can't accept your own task." };
      }
      if (task.status !== "OPEN") {
        return { ok: false, error: "This task is no longer available." };
      }
      if (task.helperId) return { ok: false, error: "Another helper already claimed this task." };
      if (minutesUntil(task.deadline) <= 0) {
        return { ok: false, error: "The deadline for this task has passed." };
      }
      if (task.acceptanceMode !== "fixed") {
        return { ok: false, error: "This task is open to offers — propose a reward instead." };
      }

      task.helperId = helper.id;
      task.agreedRewardCents = task.rewardCents;
      task.handoffCode = handoffCode();
      const moved = transition(
        draft,
        task,
        "ASSIGNED",
        helper.id,
        `${helper.name} accepted for ${formatMoney(task.agreedRewardCents)}`,
        now,
      );
      if (!moved.ok) return moved;
      authorizePayment(draft, task, now);
      addNotification(
        draft,
        {
          userId: task.requesterId,
          kind: "TASK_ACCEPTED",
          title: `${helper.name} accepted your task`,
          body: `${task.title} · ${formatMoney(task.agreedRewardCents)} agreed.`,
          taskId: task.id,
          dedupeKey: `accepted:${task.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  makeOffer(
    taskId: string,
    proposedRewardCents: number,
    message: string,
    proposedTime?: string,
  ): ActionResult<Offer> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const sender = this.currentUser(draft);
      if (task.requesterId === sender.id) {
        return { ok: false, error: "You can't make an offer on your own task." };
      }
      if (task.status !== "OPEN") return { ok: false, error: "This task is no longer open." };
      if (task.acceptanceMode !== "offers") {
        return { ok: false, error: "This task has a fixed reward." };
      }
      if (minutesUntil(task.deadline) <= 0) {
        return { ok: false, error: "The deadline for this task has passed." };
      }
      if (!Number.isFinite(proposedRewardCents) || proposedRewardCents < 100) {
        return { ok: false, error: "Offer at least $1.00." };
      }
      if (proposedRewardCents > 100_000) {
        return { ok: false, error: "This demo supports offers up to $1,000." };
      }
      if (message.trim().length > 500) {
        return { ok: false, error: "Keep the offer message under 500 characters." };
      }
      if (proposedTime) {
        const when = new Date(proposedTime);
        if (Number.isNaN(when.getTime()) || minutesUntil(proposedTime) < 5) {
          return { ok: false, error: "The proposed time needs to be in the future." };
        }
        if (minutesUntil(proposedTime) > 30 * 24 * 60) {
          return { ok: false, error: "Choose a proposed time within 30 days." };
        }
      }

      for (const offer of draft.offers) {
        if (offer.taskId === task.id && offer.senderId === sender.id && offer.status === "PENDING") {
          offer.status = "SUPERSEDED";
        }
      }

      const offer: Offer = {
        id: newId("o"),
        taskId: task.id,
        senderId: sender.id,
        proposedRewardCents: Math.round(proposedRewardCents),
        proposedTime: proposedTime || undefined,
        message: message.trim(),
        status: "PENDING",
        createdAt: now,
      };
      draft.offers.push(offer);
      addEvent(
        draft,
        task.id,
        "OFFERED",
        sender.id,
        `${sender.name} proposed ${formatMoney(offer.proposedRewardCents)}`,
        now,
      );
      addNotification(
        draft,
        {
          userId: task.requesterId,
          kind: "OFFER_RECEIVED",
          title: `${sender.name} made an offer`,
          body: `${task.title} · ${formatMoney(offer.proposedRewardCents)} proposed.`,
          taskId: task.id,
          dedupeKey: `offer:${offer.id}`,
        },
        now,
      );
      return { ok: true, data: offer };
    });
  }

  acceptOffer(offerId: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const offer = draft.offers.find((o) => o.id === offerId);
      if (!offer) return { ok: false, error: "Offer not found." };
      const task = getTask(draft, offer.taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const requester = this.currentUser(draft);
      if (task.requesterId !== requester.id) {
        return { ok: false, error: "Only the requester can accept offers." };
      }
      if (offer.status !== "PENDING") return { ok: false, error: "This offer is no longer pending." };
      if (task.status !== "OPEN") return { ok: false, error: "This task is already assigned or closed." };
      if (offer.senderId === task.requesterId) {
        return { ok: false, error: "You can't accept your own offer." };
      }
      if (minutesUntil(task.deadline) <= 0) {
        return { ok: false, error: "The deadline for this task has passed." };
      }
      if (offer.proposedTime) {
        if (minutesUntil(offer.proposedTime) < 5) {
          return { ok: false, error: "The proposed time has already passed." };
        }
        task.deadline = offer.proposedTime;
      }

      offer.status = "ACCEPTED";
      task.helperId = offer.senderId;
      task.agreedRewardCents = offer.proposedRewardCents;
      task.handoffCode = handoffCode();
      const helperName =
        draft.users.find((u) => u.id === offer.senderId)?.name ?? "The helper";
      const moved = transition(
        draft,
        task,
        "ASSIGNED",
        requester.id,
        `Offer accepted at ${formatMoney(offer.proposedRewardCents)}`,
        now,
      );
      if (!moved.ok) return moved;
      authorizePayment(draft, task, now);

      for (const other of draft.offers) {
        if (other.id === offer.id || other.taskId !== task.id || other.status !== "PENDING") {
          continue;
        }
        other.status = "SUPERSEDED";
        addNotification(
          draft,
          {
            userId: other.senderId,
            kind: "OFFER_REJECTED",
            title: "A task you offered on was filled",
            body: `${task.title} was assigned to ${helperName}.`,
            taskId: task.id,
            dedupeKey: `offer-filled:${other.id}`,
          },
          now,
        );
      }

      addNotification(
        draft,
        {
          userId: offer.senderId,
          kind: "OFFER_ACCEPTED",
          title: "Your offer was accepted",
          body: `${task.title} · ${formatMoney(offer.proposedRewardCents)} agreed.`,
          taskId: task.id,
          dedupeKey: `offer-accepted:${offer.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  rejectOffer(offerId: string): ActionResult<Offer> {
    return this.apply((draft, now) => {
      const offer = draft.offers.find((o) => o.id === offerId);
      if (!offer) return { ok: false, error: "Offer not found." };
      const task = getTask(draft, offer.taskId);
      if (!task) return { ok: false, error: "Task not found." };
      if (task.requesterId !== this.currentUser(draft).id) {
        return { ok: false, error: "Only the requester can decline offers." };
      }
      if (offer.status !== "PENDING") return { ok: false, error: "This offer is no longer pending." };
      offer.status = "REJECTED";
      addNotification(
        draft,
        {
          userId: offer.senderId,
          kind: "OFFER_REJECTED",
          title: "Your offer was declined",
          body: `${task.title} is still open if you'd like to propose another reward.`,
          taskId: task.id,
          dedupeKey: `offer-rejected:${offer.id}`,
        },
        now,
      );
      return { ok: true, data: offer };
    });
  }

  withdrawOffer(offerId: string): ActionResult<Offer> {
    return this.apply((draft) => {
      const offer = draft.offers.find((o) => o.id === offerId);
      if (!offer) return { ok: false, error: "Offer not found." };
      if (offer.senderId !== this.currentUser(draft).id) {
        return { ok: false, error: "You can only withdraw your own offer." };
      }
      if (offer.status !== "PENDING") return { ok: false, error: "This offer is no longer pending." };
      offer.status = "WITHDRAWN";
      return { ok: true, data: offer };
    });
  }

  startTask(taskId: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.helperId !== user.id) return { ok: false, error: "Only the assigned helper can start this task." };
      if (task.status !== "ASSIGNED") return { ok: false, error: "This task isn't ready to start." };
      if (minutesUntil(task.deadline) <= 0) {
        return { ok: false, error: "The deadline has passed; contact the requester before continuing." };
      }
      const moved = transition(draft, task, "IN_PROGRESS", user.id, "Work started", now);
      if (!moved.ok) return moved;
      addNotification(
        draft,
        {
          userId: task.requesterId,
          kind: "SYSTEM",
          title: `${user.name} started your task`,
          body: `${task.title} is now in progress.`,
          taskId: task.id,
          dedupeKey: `started:${task.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  verifyHandoff(taskId: string, code: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.helperId !== user.id) return { ok: false, error: "Only the assigned helper can verify a handoff." };
      if (task.status !== "IN_PROGRESS") return { ok: false, error: "Start the task before verifying a handoff." };
      if (!task.handoffCode) return { ok: false, error: "This task doesn't need a handoff code." };
      if (task.handoffVerified) return { ok: false, error: "This handoff is already verified." };
      if (code.trim() !== task.handoffCode) {
        return { ok: false, error: "That code doesn't match this task. Ask the requester to confirm it." };
      }
      task.handoffVerified = true;
      task.updatedAt = now;
      addEvent(draft, task.id, "HANDOFF_VERIFIED", user.id, "Handoff code confirmed", now);
      addNotification(
        draft,
        {
          userId: task.requesterId,
          kind: "SYSTEM",
          title: "Handoff code confirmed",
          body: `${user.name} confirmed the handoff for ${task.title}.`,
          taskId: task.id,
          dedupeKey: `handoff:${task.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  markTaskReady(taskId: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.helperId !== user.id) return { ok: false, error: "Only the assigned helper can mark this ready." };
      if (task.status !== "IN_PROGRESS") {
        return { ok: false, error: "Start the task before marking it ready." };
      }
      if (task.handoffCode && !task.handoffVerified) {
        return { ok: false, error: "Confirm the four-digit handoff code with the requester first." };
      }
      const moved = transition(
        draft,
        task,
        "AWAITING_CONFIRMATION",
        user.id,
        "Marked ready for confirmation",
        now,
      );
      if (!moved.ok) return moved;
      addNotification(
        draft,
        {
          userId: task.requesterId,
          kind: "TASK_READY",
          title: `${user.name} marked a task ready`,
          body: `${task.title} is waiting for your confirmation.`,
          taskId: task.id,
          dedupeKey: `ready:${task.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  confirmTaskCompletion(taskId: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.requesterId !== user.id) {
        return { ok: false, error: "Only the requester can confirm completion." };
      }
      if (task.status !== "AWAITING_CONFIRMATION") {
        return { ok: false, error: "This task isn't awaiting confirmation." };
      }
      if (!task.helperId) return { ok: false, error: "This task has no assigned helper." };
      if (draft.payments.some((p) => p.taskId === task.id && p.state === "DEMO_RELEASED")) {
        return { ok: false, error: "This task has already been completed." };
      }
      const reward = task.agreedRewardCents ?? task.rewardCents;
      const moved = transition(
        draft,
        task,
        "COMPLETED",
        user.id,
        `Completed · ${formatMoney(reward)} agreed`,
        now,
      );
      if (!moved.ok) return moved;
      setPaymentState(draft, task, "DEMO_RELEASED", now);
      addNotification(
        draft,
        {
          userId: task.helperId,
          kind: "PAYMENT",
          title: `${user.name} confirmed completion`,
          body: `${task.title} · ${formatMoney(reward)} demo payout recorded. No actual transfer occurred.`,
          taskId: task.id,
          dedupeKey: `completed:${task.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  cancelTask(taskId: string, reason: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.requesterId !== user.id) {
        return { ok: false, error: "Only the requester can cancel this task." };
      }
      if (!["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(task.status)) {
        return { ok: false, error: "This task can't be cancelled at this stage." };
      }
      if (reason.trim().length < 3) return { ok: false, error: "Add a short reason for cancelling." };
      if (reason.trim().length > 240) return { ok: false, error: "Keep the reason under 240 characters." };

      const helperId = task.helperId;
      const moved = transition(draft, task, "CANCELLED", user.id, "Cancelled by the requester", now);
      if (!moved.ok) return moved;
      task.cancelReason = reason.trim();
      if (task.status === "CANCELLED") setPaymentState(draft, task, "DEMO_REFUNDED", now);

      for (const offer of draft.offers) {
        if (offer.taskId !== task.id || offer.status !== "PENDING") continue;
        offer.status = "SUPERSEDED";
        addNotification(
          draft,
          {
            userId: offer.senderId,
            kind: "TASK_CANCELLED",
            title: "A task you offered on was cancelled",
            body: `${task.title} was cancelled by the requester.`,
            taskId: task.id,
            dedupeKey: `cancelled-offer:${offer.id}`,
          },
          now,
        );
      }
      if (helperId) {
        addNotification(
          draft,
          {
            userId: helperId,
            kind: "TASK_CANCELLED",
            title: "A task was cancelled",
            body: `${task.title} was cancelled by the requester.${task.cancelReason ? ` Reason: ${task.cancelReason}` : ""}`,
            taskId: task.id,
            dedupeKey: `cancelled:${task.id}`,
          },
          now,
        );
      }
      return { ok: true, data: task };
    });
  }

  reportTaskProblem(taskId: string, reason: string): ActionResult<Task> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.requesterId !== user.id && task.helperId !== user.id) {
        return { ok: false, error: "Only the people on this task can report a problem." };
      }
      if (!["IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(task.status)) {
        return { ok: false, error: "Problems can be reported while work is in progress or awaiting confirmation." };
      }
      if (reason.trim().length < 5) return { ok: false, error: "Describe the problem in a little more detail." };
      if (reason.trim().length > 500) return { ok: false, error: "Keep the problem description under 500 characters." };
      const moved = transition(draft, task, "DISPUTED", user.id, "Problem reported", now);
      if (!moved.ok) return moved;
      task.disputeReason = reason.trim();
      setPaymentState(draft, task, "DEMO_DISPUTED", now);
      notifyCounterpart(
        draft,
        task,
        user.id,
        {
          kind: "SYSTEM",
          title: "A problem was reported",
          body: `${task.title} is paused while both parties review it.`,
          dedupeKey: `dispute:${task.id}`,
        },
        now,
      );
      return { ok: true, data: task };
    });
  }

  sendMessage(taskId: string, body: string): ActionResult<Message> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      const isParticipant = task.requesterId === user.id || task.helperId === user.id;
      if (!isParticipant) return { ok: false, error: "Only the people on this task can message each other." };
      if (!task.helperId) return { ok: false, error: "Messaging opens once a helper accepts." };
      if (!["ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(task.status)) {
        return { ok: false, error: "This conversation is closed." };
      }
      const trimmed = body.trim();
      if (!trimmed) return { ok: false, error: "Write a message first." };
      if (trimmed.length > 1000) return { ok: false, error: "Keep messages under 1,000 characters." };
      const message: Message = {
        id: newId("m"),
        taskId,
        senderId: user.id,
        body: trimmed,
        createdAt: now,
        readBy: [user.id],
      };
      draft.messages.push(message);
      const recipient = task.requesterId === user.id ? task.helperId : task.requesterId;
      if (recipient) {
        addNotification(
          draft,
          {
            userId: recipient,
            kind: "MESSAGE",
            title: `New message from ${user.name}`,
            body: trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed,
            taskId,
            dedupeKey: `message:${message.id}`,
          },
          now,
        );
      }
      return { ok: true, data: message };
    });
  }

  markNotificationRead(notificationId: string): void {
    this.apply((draft) => {
      const notification = draft.notifications.find(
        (n) => n.id === notificationId && n.userId === draft.activeUserId,
      );
      if (notification && !notification.read) {
        notification.read = true;
        return { ok: true, data: undefined };
      }
      return { ok: false, error: "Notification not found." };
    });
  }

  markAllNotificationsRead(): void {
    this.apply((draft) => {
      for (const n of draft.notifications) {
        if (n.userId === draft.activeUserId) n.read = true;
      }
      return { ok: true, data: undefined };
    });
  }

  markConversationRead(taskId: string): void {
    this.apply((draft) => {
      const user = this.currentUser(draft);
      for (const message of draft.messages) {
        if (message.taskId === taskId && !message.readBy.includes(user.id)) {
          message.readBy.push(user.id);
        }
      }
      return { ok: true, data: undefined };
    });
  }

  submitReview(taskId: string, rating: number, comment: string): ActionResult<Review> {
    return this.apply((draft, now) => {
      const task = getTask(draft, taskId);
      if (!task) return { ok: false, error: "Task not found." };
      const user = this.currentUser(draft);
      if (task.status !== "COMPLETED") return { ok: false, error: "Reviews open after a task is completed." };
      if (task.requesterId !== user.id && task.helperId !== user.id) {
        return { ok: false, error: "Only the people on this task can leave a review." };
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { ok: false, error: "Choose a rating from 1 to 5." };
      }
      if (draft.reviews.some((r) => r.taskId === taskId && r.authorId === user.id)) {
        return { ok: false, error: "You already reviewed this task." };
      }
      if (comment.trim().length > 500) return { ok: false, error: "Keep the review under 500 characters." };
      const subjectId = task.requesterId === user.id ? task.helperId : task.requesterId;
      if (!subjectId) return { ok: false, error: "There's nobody to review on this task." };
      const review: Review = {
        id: newId("r"),
        taskId,
        authorId: user.id,
        subjectId,
        rating,
        comment: comment.trim(),
        createdAt: now,
      };
      draft.reviews.push(review);
      addEvent(draft, taskId, "REVIEWED", user.id, `${rating}-star review left`, now);
      addNotification(
        draft,
        {
          userId: subjectId,
          kind: "SYSTEM",
          title: `${user.name} left you a ${rating}-star review`,
          body: comment.trim() || `${task.title} · completed.`,
          taskId,
          dedupeKey: `review:${taskId}:${user.id}`,
        },
        now,
      );
      return { ok: true, data: review };
    });
  }

  submitReport(input: {
    subject: ReportSubject;
    reason: string;
    details?: string;
    taskId?: string;
    subjectUserId?: string;
  }): ActionResult<Report> {
    return this.apply((draft, now) => {
      const user = this.currentUser(draft);
      if (!REPORT_REASONS.includes(input.reason as (typeof REPORT_REASONS)[number])) {
        return { ok: false, error: "Choose a report reason." };
      }
      if (input.details && input.details.length > 500) {
        return { ok: false, error: "Keep the details under 500 characters." };
      }
      if (input.taskId && !getTask(draft, input.taskId)) {
        return { ok: false, error: "That task no longer exists." };
      }
      const duplicate = draft.reports.find(
        (r) =>
          r.reporterId === user.id &&
          r.taskId === input.taskId &&
          r.reason === input.reason &&
          new Date(now).getTime() - new Date(r.createdAt).getTime() < 10 * 60_000,
      );
      if (duplicate) {
        return { ok: false, error: "You already submitted this report a moment ago." };
      }
      const report: Report = {
        id: newId("rep"),
        reporterId: user.id,
        subject: input.subject,
        taskId: input.taskId,
        subjectUserId: input.subjectUserId,
        reason: input.reason,
        details: input.details?.trim() || undefined,
        status: "OPEN",
        createdAt: now,
      };
      draft.reports.push(report);
      return { ok: true, data: report };
    });
  }

  resolveReport(reportId: string, status: ReportStatus = "REVIEWED"): ActionResult<Report> {
    return this.apply((draft) => {
      if (draft.activeUserId !== "u-maya" && draft.activeUserId !== "u-jordan") {
        return { ok: false, error: "Moderation tools are limited to demo moderators (Maya and Jordan)." };
      }
      const report = draft.reports.find((r) => r.id === reportId);
      if (!report) return { ok: false, error: "Report not found." };
      report.status = status;
      return { ok: true, data: report };
    });
  }

  attachStripePaymentIntent(
    taskId: string,
    paymentIntentId: string,
    mode: "live_stripe" | "test_fallback" = "test_fallback",
  ): ActionResult<DemoPayment> {
    return this.apply((draft, now) => {
      const payment = draft.payments.find((p) => p.taskId === taskId);
      if (!payment) return { ok: false, error: "Payment record not found." };
      payment.stripePaymentIntentId = paymentIntentId;
      payment.stripeMode = mode;
      payment.updatedAt = now;
      return { ok: true, data: payment };
    });
  }
}
