import { describe, expect, it } from "vitest";
import { parseTaskSentence } from "@/features/task-suggestions";

const now = new Date("2026-10-24T18:00:00.000Z");

describe("parseTaskSentence", () => {
  it("fills the example sentence end to end", () => {
    const parsed = parseTaskSentence("Bring my charger from Pattee to East Halls by 4pm for $6", {
      now,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe("delivery");
    expect(parsed?.locationId).toBe("pattee");
    expect(parsed?.dropoffLocationId).toBe("east-halls");
    expect(parsed?.rewardCents).toBe(600);
    expect(parsed?.estimatedMinutes).toBe(15);
    expect(parsed?.deadline).toBeTruthy();
    expect(parsed?.title?.toLowerCase()).toContain("charger");
    expect(parsed?.notes.length).toBeGreaterThan(0);
  });

  it("understands relative deadlines", () => {
    const parsed = parseTaskSentence("Pick up my package at the HUB in 2 hours", { now });
    expect(parsed?.locationId).toBe("hub");
    expect(parsed?.deadline).toBe(new Date(now.getTime() + 2 * 3_600_000).toISOString());
  });

  it("does not invent a pickup when only one place is named", () => {
    const parsed = parseTaskSentence("Move three boxes to West Halls this afternoon", { now });
    expect(parsed?.category).toBe("moving");
    expect(parsed?.locationId).toBe("west-halls");
    expect(parsed?.dropoffLocationId).toBeUndefined();
  });

  it("ignores implausible rewards and rejects tiny fragments", () => {
    const parsed = parseTaskSentence("Deliver a notebook to Pattee for $5000", { now });
    expect(parsed?.rewardCents).toBeUndefined();
    expect(parseTaskSentence("help", { now })).toBeNull();
  });
});
