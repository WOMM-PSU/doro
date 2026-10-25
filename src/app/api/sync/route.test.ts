import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/features/seed";
import { GET, POST } from "@/app/api/sync/route";

function configure() {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
}

function request(state: unknown): Request {
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sync route", () => {
  it("reports local-only mode when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ configured: false });
  });

  it("writes the workspace document and returns a new revision", async () => {
    configure();
    const state = createSeedState(new Date("2026-10-25T12:00:00.000Z"));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ revision: 1 }]));

    const response = await POST(request(state));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ configured: true, revision: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      workspace: string;
      state: { updatedAt: string };
    }[];
    expect(body[0].workspace).toBe("campus");
    expect(body[0].state.updatedAt).toBe(state.updatedAt);
  });

  it("returns the newer remote state instead of overwriting it", async () => {
    configure();
    const local = createSeedState(new Date("2026-10-25T12:00:00.000Z"));
    const remote = createSeedState(new Date("2026-10-25T13:00:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json([{ state: remote, revision: 4 }]),
    );

    const response = await POST(request(local));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      conflict: true,
      revision: 4,
      state: { updatedAt: remote.updatedAt },
    });
  });

  it("rejects malformed state before touching Supabase", async () => {
    configure();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ users: [] }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
