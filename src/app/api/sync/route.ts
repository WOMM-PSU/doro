import { NextResponse } from "next/server";
import type { DemoState } from "@/types";

/**
 * Optional Supabase snapshot sync.
 *
 * Without SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY the route reports that
 * cloud sync is unavailable and the app stays on localStorage. With both set,
 * a single workspace document is read and written with optimistic
 * last-write-wins checks. The service key never reaches the browser.
 */

export const dynamic = "force-dynamic";

const WORKSPACE = process.env.SUPABASE_WORKSPACE?.trim() || "campus";

function config() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function restHeaders(key: string, extra: Record<string, string> = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function isUsableState(value: unknown): value is DemoState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<DemoState>;
  return (
    typeof state.version === "number" &&
    typeof state.updatedAt === "string" &&
    Array.isArray(state.users) &&
    state.users.length > 0 &&
    Array.isArray(state.tasks) &&
    Array.isArray(state.offers) &&
    Array.isArray(state.messages) &&
    Array.isArray(state.notifications) &&
    Array.isArray(state.reviews) &&
    Array.isArray(state.reports) &&
    Array.isArray(state.payments) &&
    Array.isArray(state.events)
  );
}

export async function GET() {
  const settings = config();
  if (!settings) {
    return NextResponse.json(
      { configured: false, message: "Supabase is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `${settings.url}/rest/v1/doro_state?workspace=eq.${encodeURIComponent(
        WORKSPACE,
      )}&select=state,revision,updated_at&limit=1`,
      {
        headers: restHeaders(settings.key),
        cache: "no-store",
      },
    );
    if (response.status === 404) {
      return NextResponse.json(
        {
          configured: true,
          state: null,
          revision: 0,
          message: "The doro_state table is missing. Run supabase/schema.sql.",
        },
        { status: 503 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { configured: true, state: null, revision: 0, message: "Supabase read failed." },
        { status: 502 },
      );
    }
    const rows = (await response.json()) as { state: unknown; revision: number }[];
    const row = rows[0];
    if (!row || !isUsableState(row.state)) {
      return NextResponse.json({ configured: true, state: null, revision: 0 });
    }
    return NextResponse.json({
      configured: true,
      state: row.state,
      revision: row.revision ?? 1,
    });
  } catch {
    return NextResponse.json(
      { configured: true, message: "Supabase is unreachable." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const settings = config();
  if (!settings) {
    return NextResponse.json(
      { configured: false, message: "Supabase is not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Send JSON." }, { status: 400 });
  }
  const state = (body as { state?: unknown })?.state;
  if (!isUsableState(state)) {
    return NextResponse.json({ message: "Invalid state document." }, { status: 400 });
  }

  const rowUrl = `${settings.url}/rest/v1/doro_state?workspace=eq.${encodeURIComponent(
    WORKSPACE,
  )}&select=state,revision,updated_at&limit=1`;

  try {
    const currentResponse = await fetch(rowUrl, {
      headers: restHeaders(settings.key),
      cache: "no-store",
    });
    if (!currentResponse.ok) {
      return NextResponse.json(
        { message: "Cloud sync is not set up. Run supabase/schema.sql." },
        { status: 503 },
      );
    }
    const rows = (await currentResponse.json()) as {
      state: unknown;
      revision: number;
      updated_at?: string;
    }[];
    const current = rows[0];
    if (
      current &&
      isUsableState(current.state) &&
      new Date(current.state.updatedAt).getTime() > new Date(state.updatedAt).getTime()
    ) {
      return NextResponse.json(
        {
          configured: true,
          conflict: true,
          state: current.state,
          revision: current.revision ?? 1,
        },
        { status: 409 },
      );
    }

    const revision = (current?.revision ?? 0) + 1;
    const upsert = await fetch(
      `${settings.url}/rest/v1/doro_state?on_conflict=workspace`,
      {
        method: "POST",
        headers: restHeaders(settings.key, {
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify([
          {
            workspace: WORKSPACE,
            state,
            revision,
            updated_at: new Date().toISOString(),
          },
        ]),
        cache: "no-store",
      },
    );
    if (!upsert.ok) {
      return NextResponse.json(
        { message: "Supabase write failed." },
        { status: 502 },
      );
    }
    return NextResponse.json({ configured: true, revision, state });
  } catch {
    return NextResponse.json(
      { configured: true, message: "Supabase is unreachable." },
      { status: 502 },
    );
  }
}
