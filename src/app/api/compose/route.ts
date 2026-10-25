import { NextResponse } from "next/server";
import { LOCATIONS } from "@/lib/locations";

/**
 * Sentence → structured task, using Groq.
 *
 * The key stays on the server. The client sends one sentence and gets back the
 * model's JSON, which it validates before touching the form; when this route is
 * unreachable or the upstream fails, the client falls back to the deterministic
 * parser, so the composer keeps working offline.
 */

export const dynamic = "force-dynamic";

/**
 * Groq's catalogue depends on the account, so a model can disappear or be
 * missing access. Each entry is tried in order; a 404 falls through to the next
 * instead of failing the request.
 *
 * Quality first, price second: qwen reads this kind of request best (right
 * category, offset-aware deadlines, sensible durations) at $0.80 in / $4.00 out
 * per million tokens, and gpt-oss-120b is the strong cheaper fallback at
 * $0.15 / $0.60. gpt-oss-20b ($0.075 / $0.30) is the budget last resort.
 *
 * Llama 3.1 8B Instant is Enterprise-only since August 2026 ("Contact Sales",
 * 404 on Free/Developer keys), so it sits last and only serves keys that have
 * it. Override the whole chain with GROQ_MODELS.
 */
const DEFAULT_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

function models(): string[] {
  const configured = process.env.GROQ_MODELS?.trim();
  if (!configured) return DEFAULT_MODELS;
  const list = configured
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .slice(0, 4);
  return list.length > 0 ? list : DEFAULT_MODELS;
}

const MODEL_OPTIONS: Record<string, Record<string, unknown>> = {
  // gpt-oss spends its budget on hidden reasoning first; with the default it
  // can return an empty message and fail JSON validation.
  "openai/gpt-oss-20b": { reasoning_effort: "low" },
  "openai/gpt-oss-120b": { reasoning_effort: "low" },
};

const CATEGORIES = ["delivery", "errands", "tutoring", "tech", "moving", "other"];

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    locationId: nullableString,
    dropoffLocationId: nullableString,
    deadlineISO: nullableString,
    estimatedMinutes: { type: "integer" },
    rewardCents: { anyOf: [{ type: "integer" }, { type: "null" }] },
  },
  required: [
    "title",
    "category",
    "locationId",
    "dropoffLocationId",
    "deadlineISO",
    "estimatedMinutes",
    "rewardCents",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You extract one campus task request into JSON for a task app. Copy only what the request says. rewardCents is integer cents, so $8 is 800. Use null for anything the request does not state.";

function userPrompt(text: string, localTime: string): string {
  const places = LOCATIONS.map((location) => `${location.id} (${location.name})`).join(", ");
  return [
    `Allowed categories: ${CATEGORIES.join(", ")}.`,
    `Allowed location ids: ${places}.`,
    `Current local time: ${localTime}.`,
    "",
    `Request: ${JSON.stringify(text)}`,
  ].join("\n");
}

// Small in-memory limiter: this route spends the owner's Groq quota, so one
// client cannot hammer it. Resets with the server, which is fine for a demo.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) {
    for (const [id, times] of hits) {
      if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(id);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.GROQ_API_KEY),
    models: models(),
  });
}

export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      { configured: false, message: "Groq isn't configured; the local parser fills the form." },
      { status: 503 },
    );
  }
  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { configured: true, message: "Too many requests; the local parser fills the form." },
      { status: 429 },
    );
  }

  let body: { text?: unknown; localTime?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; localTime?: unknown };
  } catch {
    return NextResponse.json({ message: "Send JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 8 || text.length > 400) {
    return NextResponse.json(
      { message: "Describe the task in one sentence." },
      { status: 400 },
    );
  }
  const localTime =
    typeof body.localTime === "string" && body.localTime.length < 80
      ? body.localTime
      : new Date().toString();

  let lastError = "Groq is unreachable.";
  for (const model of models()) {
    const startedAt = Date.now();
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          ...MODEL_OPTIONS[model],
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt(text, localTime) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "task", schema: SCHEMA },
          },
        }),
        signal: AbortSignal.timeout(6_000),
      });

      if (!response.ok) {
        lastError = `Groq returned ${response.status} for ${model}.`;
        // A missing model is worth retrying with the next one; a rate limit or
        // a bad key is not, because every model will answer the same way.
        if (response.status === 401 || response.status === 429) break;
        continue;
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        lastError = `${model} returned an empty answer.`;
        continue;
      }
      try {
        JSON.parse(content);
      } catch {
        lastError = `${model} returned text that isn't JSON.`;
        continue;
      }
      return NextResponse.json({
        configured: true,
        model,
        raw: content,
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      lastError =
        error instanceof Error && error.name === "TimeoutError"
          ? `${model} timed out.`
          : "Groq is unreachable.";
    }
  }

  return NextResponse.json({ configured: true, message: lastError }, { status: 502 });
}
