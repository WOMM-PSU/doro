/**
 * Versioned localStorage adapter for the demo. Every entry point is guarded:
 * missing, unreadable, malformed, or outdated data falls back to a fresh seed
 * rather than blocking the app.
 */

import type { DemoState, Task, User } from "@/types";
import { CURRENT_STATE_VERSION, createSeedState } from "@/features/seed";

export const STORAGE_KEY = "doro.demo.state";
export const RESEED_AFTER_HOURS = 24;

export interface LoadResult {
  state: DemoState;
  source: "storage" | "seed" | "refreshed";
  notice?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsableUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.homeLocationId === "string" &&
    isRecord(value.preferences) &&
    Array.isArray((value.preferences as Record<string, unknown>).categories)
  );
}

function isUsableTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.requesterId === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string" &&
    typeof value.deadline === "string" &&
    typeof value.rewardCents === "number"
  );
}

function sanitize(raw: unknown): DemoState | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== CURRENT_STATE_VERSION) return null;
  const arrays = [
    "tasks",
    "offers",
    "messages",
    "notifications",
    "reviews",
    "reports",
    "payments",
    "events",
  ] as const;
  if (!Array.isArray(raw.users) || !isRecord(raw.users[0])) return null;
  for (const key of arrays) {
    if (!Array.isArray(raw[key])) return null;
  }
  const users = raw.users.filter(isUsableUser);
  if (users.length === 0) return null;
  const tasks = (raw.tasks as unknown[]).filter(isUsableTask);
  const activeUserId =
    typeof raw.activeUserId === "string" && users.some((u) => u.id === raw.activeUserId)
      ? raw.activeUserId
      : users[0].id;

  return {
    ...(raw as unknown as DemoState),
    users,
    tasks,
    activeUserId,
    version: CURRENT_STATE_VERSION,
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : new Date().toISOString(),
    onboardingDismissed: raw.onboardingDismissed === true,
  };
}

export function loadState(now: Date = new Date()): LoadResult {
  if (typeof window === "undefined") {
    return { state: createSeedState(now), source: "seed" };
  }
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { state: createSeedState(now), source: "seed", notice: "Local storage is unavailable; using in-memory demo data." };
  }
  if (!stored) {
    return { state: createSeedState(now), source: "seed" };
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    const state = sanitize(parsed);
    if (!state) {
      return {
        state: createSeedState(now),
        source: "seed",
        notice: "Saved demo data was outdated, so we restored the sample data.",
      };
    }
    const ageHours = (now.getTime() - new Date(state.seededAt).getTime()) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours > RESEED_AFTER_HOURS) {
      return {
        state: createSeedState(now),
        source: "refreshed",
        notice: "This demo session is over a day old, so we refreshed the sample data.",
      };
    }
    return { state, source: "storage" };
  } catch {
    return {
      state: createSeedState(now),
      source: "seed",
      notice: "Saved demo data could not be read, so we restored the sample data.",
    };
  }
}

export function saveState(state: DemoState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // In-memory fallback still works for this session.
  }
}
