/**
 * Doro Match — a deterministic, explainable ranking model.
 *
 * The weights are explicit product assumptions, not learned values. Every
 * component is normalized to 0–1 before weighting, and every explanation the
 * model returns is derived from the same numbers used to score the task.
 */

import type { Task, TaskCategory, User } from "@/types";
import { clamp01 } from "@/lib/format";
import { formatHourly } from "@/lib/format";
import {
  estimateRouteMiles,
  getLocation,
  travelMinutes,
} from "@/lib/locations";
import { minutesUntil } from "@/lib/time";

export const MATCH_WEIGHTS = {
  distance: 0.25,
  timing: 0.2,
  preference: 0.15,
  reward: 0.15,
  skills: 0.1,
  reliability: 0.1,
  personal: 0.05,
} as const;

export const MATCH_CONFIG = {
  weights: MATCH_WEIGHTS,
  /** A task is treated as short-notice below this many minutes to deadline. */
  urgentWindowMinutes: 180,
  /** Buffer a helper needs between travel + work and the deadline. */
  feasibilityBufferMinutes: 15,
  /** Expected waiting at a pickup or handoff. */
  waitingMinutes: 4,
  /** Neutral prior so a brand-new helper is not punished. */
  reliabilityPriorRate: 0.85,
  reliabilityPriorWeight: 4,
  reliabilityPriorRating: 4.5,
  notificationThreshold: 62,
  /** Weight of the helper's minimum-reward floor inside the reward score. */
  rewardFloorWeight: 0.3,
  /** Effective hourly rates below/above this are scored 0/1. */
  rewardHourlyFloorDollars: 4,
  rewardHourlyCeilingDollars: 22,
} as const;

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  delivery: "Pickup & delivery",
  errands: "Errands",
  tutoring: "Study & tutoring",
  tech: "Tech help",
  moving: "Moving & lifting",
  other: "Other help",
};

export interface MatchComponents {
  distance: number;
  timing: number;
  preference: number;
  reward: number;
  skills: number;
  reliability: number;
  personal: number;
}

export interface MatchResult {
  score: number;
  components: MatchComponents;
  explanation: string[];
  routeMiles: number;
  travelMinutes: number;
  totalMinutes: number;
  effectiveHourlyCents: number;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface MatchContext {
  now?: Date;
}

function reliabilityScore(helper: User): number {
  const { completed, cancelled, disputed, ratingSum, ratingCount } =
    helper.history;
  const total = completed + cancelled + disputed;
  const rate =
    (completed + MATCH_CONFIG.reliabilityPriorRate * MATCH_CONFIG.reliabilityPriorWeight) /
    (total + MATCH_CONFIG.reliabilityPriorWeight);
  const rating = ratingCount > 0 ? ratingSum / ratingCount : MATCH_CONFIG.reliabilityPriorRating;
  const rateScore = clamp01((rate - 0.5) / 0.5);
  const ratingScore = clamp01((rating - 3) / 2);
  return clamp01(0.7 * rateScore + 0.3 * ratingScore);
}

function preferenceScore(task: Task, helper: User): number {
  if (helper.preferences.categories.includes(task.category)) return 1;
  const adjacent: Record<TaskCategory, TaskCategory[]> = {
    delivery: ["errands", "moving"],
    errands: ["delivery", "moving"],
    tutoring: ["tech"],
    tech: ["tutoring"],
    moving: ["delivery", "errands"],
    other: ["errands"],
  };
  if (adjacent[task.category].some((c) => helper.preferences.categories.includes(c))) {
    return 0.55;
  }
  return 0.15;
}

function skillScore(task: Task, helper: User): { score: number; matched: string[] } {
  const helperSkills = helper.preferences.skills.map((s) => s.toLowerCase());
  const required = (task.requiredSkills ?? []).map((s) => s.toLowerCase());
  if (required.length > 0) {
    const matched = required.filter((skill) => helperSkills.includes(skill));
    return {
      score: matched.length === 0 ? 0.1 : clamp01(matched.length / required.length),
      matched,
    };
  }
  return {
    score: helperSkills.includes(task.category) ? 0.9 : 0.5,
    matched: helperSkills.includes(task.category) ? [task.category] : [],
  };
}

function personalScore(task: Task, helper: User, completedForRequester: boolean): number {
  let score = 0.3;
  if (helper.preferences.preferredLocationIds.includes(task.locationId)) score = 0.9;
  if (completedForRequester) score = 1;
  return score;
}

/**
 * Calculate a helper's match for a task. Eligibility is evaluated separately:
 * a very high score can never make an expired or already-assigned task
 * acceptable to the marketplace.
 */
export function calculateMatch(
  task: Task,
  helper: User,
  context: MatchContext = {},
  options?: { completedForRequester?: boolean },
): MatchResult {
  const now = context.now ?? new Date();
  const routeMiles = estimateRouteMiles(
    helper.homeLocationId,
    task.locationId,
    task.dropoffLocationId,
  );
  const travel = travelMinutes(routeMiles, helper.preferences.travelMode);
  const waiting = task.dropoffLocationId ? MATCH_CONFIG.waitingMinutes : 0;
  const totalMinutes = Math.max(5, travel + task.estimatedMinutes + waiting);
  const effectiveHourlyCents = Math.round(task.rewardCents / (totalMinutes / 60));
  const leadMinutes = minutesUntil(task.deadline, now);

  const travelAndWork = travel + task.estimatedMinutes + MATCH_CONFIG.feasibilityBufferMinutes;
  let ineligibleReason: string | undefined;
  if (task.status !== "OPEN") ineligibleReason = "This task is no longer open.";
  else if (task.requesterId === helper.id) ineligibleReason = "This is your own task.";
  else if (leadMinutes <= 0) ineligibleReason = "The deadline has passed.";
  else if (routeMiles > helper.preferences.maxDistanceMiles) {
    ineligibleReason = `The route is outside your ${helper.preferences.maxDistanceMiles} mi travel radius.`;
  } else if (leadMinutes < travelAndWork) {
    ineligibleReason = "There isn't enough time before the deadline with your travel estimate.";
  }

  const distanceComponent = clamp01(
    Math.exp(-1.6 * (routeMiles / Math.max(0.4, helper.preferences.maxDistanceMiles)) ** 2),
  );

  const slack = Math.max(0, leadMinutes - travelAndWork);
  let timing = 0.45 + 0.45 * clamp01(slack / 90);
  if (helper.preferences.prefersScheduled && leadMinutes < MATCH_CONFIG.urgentWindowMinutes) {
    timing = Math.min(timing, 0.35);
  }
  if (helper.preferences.prefersScheduled && leadMinutes >= MATCH_CONFIG.urgentWindowMinutes) {
    timing = Math.min(1, timing + 0.05);
  }

  const preference = preferenceScore(task, helper);
  const hourlyDollars = effectiveHourlyCents / 100;
  const hourlyScore = clamp01(
    (hourlyDollars - MATCH_CONFIG.rewardHourlyFloorDollars) /
      (MATCH_CONFIG.rewardHourlyCeilingDollars - MATCH_CONFIG.rewardHourlyFloorDollars),
  );
  const floorScore = clamp01(task.rewardCents / Math.max(1, helper.preferences.minRewardCents));
  const rewardScore = clamp01(
    (1 - MATCH_CONFIG.rewardFloorWeight) * hourlyScore +
      MATCH_CONFIG.rewardFloorWeight * floorScore,
  );

  const { score: skills, matched } = skillScore(task, helper);
  const reliability = reliabilityScore(helper);
  const personal = personalScore(task, helper, Boolean(options?.completedForRequester));

  const components: MatchComponents = {
    distance: distanceComponent,
    timing,
    preference,
    reward: rewardScore,
    skills,
    reliability,
    personal,
  };

  const weighted =
    components.distance * MATCH_WEIGHTS.distance +
    components.timing * MATCH_WEIGHTS.timing +
    components.preference * MATCH_WEIGHTS.preference +
    components.reward * MATCH_WEIGHTS.reward +
    components.skills * MATCH_WEIGHTS.skills +
    components.reliability * MATCH_WEIGHTS.reliability +
    components.personal * MATCH_WEIGHTS.personal;

  const score = ineligibleReason ? 0 : Math.min(99, Math.max(1, Math.round(weighted * 100)));

  // Build explanations only from the components that drove the score, ordered
  // by their weighted contribution.
  const candidates: { text: string; lift: number }[] = [];
  if (routeMiles <= 0.7) {
    candidates.push({
      text: `About ${travel} min of travel from ${getLocation(helper.homeLocationId).shortLabel}`,
      lift: components.distance * MATCH_WEIGHTS.distance,
    });
  } else if (components.distance < 0.45) {
    candidates.push({
      text: `Near the edge of your ${helper.preferences.maxDistanceMiles} mi radius`,
      lift: 0.02,
    });
  }
  if (timing >= 0.8) {
    candidates.push({ text: "Fits your available time", lift: components.timing * MATCH_WEIGHTS.timing });
  } else if (helper.preferences.prefersScheduled && leadMinutes < MATCH_CONFIG.urgentWindowMinutes) {
    candidates.push({ text: "Short notice — you usually prefer scheduled tasks", lift: 0.02 });
  }
  if (preference === 1) {
    candidates.push({
      text: `Matches your ${CATEGORY_LABELS[task.category]} preference`,
      lift: components.preference * MATCH_WEIGHTS.preference,
    });
  }
  if (rewardScore >= 0.55) {
    candidates.push({
      text: `Est. ${formatHourly(effectiveHourlyCents)} for about ${totalMinutes} min of effort`,
      lift: components.reward * MATCH_WEIGHTS.reward,
    });
  }
  if (skills >= 0.85) {
    candidates.push({
      text: matched.length > 0 ? `Uses your ${matched.join(", ")} skill` : "One of your strongest categories",
      lift: components.skills * MATCH_WEIGHTS.skills,
    });
  }
  if (personal >= 0.9 && options?.completedForRequester) {
    candidates.push({ text: "You've helped this requester before", lift: 0.06 });
  } else if (personal >= 0.9) {
    candidates.push({ text: "Near a place you visit often", lift: components.personal * MATCH_WEIGHTS.personal });
  }
  if (task.status === "OPEN" && leadMinutes > 0 && leadMinutes <= 120) {
    candidates.push({ text: "Deadline is coming up soon", lift: 0.01 });
  }

  const explanation = candidates
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 3)
    .map((c) => c.text);

  if (explanation.length === 0) {
    explanation.push(`Within your ${helper.preferences.maxDistanceMiles} mi discovery radius`);
  }

  return {
    score,
    components,
    explanation,
    routeMiles,
    travelMinutes: travel,
    totalMinutes,
    effectiveHourlyCents,
    eligible: !ineligibleReason,
    ineligibleReason,
  };
}

/** Convenience for sorting: higher score, then nearer, then newest. */
export function compareMatches(
  a: { match: MatchResult; task: Task },
  b: { match: MatchResult; task: Task },
): number {
  if (b.match.score !== a.match.score) return b.match.score - a.match.score;
  if (a.match.routeMiles !== b.match.routeMiles) {
    return a.match.routeMiles - b.match.routeMiles;
  }
  return new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime();
}
