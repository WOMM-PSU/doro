/** Read-only derivations over DemoState. UI components use these, never raw scans. */

import type {
  DemoPayment,
  DemoState,
  Message,
  Notification,
  Offer,
  Review,
  Task,
  TaskCategory,
  TaskEvent,
  TaskStatus,
  User,
} from "@/types";
import { CATEGORY_LABELS, calculateMatch, compareMatches, type MatchResult } from "@/features/matching";
import { getLocation, locationName, locationShort } from "@/lib/locations";
import { minutesUntil } from "@/lib/time";

export type DiscoverMode = "foryou" | "nearby" | "reward" | "urgent";

export interface DiscoverFilters {
  mode: DiscoverMode;
  search: string;
  category: TaskCategory | "all";
  minRewardCents: number;
  maxDistanceMiles: number;
}

export interface RankedTask {
  task: Task;
  match: MatchResult;
  distanceMiles: number;
  travelMinutes: number;
  effectiveHourlyCents: number;
  minutesLeft: number;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  mode: "foryou",
  search: "",
  category: "all",
  minRewardCents: 0,
  maxDistanceMiles: 3,
};

export function getUser(state: DemoState, userId: string): User | undefined {
  return state.users.find((u) => u.id === userId);
}

export function activeUser(state: DemoState): User {
  return getUser(state, state.activeUserId) ?? state.users[0];
}

export function getTask(state: DemoState, taskId: string | undefined): Task | undefined {
  if (!taskId) return undefined;
  return state.tasks.find((t) => t.id === taskId);
}

export function effectiveStatus(task: Task, now: Date = new Date()): TaskStatus {
  if (
    (task.status === "OPEN" || task.status === "ASSIGNED") &&
    minutesUntil(task.deadline, now) <= 0
  ) {
    return "EXPIRED";
  }
  return task.status;
}

export function isTaskActive(task: Task, now: Date = new Date()): boolean {
  const status = effectiveStatus(task, now);
  return status === "OPEN" || status === "ASSIGNED" || status === "IN_PROGRESS" || status === "AWAITING_CONFIRMATION";
}

export function hasCompletedForRequester(
  state: DemoState,
  helperId: string,
  requesterId: string,
): boolean {
  return state.tasks.some(
    (t) => t.helperId === helperId && t.requesterId === requesterId && t.status === "COMPLETED",
  );
}

function taskMatchesSearch(state: DemoState, task: Task, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    task.title,
    task.description,
    CATEGORY_LABELS[task.category],
    task.category,
    locationName(task.locationId),
    task.dropoffLocationId ? locationName(task.dropoffLocationId) : "",
    getUser(state, task.requesterId)?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Ranked, filtered, eligible tasks for a helper. Excludes the viewer's own
 * posts, closed tasks, expired tasks, and routes beyond the helper's radius.
 */
export function getDiscoverTasks(
  state: DemoState,
  helper: User,
  filters: DiscoverFilters,
  now: Date = new Date(),
): RankedTask[] {
  const ranked: RankedTask[] = [];

  for (const task of state.tasks) {
    if (task.requesterId === helper.id) continue;
    if (task.status !== "OPEN") continue;
    const completedBefore = hasCompletedForRequester(state, helper.id, task.requesterId);
    const match = calculateMatch(task, helper, { now }, { completedForRequester: completedBefore });
    if (!match.eligible) continue;
    if (match.routeMiles > filters.maxDistanceMiles) continue;
    if (!taskMatchesSearch(state, task, filters.search)) continue;
    if (filters.category !== "all" && task.category !== filters.category) continue;
    if (task.rewardCents < filters.minRewardCents) continue;
    ranked.push({
      task,
      match,
      distanceMiles: match.routeMiles,
      travelMinutes: match.travelMinutes,
      effectiveHourlyCents: match.effectiveHourlyCents,
      minutesLeft: minutesUntil(task.deadline, now),
    });
  }

  const byId = (a: RankedTask, b: RankedTask) => a.task.id.localeCompare(b.task.id);

  switch (filters.mode) {
    case "nearby":
      ranked.sort(
        (a, b) =>
          a.distanceMiles - b.distanceMiles ||
          b.match.score - a.match.score ||
          byId(a, b),
      );
      break;
    case "reward":
      ranked.sort((a, b) => {
        const aSafe = Math.min(a.effectiveHourlyCents, 4000);
        const bSafe = Math.min(b.effectiveHourlyCents, 4000);
        return bSafe - aSafe || b.task.rewardCents - a.task.rewardCents || byId(a, b);
      });
      break;
    case "urgent": {
      const urgent = ranked
        .filter((r) => r.minutesLeft > 0 && r.minutesLeft <= 24 * 60)
        .sort((a, b) => a.minutesLeft - b.minutesLeft || byId(a, b));
      ranked.length = 0;
      ranked.push(...urgent);
      break;
    }
    case "foryou":
    default:
      ranked.sort((a, b) => compareMatches(a, b) || byId(a, b));
  }

  return ranked;
}

export interface UserStats {
  completedAsHelper: number;
  posted: number;
  activePosted: number;
  activeAccepted: number;
  rating: number | null;
  ratingCount: number;
  completionRate: number | null;
  reviews: Review[];
  cancelled: number;
  disputed: number;
  isNew: boolean;
}

export function getUserStats(state: DemoState, user: User): UserStats {
  const completedLive = state.tasks.filter(
    (t) => t.helperId === user.id && t.status === "COMPLETED",
  ).length;
  const disputedLive = state.tasks.filter(
    (t) => t.helperId === user.id && t.status === "DISPUTED",
  ).length;
  const posted = state.tasks.filter((t) => t.requesterId === user.id).length;
  const activePosted = state.tasks.filter(
    (t) =>
      t.requesterId === user.id &&
      ["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(t.status),
  ).length;
  const activeAccepted = state.tasks.filter(
    (t) =>
      t.helperId === user.id &&
      ["ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(t.status),
  ).length;

  const liveReviews = state.reviews.filter((r) => r.subjectId === user.id);
  const ratingCount = user.history.ratingCount + liveReviews.length;
  const ratingSum =
    user.history.ratingSum + liveReviews.reduce((sum, r) => sum + r.rating, 0);
  const rating = ratingCount > 0 ? ratingSum / ratingCount : null;

  const completed = user.history.completed + completedLive;
  const cancelled = user.history.cancelled;
  const disputed = user.history.disputed + disputedLive;
  const denominator = completed + cancelled + disputed;
  const completionRate = denominator > 0 ? completed / denominator : null;

  return {
    completedAsHelper: completed,
    posted,
    activePosted,
    activeAccepted,
    rating,
    ratingCount,
    completionRate,
    reviews: liveReviews.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    cancelled,
    disputed,
    isNew: completed < 3,
  };
}

export function getOffersForTask(state: DemoState, taskId: string): Offer[] {
  return state.offers
    .filter((o) => o.taskId === taskId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getPendingOffers(state: DemoState, taskId: string): Offer[] {
  return getOffersForTask(state, taskId).filter((o) => o.status === "PENDING");
}

export function getPendingOfferBy(
  state: DemoState,
  taskId: string,
  senderId: string,
): Offer | undefined {
  return state.offers.find(
    (o) => o.taskId === taskId && o.senderId === senderId && o.status === "PENDING",
  );
}

export function getMessages(state: DemoState, taskId: string): Message[] {
  return state.messages
    .filter((m) => m.taskId === taskId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getNotifications(state: DemoState, userId: string): Notification[] {
  return state.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function unreadCount(state: DemoState, userId: string): number {
  return state.notifications.filter((n) => n.userId === userId && !n.read).length;
}

export function getPayment(state: DemoState, taskId: string): DemoPayment | undefined {
  return state.payments.find((p) => p.taskId === taskId);
}

export function getEvents(state: DemoState, taskId: string): TaskEvent[] {
  return state.events
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getReviewBy(
  state: DemoState,
  taskId: string,
  authorId: string,
): Review | undefined {
  return state.reviews.find((r) => r.taskId === taskId && r.authorId === authorId);
}

export function getReviewsForTask(state: DemoState, taskId: string): Review[] {
  return state.reviews.filter((r) => r.taskId === taskId);
}

export function getPaymentHistory(state: DemoState, userId: string): DemoPayment[] {
  return state.payments
    .filter((p) => p.requesterId === userId || p.helperId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function canAcceptTask(task: Task, user: User, now: Date = new Date()): boolean {
  return (
    task.status === "OPEN" &&
    task.requesterId !== user.id &&
    !task.helperId &&
    minutesUntil(task.deadline, now) > 0
  );
}

export function canStartTask(task: Task, user: User): boolean {
  return task.status === "ASSIGNED" && task.helperId === user.id;
}

export function canVerifyHandoff(task: Task, user: User): boolean {
  return (
    task.status === "IN_PROGRESS" &&
    task.helperId === user.id &&
    Boolean(task.handoffCode) &&
    !task.handoffVerified
  );
}

export function canMarkReady(task: Task, user: User): boolean {
  if (task.status !== "IN_PROGRESS" || task.helperId !== user.id) return false;
  if (task.handoffCode && !task.handoffVerified) return false;
  return true;
}

export function canConfirmCompletion(task: Task, user: User): boolean {
  return task.status === "AWAITING_CONFIRMATION" && task.requesterId === user.id;
}

export function canMessageTask(task: Task, user: User): boolean {
  return (
    Boolean(task.helperId) &&
    (task.requesterId === user.id || task.helperId === user.id) &&
    ["ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(task.status)
  );
}

export function canMakeOffer(task: Task, user: User, now: Date = new Date()): boolean {
  return (
    task.status === "OPEN" &&
    task.acceptanceMode === "offers" &&
    task.requesterId !== user.id &&
    minutesUntil(task.deadline, now) > 0
  );
}

export function canReviewTask(
  state: DemoState,
  task: Task,
  user: User,
): boolean {
  if (task.status !== "COMPLETED") return false;
  if (task.requesterId !== user.id && task.helperId !== user.id) return false;
  return !getReviewBy(state, task.id, user.id);
}

export function canCancelTask(task: Task, user: User): boolean {
  return (
    task.requesterId === user.id &&
    ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(task.status)
  );
}

export function canReportDispute(task: Task, user: User): boolean {
  return (
    ["IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(task.status) &&
    (task.requesterId === user.id || task.helperId === user.id)
  );
}

export function taskCategoryLabel(category: TaskCategory): string {
  return CATEGORY_LABELS[category];
}

export function taskLocationLabel(task: Task): string {
  if (task.dropoffLocationId) {
    return `${locationShort(task.locationId)} → ${locationShort(task.dropoffLocationId)}`;
  }
  return getLocation(task.locationId).name;
}

export function getCounterpart(task: Task, user: User): string | undefined {
  if (task.requesterId === user.id) return task.helperId;
  if (task.helperId === user.id) return task.requesterId;
  return undefined;
}

/** Tasks that need the active user's attention, ordered by urgency. */
export function getNeedsAction(state: DemoState, user: User, now: Date = new Date()): Task[] {
  return state.tasks
    .filter((task) => {
      const participant = task.requesterId === user.id || task.helperId === user.id;
      if (task.status === "DISPUTED" && participant) return true;
      if (task.requesterId === user.id) {
        return (
          (task.status === "OPEN" && getPendingOffers(state, task.id).length > 0) ||
          task.status === "AWAITING_CONFIRMATION" ||
          (task.status === "OPEN" && minutesUntil(task.deadline, now) <= 240 && minutesUntil(task.deadline, now) > 0)
        );
      }
      if (task.helperId === user.id) {
        return (
          task.status === "ASSIGNED" ||
          task.status === "IN_PROGRESS" ||
          task.status === "AWAITING_CONFIRMATION"
        );
      }
      return false;
    })
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
}

export function nextActivityHint(state: DemoState, task: Task, user: User): string {
  if (task.status === "DISPUTED") return "Problem reported — review the task";
  if (task.requesterId === user.id) {
    switch (task.status) {
      case "OPEN": {
        const offers = getPendingOffers(state, task.id).length;
        return offers > 0 ? `${offers} offer${offers === 1 ? "" : "s"} to review` : "Waiting for a helper";
      }
      case "ASSIGNED":
        return "Helper assigned — waiting to start";
      case "IN_PROGRESS":
        return "Helper is working on it";
      case "AWAITING_CONFIRMATION":
        return "Confirm completion";
      case "COMPLETED":
        return getReviewBy(state, task.id, user.id) ? "Completed" : "Leave a review";
      default:
        return "Closed";
    }
  }
  switch (task.status) {
    case "ASSIGNED":
      return "Start the task";
    case "IN_PROGRESS":
      return task.handoffCode && !task.handoffVerified ? "Verify handoff" : "Mark ready";
    case "AWAITING_CONFIRMATION":
      return "Waiting for requester";
    case "COMPLETED":
      return getReviewBy(state, task.id, user.id) ? "Completed" : "Leave a review";
    default:
      return "View task";
  }
}
