import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanModelTitle,
  mergeSentenceParses,
  parseTaskWithGroq,
  sanitizeModelJson,
} from "@/lib/sentence-ai";
import { parseTaskSentence } from "@/features/task-suggestions";

const now = new Date("2026-10-24T18:00:00.000Z");

describe("cleanModelTitle", () => {
  it("drops the time and price clauses the form tracks separately", () => {
    expect(cleanModelTitle("Bring my charger to East Halls by 4pm for $6.", "fallback")).toBe(
      "Bring my charger to East Halls",
    );
  });

  it("keeps a title that has no trailing clauses", () => {
    expect(cleanModelTitle("Debug a Python script", "fallback")).toBe("Debug a Python script");
  });

  it("falls back to the sentence when the model returns nothing usable", () => {
    expect(cleanModelTitle(undefined, "Move a mini fridge to Pollock")).toBe(
      "Move a mini fridge to Pollock",
    );
  });
});

describe("sanitizeModelJson", () => {
  const text = "Bring my charger from Pattee to East Halls by 4pm for $6";

  it("keeps valid values and normalises the title", () => {
    const parsed = sanitizeModelJson(
      JSON.stringify({
        title: "Bring my charger to East Halls by 4pm for $6.",
        description: text,
        category: "delivery",
        locationId: "pattee",
        dropoffLocationId: "east-halls",
        deadlineISO: "2026-10-24T20:00:00.000Z",
        estimatedMinutes: 15,
        rewardCents: 600,
      }),
      text,
      now,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe("delivery");
    expect(parsed?.locationId).toBe("pattee");
    expect(parsed?.dropoffLocationId).toBe("east-halls");
    expect(parsed?.deadline).toBe("2026-10-24T20:00:00.000Z");
    expect(parsed?.rewardCents).toBe(600);
    expect(parsed?.title).toBe("Bring my charger to East Halls");
  });

  it("rejects values the app cannot use instead of trusting the model", () => {
    const parsed = sanitizeModelJson(
      JSON.stringify({
        title: "Something",
        category: "teleport",
        locationId: "atlantis",
        dropoffLocationId: "moon",
        deadlineISO: "2020-01-01T00:00:00.000Z",
        estimatedMinutes: 900,
        rewardCents: 900_000,
      }),
      text,
      now,
    );
    expect(parsed?.category).toBe("other");
    expect(parsed?.locationId).toBeUndefined();
    expect(parsed?.dropoffLocationId).toBeUndefined();
    expect(parsed?.deadline).toBeUndefined();
    expect(parsed?.estimatedMinutes).toBe(240);
    expect(parsed?.rewardCents).toBeUndefined();
    expect(parsed?.confidence).toBe("low");
  });

  it("rounds rewards to the nearest 50 cents and accepts JSON in prose", () => {
    const parsed = sanitizeModelJson(
      'Here you go: {"title":"Buy coffee","category":"errands","estimatedMinutes":12,"rewardCents":837}',
      text,
      now,
    );
    expect(parsed?.rewardCents).toBe(850);
    expect(parsed?.estimatedMinutes).toBe(12);
  });

  it("keeps a place name the catalogue doesn't know", () => {
    const parsed = sanitizeModelJson(
      JSON.stringify({
        title: "Get a choolah bowl from Redifer to Cooper Hall",
        category: "delivery",
        locationId: "redifer",
        dropoffLocationId: null,
        pickupText: null,
        dropoffText: "cooper hall",
        deadlineISO: null,
        estimatedMinutes: 15,
        rewardCents: null,
      }),
      "get a choolah bowl from redifer to cooper hall",
      now,
    );
    expect(parsed?.locationId).toBe("redifer");
    expect(parsed?.dropoffText).toBe("cooper hall");
  });

  it("rejects a place span that is really a time clause", () => {
    const parsed = sanitizeModelJson(
      JSON.stringify({
        title: "Bring it over",
        category: "delivery",
        locationId: null,
        dropoffLocationId: null,
        pickupText: "pattee",
        dropoffText: "east halls by 5pm",
        deadlineISO: null,
        estimatedMinutes: 15,
        rewardCents: null,
      }),
      text,
      now,
    );
    expect(parsed?.pickupText).toBe("pattee");
    expect(parsed?.dropoffText).toBeUndefined();
  });

  it("returns null when there is no JSON to read", () => {
    expect(sanitizeModelJson("I could not do that.", text, now)).toBeNull();
  });
});

describe("mergeSentenceParses", () => {
  const text = "Someone to debug my python assignment over zoom tonight for $20";

  it("keeps the model's reading and the rules' arithmetic", () => {
    const rules = parseTaskSentence(text, { now });
    const model = sanitizeModelJson(
      '{"title":"debug my Python assignment over zoom","category":"tech","locationId":null,"dropoffLocationId":null,"deadlineISO":null,"estimatedMinutes":5,"rewardCents":800}',
      text,
      now,
    );
    const merged = mergeSentenceParses(model, rules);
    expect(merged?.category).toBe("tech");
    expect(merged?.rewardCents).toBe(2000);
    expect(merged?.title?.toLowerCase()).toContain("debug");
  });

  it("fills what the model left null from the rules", () => {
    const rules = parseTaskSentence("Bring my charger from Pattee to East Halls by 4pm", { now });
    const model = sanitizeModelJson(
      '{"title":"Bring my charger to East Halls","category":"other","locationId":null,"dropoffLocationId":null,"deadlineISO":null,"estimatedMinutes":5,"rewardCents":null}',
      "Bring my charger from Pattee to East Halls by 4pm",
      now,
    );
    const merged = mergeSentenceParses(model, rules);
    expect(merged?.locationId).toBe("pattee");
    expect(merged?.dropoffLocationId).toBe("east-halls");
    expect(merged?.deadline).toBe(rules?.deadline);
    expect(merged?.category).toBe("delivery");
  });

  it("corrects a mislabelled two-place errand into a delivery", () => {
    const text = "Bring my charger from Pattee to East Halls by 4pm for $6";
    const rules = parseTaskSentence(text, { now });
    // The cheap model reads it as an errand but still finds both places.
    const model = sanitizeModelJson(
      '{"title":"Bring my charger to East Halls","category":"errands","locationId":"pattee","dropoffLocationId":"east-halls","deadlineISO":null,"estimatedMinutes":0,"rewardCents":600}',
      text,
      now,
    );
    expect(model?.category).toBe("errands");
    const merged = mergeSentenceParses(model, rules);
    expect(merged?.category).toBe("delivery");
    // A zero estimate from the model never reaches the form.
    expect(merged?.estimatedMinutes).toBe(rules?.estimatedMinutes);
  });

  it("treats a named drop-off outside the catalogue as a delivery", () => {
    const text = "get my bowl from redifer to cooper hall";
    const rules = parseTaskSentence(text, { now });
    const model = sanitizeModelJson(
      '{"title":"Get my bowl to Cooper Hall","category":"errands","locationId":"redifer","dropoffLocationId":null,"pickupText":null,"dropoffText":"cooper hall","deadlineISO":null,"estimatedMinutes":10,"rewardCents":null}',
      text,
      now,
    );
    expect(model?.category).toBe("errands");
    const merged = mergeSentenceParses(model, rules);
    expect(merged?.category).toBe("delivery");
    expect(merged?.locationId).toBe("redifer");
    expect(merged?.dropoffText).toBe("cooper hall");
  });

  it("falls back to whichever parse exists", () => {
    const rules = parseTaskSentence("Move three boxes to West Halls", { now });
    expect(mergeSentenceParses(null, rules)).toBe(rules);
    expect(mergeSentenceParses(null, null)).toBeNull();
  });
});

describe("parseTaskWithGroq", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the sanitised reading when the route answers", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          configured: true,
          model: "qwen/qwen3.8-27b",
          raw: JSON.stringify({
            title: "Move mini fridge to Pollock Halls",
            category: "moving",
            locationId: null,
            dropoffLocationId: "pollock-halls",
            deadlineISO: "2026-10-26T22:00:00.000Z",
            estimatedMinutes: 30,
            rewardCents: 2500,
          }),
        }),
      ),
    );
    const parsed = await parseTaskWithGroq("Move a mini fridge to Pollock Halls by 6pm for $25", {
      now,
    });
    expect(parsed?.category).toBe("moving");
    expect(parsed?.rewardCents).toBe(2500);
    expect(parsed?.source).toBe("local-llm");
  });

  it("returns null when the route is unreachable, so the rules take over", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(parseTaskWithGroq("Bring my charger to East Halls", { now })).resolves.toBeNull();
  });

  it("returns null on an error status instead of throwing", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })));
    await expect(parseTaskWithGroq("Bring my charger to East Halls", { now })).resolves.toBeNull();
  });
});
