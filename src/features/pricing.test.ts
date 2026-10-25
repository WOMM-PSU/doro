import { describe, expect, it } from "vitest";
import { recommendReward, rewardPosition, rewardRangePosition } from "@/features/pricing";

const now = new Date("2026-10-24T18:00:00.000Z");

describe("reward recommendation", () => {
  it("produces a coherent range rounded to 50 cent steps", () => {
    const rec = recommendReward({
      category: "delivery",
      estimatedMinutes: 20,
      locationId: "west-halls",
      dropoffLocationId: "hub",
      now,
    });
    expect(rec.typicalCents).toBeGreaterThanOrEqual(rec.minCents);
    expect(rec.maxCents).toBeGreaterThanOrEqual(rec.typicalCents);
    for (const value of [rec.minCents, rec.typicalCents, rec.maxCents]) {
      expect(value % 50).toBe(0);
      expect(value).toBeGreaterThan(0);
    }
    expect(rec.confidence).toBe("estimated");
    expect(rec.explanation.length).toBeGreaterThan(0);
    expect(rec.factors.length).toBeGreaterThan(0);
  });

  it("increases with task duration and travel", () => {
    const short = recommendReward({ category: "moving", estimatedMinutes: 10, now });
    const long = recommendReward({ category: "moving", estimatedMinutes: 60, now });
    expect(long.typicalCents).toBeGreaterThan(short.typicalCents);

    const local = recommendReward({
      category: "delivery",
      estimatedMinutes: 15,
      locationId: "west-halls",
      now,
    });
    const acrossCampus = recommendReward({
      category: "delivery",
      estimatedMinutes: 15,
      locationId: "east-halls",
      dropoffLocationId: "west-halls",
      now,
    });
    expect(acrossCampus.totalMinutes).toBeGreaterThan(local.totalMinutes);
    expect(acrossCampus.typicalCents).toBeGreaterThanOrEqual(local.typicalCents);
  });

  it("adds a short-notice adjustment when the deadline is close", () => {
    const later = recommendReward({
      category: "errands",
      estimatedMinutes: 20,
      deadline: new Date(now.getTime() + 12 * 3_600_000).toISOString(),
      now,
    });
    const urgent = recommendReward({
      category: "errands",
      estimatedMinutes: 20,
      deadline: new Date(now.getTime() + 45 * 60_000).toISOString(),
      now,
    });
    expect(urgent.typicalCents).toBeGreaterThan(later.typicalCents);
    expect(urgent.factors.some((f) => f.includes("Short-notice"))).toBe(true);
  });

  it("respects category minimums for tiny tasks", () => {
    const rec = recommendReward({
      category: "tutoring",
      estimatedMinutes: 5,
      now,
    });
    expect(rec.minCents).toBeGreaterThanOrEqual(800);
    expect(rec.typicalCents).toBeGreaterThanOrEqual(800);
  });

  it("does not silently add expenses to the helper reward", () => {
    const without = recommendReward({
      category: "errands",
      estimatedMinutes: 20,
      now,
    });
    const withExpense = recommendReward({
      category: "errands",
      estimatedMinutes: 20,
      expenseCents: 1200,
      now,
    });
    expect(withExpense.typicalCents).toBe(without.typicalCents);
    expect(withExpense.factors.some((f) => f.includes("reimbursed"))).toBe(true);
  });

  it("guards against implausibly short durations", () => {
    const rec = recommendReward({ category: "tech", estimatedMinutes: -20, now });
    expect(rec.taskMinutes).toBeGreaterThanOrEqual(5);
    expect(rec.typicalCents).toBeGreaterThan(0);
  });

  it("classifies a reward against the suggested range", () => {
    const rec = { minCents: 500, maxCents: 900 };
    expect(rewardPosition(400, rec)).toBe("below");
    expect(rewardPosition(700, rec)).toBe("within");
    expect(rewardPosition(1000, rec)).toBe("above");
    expect(rewardRangePosition(700, rec)).toBeCloseTo(0.5);
    expect(rewardRangePosition(-100, rec)).toBe(0);
    expect(rewardRangePosition(2000, rec)).toBe(1);
  });
});
