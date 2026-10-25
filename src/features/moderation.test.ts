import { describe, expect, it } from "vitest";
import {
  analyzeContent,
  analyzeMessage,
  detectProhibitedRequest,
  normalizeText,
} from "@/features/moderation";

describe("normalizeText", () => {
  it("undoes leetspeak, inflated letters, and spaced-out words", () => {
    expect(normalizeText("w33d")).toBe("weed");
    expect(normalizeText("4dderall")).toBe("adderall");
    expect(normalizeText("w e e d")).toBe("weed");
    expect(normalizeText("LOOOOVE")).toBe("love");
    expect(normalizeText("Write   MY essay!!")).toBe("write my essay");
  });
});

describe("analyzeContent", () => {
  it("blocks obvious academic cheating", () => {
    const result = analyzeContent("Can you write my essay for my English final?");
    expect(result.level).toBe("block");
    expect(result.categories).toContain("Academic integrity");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("blocks disguised substance requests", () => {
    expect(analyzeContent("need someone to bring me some w33d").level).toBe("block");
    expect(analyzeContent("can you find addreall for me").level).toBe("block");
  });

  it("blocks paid passenger rides", () => {
    expect(analyzeContent("Give me a ride to the airport tomorrow").level).toBe("block");
  });

  it("does not hard-block harmless mentions", () => {
    expect(analyzeContent("Help me carry my wine rack to the basement").level).toBe("allow");
    expect(analyzeContent("Grab my prescription glasses from the dorm").level).toBe("allow");
    expect(analyzeContent("Move my gun safe to the new apartment").level).toBe("allow");
    expect(analyzeContent("Bring my charger from Pattee to East Halls").level).toBe("allow");
  });

  it("warns about off-platform payment instead of blocking", () => {
    const result = analyzeContent("Can I just Venmo you for this?");
    expect(result.level).toBe("warn");
    expect(result.categories).toContain("Off-platform payment");
  });

  it("blocks threats and harassment", () => {
    expect(analyzeContent("I will hurt you if you don't finish").level).toBe("block");
  });

  it("keeps scores bounded and reports reasons", () => {
    const result = analyzeContent("write my essay, buy weed, bring a gun, venmo me");
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.level).toBe("block");
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});

describe("analyzeMessage", () => {
  it("warns about phone numbers and emails without blocking", () => {
    const phone = analyzeMessage("Text me at 814-555-1234");
    expect(phone.level).toBe("warn");
    expect(phone.categories).toContain("Contact info");

    const email = analyzeMessage("email me at helper@psu.edu");
    expect(email.level).toBe("warn");
  });

  it("leaves ordinary coordination alone", () => {
    const result = analyzeMessage("I'll meet you at the library desk at 3.");
    expect(result.level).toBe("allow");
    expect(result.riskScore).toBe(0);
  });
});

describe("detectProhibitedRequest", () => {
  it("stays compatible with task validation", () => {
    expect(detectProhibitedRequest("write my final exam")).toBeTruthy();
    expect(detectProhibitedRequest("carry my wine rack")).toBeNull();
    expect(detectProhibitedRequest("Deliver a notebook to the library")).toBeNull();
  });
});
