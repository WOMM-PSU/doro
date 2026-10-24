/**
 * Rules-based reward recommendation.
 *
 * This is intentionally transparent: a category hourly rate multiplied by
 * estimated effort, plus travel and short-notice adjustments, with a category
 * minimum. It is an estimate from task details, not live market data.
 */

import type { TaskCategory } from "@/types";
import { clamp01 } from "@/lib/format";
import { distanceBetweenLocations, travelMinutes } from "@/lib/locations";
import { minutesUntil } from "@/lib/time";

export interface PricingInput {
  category: TaskCategory;
  estimatedMinutes: number;
  deadline?: string;
  locationId?: string;
  dropoffLocationId?: string;
  expenseCents?: number;
  now?: Date;
}

export interface RewardRecommendation {
  minCents: number;
  typicalCents: number;
  maxCents: number;
  taskMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  hourlyCents: number;
  factors: string[];
  explanation: string;
  confidence: "estimated";
}

export const PRICING_CONFIG: Record<
  TaskCategory,
  { label: string; hourlyCents: number; minimumCents: number; complexityMultiplier: number }
> = {
  delivery: {
    label: "Pickup & delivery",
    hourlyCents: 1600,
    minimumCents: 400,
    complexityMultiplier: 1,
  },
  errands: {
    label: "Errands",
    hourlyCents: 1800,
    minimumCents: 400,
    complexityMultiplier: 1,
  },
  tutoring: {
    label: "Study & tutoring",
    hourlyCents: 2400,
    minimumCents: 800,
    complexityMultiplier: 1,
  },
  tech: {
    label: "Tech help",
    hourlyCents: 2600,
    minimumCents: 800,
    complexityMultiplier: 1.05,
  },
  moving: {
    label: "Moving & lifting",
    hourlyCents: 2200,
    minimumCents: 800,
    complexityMultiplier: 1.06,
  },
  other: {
    label: "Other help",
    hourlyCents: 1600,
    minimumCents: 400,
    complexityMultiplier: 1,
  },
};

/** A typical helper is assumed to be a quarter mile from the pickup point. */
export const TYPICAL_APPROACH_MILES = 0.25;

export function estimateTaskTravelMinutes(input: PricingInput): number {
  const legMiles =
    input.locationId && input.dropoffLocationId
      ? distanceBetweenLocations(input.locationId, input.dropoffLocationId)
      : 0;
  return travelMinutes(TYPICAL_APPROACH_MILES + legMiles, "walk");
}

function roundToStep(cents: number, step = 50): number {
  return Math.max(0, Math.round(cents / step) * step);
}

export function recommendReward(input: PricingInput): RewardRecommendation {
  const config = PRICING_CONFIG[input.category];
  const now = input.now ?? new Date();
  const taskMinutes = Math.max(5, Math.round(input.estimatedMinutes));
  const travel = estimateTaskTravelMinutes(input);
  const waiting = input.dropoffLocationId ? 4 : 0;
  const totalMinutes = taskMinutes + travel + waiting;
  const effortHours = totalMinutes / 60;

  let multiplier = config.complexityMultiplier;
  const factors: string[] = [
    `About ${totalMinutes} min of estimated effort`,
    `${travel} min of estimated travel`,
  ];

  if (input.deadline) {
    const lead = minutesUntil(input.deadline, now);
    if (lead > 0 && lead <= 90) {
      multiplier *= 1.25;
      factors.push("Short-notice request (+25%)");
    } else if (lead > 0 && lead <= 240) {
      multiplier *= 1.12;
      factors.push("Due within a few hours (+12%)");
    }
  }
  if (config.complexityMultiplier > 1) {
    factors.push("Category typically needs a little more setup");
  }
  if (input.expenseCents && input.expenseCents > 0) {
    factors.push("Receipt expenses are reimbursed separately");
  }

  const base = effortHours * config.hourlyCents * multiplier;
  const typical = Math.max(
    config.minimumCents,
    roundToStep(base, 50),
  );
  const min = Math.max(config.minimumCents, roundToStep(base * 0.8, 50));
  const max = Math.max(typical + 50, roundToStep(base * 1.3, 50));

  return {
    minCents: Math.min(min, typical),
    typicalCents: typical,
    maxCents: max,
    taskMinutes,
    travelMinutes: travel,
    totalMinutes,
    hourlyCents: config.hourlyCents,
    factors,
    explanation: `Estimated from ${config.label.toLowerCase()} effort, travel, and timing.`,
    confidence: "estimated",
  };
}

export type RewardPosition = "below" | "within" | "above";

export function rewardPosition(
  rewardCents: number,
  rec: Pick<RewardRecommendation, "minCents" | "maxCents">,
): RewardPosition {
  if (rewardCents < rec.minCents) return "below";
  if (rewardCents > rec.maxCents) return "above";
  return "within";
}

/** 0–1 position of a reward inside the suggested range (for the meter UI). */
export function rewardRangePosition(
  rewardCents: number,
  rec: Pick<RewardRecommendation, "minCents" | "maxCents">,
): number {
  const span = Math.max(1, rec.maxCents - rec.minCents);
  return clamp01((rewardCents - rec.minCents) / span);
}
