import { describe, expect, it } from "vitest";
import { formatTimeLeft } from "@/lib/time";

const now = new Date("2026-10-25T12:00:00Z");
const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

describe("formatTimeLeft", () => {
  it("uses minutes under an hour", () => {
    expect(formatTimeLeft(inMinutes(20), now)).toBe("20 min left");
  });

  it("uses hours and minutes under a day", () => {
    expect(formatTimeLeft(inMinutes(60), now)).toBe("1h left");
    expect(formatTimeLeft(inMinutes(195), now)).toBe("3h 15m left");
  });

  it("uses days beyond a day instead of large hour counts", () => {
    expect(formatTimeLeft(inMinutes(35 * 60), now)).toBe("1 day 11h left");
    expect(formatTimeLeft(inMinutes(48 * 60), now)).toBe("2 days left");
    expect(formatTimeLeft(inMinutes(5 * 24 * 60 + 300), now)).toBe("5 days left");
  });

  it("says when the deadline has passed", () => {
    expect(formatTimeLeft(inMinutes(-5), now)).toBe("Deadline passed");
  });
});
