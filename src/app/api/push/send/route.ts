import { NextResponse } from "next/server";
import webpush from "web-push";

/**
 * Sends one web push to the subscription supplied by this browser.
 *
 * The VAPID private key stays on the server. Subscriptions are per device, so
 * no account lookup is needed in this zero-auth demo. Endpoints are restricted
 * to known push services to avoid using the route as an SSRF proxy.
 */

export const dynamic = "force-dynamic";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:team@doro.local";

const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  ".notify.windows.com",
];

interface PushSubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

function validEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return PUSH_HOST_SUFFIXES.some(
      (suffix) => url.hostname === suffix.replace(/^\./, "") || url.hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    return NextResponse.json(
      { message: "Web push is not configured. Set the VAPID keys and restart." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Send JSON." }, { status: 400 });
  }

  const subscription = (body as { subscription?: PushSubscriptionBody })?.subscription;
  const payload = (body as { payload?: { title?: unknown; body?: unknown; url?: unknown; tag?: unknown } })
    ?.payload;
  const endpoint = subscription?.endpoint;
  if (
    typeof endpoint !== "string" ||
    !validEndpoint(endpoint) ||
    typeof subscription?.keys?.p256dh !== "string" ||
    typeof subscription?.keys?.auth !== "string"
  ) {
    return NextResponse.json({ message: "Invalid push subscription." }, { status: 400 });
  }
  if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") {
    return NextResponse.json({ message: "A title and body are required." }, { status: 400 });
  }

  const url =
    typeof payload.url === "string" && payload.url.startsWith("/")
      ? payload.url.slice(0, 200)
      : "/notifications";
  const title = payload.title.slice(0, 120);
  const bodyText = payload.body.slice(0, 240);
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 80) : "doro-update";

  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    await webpush.sendNotification(
      {
        endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify({ title, body: bodyText, url, tag }),
      { TTL: 3_600, urgency: "normal" },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return NextResponse.json({ expired: true }, { status: 410 });
    }
    return NextResponse.json({ message: "Push delivery failed." }, { status: 502 });
  }
}
