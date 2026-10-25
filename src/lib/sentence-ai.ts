/**
 * Sentence understanding for the composer.
 *
 * A hosted model (Groq, called through `/api/compose`) reads the sentence; the
 * deterministic parser in features/task-suggestions.ts stays the floor. The
 * model is a convenience, never a dependency: if the tab is offline, the route
 * is missing, the key is absent, the model times out or returns junk, the
 * caller simply gets `null` and the rules fill the form.
 *
 * The model's output is still validated here. A schema-constrained answer has
 * the right shape, not necessarily the right values.
 */

import type { TaskCategory } from "@/types";
import { LOCATIONS } from "@/lib/locations";
import type { ParsedTaskSentence } from "@/features/task-suggestions";

export interface SentenceAiStatus {
  configured: boolean;
  label: string;
  detail: string;
  /** Model the server would try first, when configured. */
  model: string | null;
}

const OFFLINE_STATUS: SentenceAiStatus = {
  configured: false,
  label: "Local rules",
  detail: "The sentence helper is unreachable, so the deterministic parser fills the form.",
  model: null,
};

const CATEGORIES: TaskCategory[] = [
  "delivery",
  "errands",
  "tutoring",
  "tech",
  "moving",
  "other",
];

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Models tend to hand back the whole sentence as a title. Strip the time and
 * price clauses the form shows separately, which is what a person typing a
 * title would leave out.
 */
export function cleanModelTitle(raw: string | undefined, text: string): string {
  const base = (raw ?? text).trim();
  const stripped = base
    .replace(/[.!?]+\s*$/, "")
    .replace(/\s+(?:by|before|at|around)\s+[^,.]*$/i, "")
    .replace(/\s+for\s+\$?\d[^,.]*$/i, "")
    .replace(/[.;,\s]+$/, "")
    .trim();
  const title = stripped.length >= 4 ? stripped : base;
  return title.slice(0, 90);
}

/**
 * Rejects anything the app cannot use instead of trusting the model: unknown
 * categories, invented places, past deadlines and implausible money.
 */
export function sanitizeModelJson(
  raw: string,
  text: string,
  now: Date,
): ParsedTaskSentence | null {
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const category = CATEGORIES.includes(data.category as TaskCategory)
    ? (data.category as TaskCategory)
    : "other";
  const locationId = LOCATIONS.some((location) => location.id === data.locationId)
    ? (data.locationId as string)
    : undefined;
  const dropoffLocationId = LOCATIONS.some((location) => location.id === data.dropoffLocationId)
    ? (data.dropoffLocationId as string)
    : undefined;
  // A place the catalogue doesn't know survives as text; the composer geocodes
  // it. Long spans are usually a clause the model misread, not a place name.
  const place = (value: unknown): string | undefined => {
    const text = str(value);
    if (!text || text.length > 80 || /\b(?:by|before|for|at)\s+\d/i.test(text)) return undefined;
    return text;
  };
  const pickupText = locationId ? undefined : place(data.pickupText);
  const dropoffText = dropoffLocationId ? undefined : place(data.dropoffText);

  let deadline: string | undefined;
  if (typeof data.deadlineISO === "string") {
    const date = new Date(data.deadlineISO);
    if (!Number.isNaN(date.getTime()) && date.getTime() > now.getTime() + 5 * 60_000) {
      deadline = date.toISOString();
    }
  }

  // A model that answers 0 or null means "no idea", not "instant".
  const rawMinutes = num(data.estimatedMinutes);
  const estimatedMinutes =
    rawMinutes && rawMinutes > 0
      ? Math.min(240, Math.max(5, Math.round(rawMinutes)))
      : 20;
  const reward = num(data.rewardCents);
  const rewardCents =
    reward && reward >= 100 && reward <= 100_000 ? Math.round(reward / 50) * 50 : undefined;
  const title = cleanModelTitle(str(data.title), text);

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: text,
    category,
    locationId,
    dropoffLocationId:
      dropoffLocationId && dropoffLocationId !== locationId ? dropoffLocationId : undefined,
    pickupText,
    dropoffText: dropoffText && dropoffText !== pickupText ? dropoffText : undefined,
    deadline,
    estimatedMinutes,
    rewardCents,
    confidence: locationId && deadline && rewardCents ? "high" : locationId || deadline ? "medium" : "low",
    source: "local-llm",
    notes: ["Read by the hosted sentence helper."],
  };
}

/**
 * The model reads the sentence; the rules do the arithmetic. Anything the model
 * left null is filled from the deterministic parse, and the rule parser's
 * reward wins when it found one, because a price is cheaper to trust to a regex
 * than to a language model.
 */
export function mergeSentenceParses(
  model: ParsedTaskSentence | null,
  rules: ParsedTaskSentence | null,
): ParsedTaskSentence | null {
  if (!model) return rules;
  if (!rules) return model;

  // A cheap model reads "bring X from A to B" as an errand often enough that a
  // sanity rule is worth it: two distinct places means a delivery, whatever the
  // model called it. Moving is the one two-place category that is not a drop.
  const twoPlaces = Boolean(
    model.dropoffLocationId || rules.dropoffLocationId || model.dropoffText || rules.dropoffText,
  );
  const category =
    model.category === "other"
      ? rules.category
      : twoPlaces && model.category !== "delivery" && model.category !== "moving"
        ? "delivery"
        : model.category;

  return {
    title: model.title ?? rules.title,
    description: model.description ?? rules.description,
    category,
    locationId: model.locationId ?? rules.locationId,
    dropoffLocationId: model.dropoffLocationId ?? rules.dropoffLocationId,
    pickupText: model.locationId ? undefined : model.pickupText ?? rules.pickupText,
    dropoffText: model.dropoffLocationId ? undefined : model.dropoffText ?? rules.dropoffText,
    deadline: model.deadline ?? rules.deadline,
    // Duration is category work, not language: the parser reads explicit
    // "20 minutes" and knows a move takes longer than a coffee run. Every model
    // tried so far answered null or 0 often enough that it cannot own this.
    estimatedMinutes: rules.estimatedMinutes,
    rewardCents: rules.rewardCents ?? model.rewardCents,
    confidence:
      model.confidence === "low" && rules.confidence !== "low" ? rules.confidence : model.confidence,
    source: "local-llm",
    notes: [...model.notes, "Numbers were checked against the rule parser."],
  };
}

let statusPromise: Promise<SentenceAiStatus> | null = null;

/** Asks the server whether a Groq key is configured. Cached per page load. */
export function getSentenceAiStatus(): Promise<SentenceAiStatus> {
  if (typeof window === "undefined") return Promise.resolve(OFFLINE_STATUS);
  if (statusPromise) return statusPromise;

  statusPromise = (async () => {
    try {
      const response = await fetch("/api/compose", { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) return OFFLINE_STATUS;
      const payload = (await response.json()) as { configured?: boolean; models?: string[] };
      if (!payload.configured) {
        return {
          configured: false,
          label: "Local rules",
          detail: "Add GROQ_API_KEY to the server to let a model read the sentence.",
          model: null,
        };
      }
      const model = payload.models?.[0] ?? null;
      return {
        configured: true,
        label: model ? `Groq · ${model}` : "Groq ready",
        detail: "One sentence is read by a hosted model; if it can't answer, the local parser does.",
        model,
      };
    } catch {
      return OFFLINE_STATUS;
    }
  })();

  return statusPromise;
}

/**
 * Returns the model's reading, or null so the caller can use the rules. Never
 * throws and never blocks longer than the route's own timeout.
 */
export async function parseTaskWithGroq(
  text: string,
  options: { now?: Date } = {},
): Promise<ParsedTaskSentence | null> {
  if (typeof window === "undefined") return null;
  const now = options.now ?? new Date();
  try {
    const response = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, localTime: now.toString() }),
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { raw?: unknown };
    if (typeof payload.raw !== "string") return null;
    return sanitizeModelJson(payload.raw, text, now);
  } catch {
    return null;
  }
}
