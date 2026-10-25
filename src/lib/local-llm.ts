/**
 * Browser-local language model support.
 *
 * Nothing here sends text to a server. If Chrome exposes its built-in Prompt
 * API (an on-device model), the composer can use it to structure a one-sentence
 * request. Everywhere else the deterministic parser in task-suggestions.ts is
 * the fallback. The UI always says which engine ran.
 */

import type { TaskCategory } from "@/types";
import { LOCATIONS } from "@/lib/locations";
import type { ParsedTaskSentence } from "@/features/task-suggestions";

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

interface LanguageModelSession {
  prompt(
    input: string,
    options?: { responseConstraint?: unknown; signal?: AbortSignal },
  ): Promise<string>;
  destroy?: () => void;
}

interface LanguageModelApi {
  availability?: () => Promise<Availability>;
  create?: (options?: Record<string, unknown>) => Promise<LanguageModelSession>;
}

interface LocalAiWindow {
  LanguageModel?: LanguageModelApi;
  ai?: { languageModel?: LanguageModelApi };
}

export interface LocalLlmStatus {
  supported: boolean;
  ready: boolean;
  state: Availability | "unsupported";
  label: string;
  detail: string;
}

function api(): LanguageModelApi | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as LocalAiWindow;
  const candidate = scope.LanguageModel ?? scope.ai?.languageModel;
  return candidate?.create ? candidate : undefined;
}

export async function getLocalLlmStatus(): Promise<LocalLlmStatus> {
  const model = api();
  if (!model) {
    return {
      supported: false,
      ready: false,
      state: "unsupported",
      label: "Local rules",
      detail: "This browser has no on-device model, so the deterministic parser fills the form.",
    };
  }
  try {
    const state = (await model.availability?.()) ?? "available";
    if (state === "available") {
      return {
        supported: true,
        ready: true,
        state,
        label: "On-device model ready",
        detail: "Chrome's built-in model runs locally. Your sentence never leaves this device.",
      };
    }
    if (state === "downloadable" || state === "downloading") {
      return {
        supported: true,
        ready: false,
        state,
        label: state === "downloadable" ? "On-device model can download" : "On-device model downloading",
        detail:
          "Chrome will fetch its local model once. Until it's ready, the deterministic parser fills the form.",
      };
    }
  } catch {
    // Fall through to the unsupported state.
  }
  return {
    supported: false,
    ready: false,
    state: "unavailable",
    label: "Local rules",
    detail: "The on-device model isn't available here, so the deterministic parser fills the form.",
  };
}

const CATEGORIES: TaskCategory[] = [
  "delivery",
  "errands",
  "tutoring",
  "tech",
  "moving",
  "other",
];

const LOCATION_LIST = LOCATIONS.map(
  (location) => `${location.id} (${location.name}; aka ${location.shortLabel})`,
).join("; ");

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    locationId: { type: "string" },
    dropoffLocationId: { type: "string" },
    deadlineISO: { type: "string" },
    estimatedMinutes: { type: "number" },
    rewardCents: { type: "number" },
  },
  required: ["title", "category", "estimatedMinutes"],
};

function buildPrompt(text: string, nowIso: string): string {
  return `You extract a campus task request into JSON. Do not invent details.

Allowed categories: ${CATEGORIES.join(", ")}.
Allowed location ids: ${LOCATION_LIST}.
Current local time: ${nowIso}.

Rules:
- "locationId" is the pickup (or the single place); "dropoffLocationId" only for deliveries.
- "deadlineISO" must be an ISO timestamp in the future, or omit it.
- "estimatedMinutes" is 5-240 minutes of actual work.
- "rewardCents" is the dollar amount in cents, or omit it.
- "title" is a short imperative title, at most 90 characters.
- Return ONLY the JSON object.

Request: ${JSON.stringify(text)}`;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitize(raw: string, text: string, now: Date): ParsedTaskSentence | null {
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

  let deadline: string | undefined;
  if (typeof data.deadlineISO === "string") {
    const date = new Date(data.deadlineISO);
    if (!Number.isNaN(date.getTime()) && date.getTime() > now.getTime() + 5 * 60_000) {
      deadline = date.toISOString();
    }
  }

  const estimatedMinutes = Math.min(240, Math.max(5, Math.round(num(data.estimatedMinutes) ?? 20)));
  const reward = num(data.rewardCents);
  const rewardCents =
    reward && reward >= 100 && reward <= 100_000 ? Math.round(reward / 50) * 50 : undefined;
  const title = str(data.title)?.slice(0, 90) ?? text.slice(0, 90);

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: str(data.description) ?? text,
    category,
    locationId,
    dropoffLocationId: dropoffLocationId && dropoffLocationId !== locationId ? dropoffLocationId : undefined,
    deadline,
    estimatedMinutes,
    rewardCents,
    confidence: locationId && deadline && rewardCents ? "high" : locationId || deadline ? "medium" : "low",
    source: "local-llm",
    notes: ["Filled by the on-device model in this browser."],
  };
}

/** Returns null when no local model exists, so callers can use the rules. */
export async function parseTaskWithLocalLlm(
  text: string,
  options: { now?: Date } = {},
): Promise<ParsedTaskSentence | null> {
  const model = api();
  const create = model?.create;
  if (!model || !create) return null;
  const now = options.now ?? new Date();
  let session: LanguageModelSession | undefined;
  try {
    session = await create({
      temperature: 0.1,
      topK: 1,
      initialPrompts: [
        {
          role: "system",
          content:
            "You turn short task requests into structured JSON for a campus task app. Be literal and concise.",
        },
      ],
    });
    const response = await session.prompt(buildPrompt(text, now.toISOString()), {
      responseConstraint: SCHEMA,
      signal: AbortSignal.timeout(120_000),
    });
    return sanitize(response, text, now);
  } catch {
    return null;
  } finally {
    try {
      session?.destroy?.();
    } catch {
      // Nothing to clean up.
    }
  }
}
