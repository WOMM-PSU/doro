import { describe, expect, it } from "vitest";
import { createSeedState } from "@/features/seed";
import { calculateMatch, MATCH_WEIGHTS } from "@/features/matching";
import { getDiscoverTasks, DEFAULT_FILTERS, effectiveStatus } from "@/features/selectors";
import type { User } from "@/types";

const now = new Date("2026-10-24T22:00:00.000Z");

function seed() {
  return createSeedState(now);
}

function user(state: ReturnType<typeof seed>, id: string): User {
  return state.users.find((u) => u.id === id)!;
}

function filters(overrides: Partial<typeof DEFAULT_FILTERS> = {}) {
  return { ...DEFAULT_FILTERS, maxDistanceMiles: 3, ...overrides };
}

describe("Doro Match", () => {
  it("returns normalized components, a bounded score, and real explanations", () => {
    const state = seed();
    const task = state.tasks.find((t) => t.id === "t-notebook")!;
    const alex = user(state, "u-alex");
    const result = calculateMatch(task, alex, { now });

    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    for (const value of Object.values(result.components)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation.length).toBeLessThanOrEqual(3);
    expect(result.effectiveHourlyCents).toBeGreaterThan(0);
    expect(result.totalMinutes).toBe(
      result.travelMinutes + task.estimatedMinutes + 4,
    );
  });

  it("uses the documented weights", () => {
    const total = Object.values(MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("ranks tasks differently for different helpers", () => {
    const state = seed();
    const alex = user(state, "u-alex");
    const jordan = user(state, "u-jordan");
    const sam = user(state, "u-sam");

    const alexFeed = getDiscoverTasks(state, alex, filters(), now);
    const jordanFeed = getDiscoverTasks(state, jordan, filters(), now);
    const samFeed = getDiscoverTasks(state, sam, filters(), now);

    expect(alexFeed.length).toBeGreaterThan(0);
    expect(jordanFeed.length).toBeGreaterThan(0);
    expect(samFeed.length).toBeGreaterThan(0);

    // Tutoring and tech rise for Jordan, whose skills and preferences match.
    const jordanTopThree = jordanFeed.slice(0, 3).map((item) => item.task.category);
    expect(jordanTopThree.some((category) => category === "tutoring" || category === "tech")).toBe(
      true,
    );

    const alexOrder = alexFeed.map((item) => item.task.id).join(",");
    const samOrder = samFeed.map((item) => item.task.id).join(",");
    expect(alexOrder).not.toBe(samOrder);
  });

  it("gives a new helper a fair chance instead of penalising missing history", () => {
    const state = seed();
    const sam = user(state, "u-sam");
    const alex = user(state, "u-alex");
    const notebook = state.tasks.find((t) => t.id === "t-notebook")!;
    const samMatch = calculateMatch(notebook, sam, { now });
    const alexMatch = calculateMatch(notebook, alex, { now });
    expect(samMatch.components.reliability).toBeGreaterThan(0.5);
    expect(alexMatch.components.reliability - samMatch.components.reliability).toBeLessThan(0.25);
  });

  it("never offers expired, assigned, or own tasks", () => {
    const state = seed();
    const alex = user(state, "u-alex");
    const notebook = state.tasks.find((t) => t.id === "t-notebook")!;
    notebook.deadline = new Date(now.getTime() - 60_000).toISOString();
    expect(calculateMatch(notebook, alex, { now }).eligible).toBe(false);
    expect(effectiveStatus(notebook, now)).toBe("EXPIRED");

    const assigned = state.tasks.find((t) => t.id === "t-assigned-charger")!;
    expect(calculateMatch(assigned, user(state, "u-sam"), { now }).eligible).toBe(false);

    const maya = user(state, "u-maya");
    expect(calculateMatch(notebook, maya, { now }).eligible).toBe(false);

    const feed = getDiscoverTasks(state, alex, filters(), now);
    expect(feed.some((item) => item.task.id === "t-notebook")).toBe(false);
    expect(feed.every((item) => item.task.status === "OPEN")).toBe(true);
    expect(feed.every((item) => item.task.requesterId !== alex.id)).toBe(true);
  });

  it("changes eligibility when the helper's maximum distance changes", () => {
    const state = seed();
    const alex = user(state, "u-alex");
    const near = { ...alex, preferences: { ...alex.preferences, maxDistanceMiles: 0.2 } };
    const far = { ...alex, preferences: { ...alex.preferences, maxDistanceMiles: 2.2 } };
    const notebook = state.tasks.find((t) => t.id === "t-notebook")!;
    expect(calculateMatch(notebook, near, { now }).eligible).toBe(false);
    expect(calculateMatch(notebook, far, { now }).eligible).toBe(true);
    expect(getDiscoverTasks(state, near, filters(), now).length).toBeLessThan(
      getDiscoverTasks(state, far, filters(), now).length,
    );
  });

  it("rewards a higher reward for the same effort", () => {
    const state = seed();
    const alex = user(state, "u-alex");
    const base = state.tasks.find((t) => t.id === "t-notebook")!;
    const generous = { ...base, rewardCents: 1800 };
    const low = calculateMatch(base, alex, { now });
    const high = calculateMatch(generous, alex, { now });
    expect(high.components.reward).toBeGreaterThan(low.components.reward);
  });

  it("reduces timing suitability for short-notice tasks for scheduled-preferring helpers", () => {
    const state = seed();
    const jordan = user(state, "u-jordan");
    const urgent = { ...state.tasks.find((t) => t.id === "t-umbrella")! };
    const scheduled = { ...urgent, deadline: new Date(now.getTime() + 30 * 3_600_000).toISOString() };
    const urgentMatch = calculateMatch(urgent, jordan, { now });
    const scheduledMatch = calculateMatch(scheduled, jordan, { now });
    expect(scheduledMatch.components.timing).toBeGreaterThan(urgentMatch.components.timing);
  });

  it("filters by category and search without leaving stale results", () => {
    const state = seed();
    const alex = user(state, "u-alex");
    const tech = getDiscoverTasks(state, alex, filters({ category: "tech" }), now);
    expect(tech.length).toBeGreaterThan(0);
    expect(tech.every((item) => item.task.category === "tech")).toBe(true);

    const python = getDiscoverTasks(state, alex, filters({ search: "python" }), now);
    expect(python.some((item) => item.task.id === "t-python")).toBe(true);

    const none = getDiscoverTasks(state, alex, filters({ search: "zzzz-no-match" }), now);
    expect(none).toEqual([]);
  });

  it("changes ordering between discovery modes", () => {
    const state = seed();
    const alex = user(state, "u-alex");
    const forYou = getDiscoverTasks(state, alex, filters({ mode: "foryou" }), now);
    const nearby = getDiscoverTasks(state, alex, filters({ mode: "nearby" }), now);
    const urgent = getDiscoverTasks(state, alex, filters({ mode: "urgent" }), now);
    const rewards = getDiscoverTasks(state, alex, filters({ mode: "reward" }), now);

    expect(nearby.length).toBeGreaterThan(0);
    for (let i = 1; i < nearby.length; i += 1) {
      expect(nearby[i - 1].distanceMiles).toBeLessThanOrEqual(nearby[i].distanceMiles);
    }
    expect(urgent.every((item) => item.minutesLeft <= 24 * 60)).toBe(true);
    for (let i = 1; i < urgent.length; i += 1) {
      expect(urgent[i - 1].minutesLeft).toBeLessThanOrEqual(urgent[i].minutesLeft);
    }
    for (let i = 1; i < rewards.length; i += 1) {
      expect(rewards[i - 1].effectiveHourlyCents).toBeGreaterThanOrEqual(
        rewards[i].effectiveHourlyCents,
      );
    }
    const forYouOrder = forYou.map((item) => item.task.id);
    const nearbyOrder = nearby.map((item) => item.task.id);
    expect(forYouOrder.join(",")).not.toBe(nearbyOrder.join(","));
  });
});
