import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/compose/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function groqReply(content: string): Response {
  return Response.json({ choices: [{ message: { content } }] });
}

const VALID =
  '{"title":"Move mini fridge to Pollock Halls","category":"moving","locationId":null,"dropoffLocationId":"pollock-halls","deadlineISO":null,"estimatedMinutes":30,"rewardCents":2500}';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("compose route", () => {
  it("reports whether a key is configured without calling Groq", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ configured: false });

    vi.stubEnv("GROQ_API_KEY", "test-key");
    const configured = await GET();
    const payload = (await configured.json()) as { configured: boolean; models: string[] };
    expect(payload.configured).toBe(true);
    // Best reader first, then the cheaper fallbacks, enterprise-only Llama last.
    expect(payload.models).toEqual([
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.1-8b-instant",
    ]);
  });

  it("answers 503 without a key so the client keeps using the rules", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const response = await POST(request({ text: "Move a mini fridge to Pollock Halls" }));
    expect(response.status).toBe(503);
  });

  it("returns the model's JSON and the model that produced it", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(groqReply(VALID));
    const response = await POST(request({ text: "Move a mini fridge to Pollock Halls for $25" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      configured: true,
      model: "qwen/qwen3.8-27b",
      raw: VALID,
    });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string;
      reasoning_effort?: string;
      response_format: { type: string };
    };
    expect(sent.model).toBe("qwen/qwen3.8-27b");
    expect(sent.reasoning_effort).toBeUndefined();
    expect(sent.response_format.type).toBe("json_schema");
  });

  it("falls through to the next model when one is unavailable", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(groqReply(VALID));

    const response = await POST(request({ text: "Move a mini fridge to Pollock Halls for $25" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ model: "openai/gpt-oss-120b" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers 502 when every model fails, so the client falls back", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    const response = await POST(request({ text: "Move a mini fridge to Pollock Halls for $25" }));
    expect(response.status).toBe(502);
  });

  it("honours a GROQ_MODELS override", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("GROQ_MODELS", " openai/gpt-oss-120b , openai/gpt-oss-20b ");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(groqReply(VALID));
    const response = await POST(request({ text: "Move a mini fridge to Pollock Halls for $25" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ model: "openai/gpt-oss-120b" });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { model: string };
    expect(sent.model).toBe("openai/gpt-oss-120b");

    const list = (await (await GET()).json()) as { models: string[] };
    expect(list.models).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });

  it("rejects a fragment before spending a request", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ text: "help" }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
