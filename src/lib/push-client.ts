/** Web Push helpers. The browser keeps one subscription per device. */

export const PUSH_SUBSCRIPTION_KEY = "doro.push.subscription";
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushState =
  | "unsupported"
  | "unconfigured"
  | "off"
  | "subscribed"
  | "denied";

export interface PushStatus {
  state: PushState;
  detail: string;
}

export interface LocalPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) {
    return {
      state: "unsupported",
      detail: "This browser doesn't support service-worker push.",
    };
  }
  if (!VAPID_PUBLIC_KEY) {
    return {
      state: "unconfigured",
      detail: "Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable push.",
    };
  }
  const subscription = await currentSubscription();
  if (Notification.permission === "denied") {
    return {
      state: "denied",
      detail: "Notifications are blocked for this site in your browser settings.",
    };
  }
  if (subscription && Notification.permission === "granted") {
    return {
      state: "subscribed",
      detail: "This device receives push while Doro is in the background.",
    };
  }
  return {
    state: "off",
    detail: "Push is off. In-app notifications still work.",
  };
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "Push isn't supported in this browser." };
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, error: "The server has no VAPID public key configured." };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission wasn't granted." };
  }

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    window.localStorage.setItem(PUSH_SUBSCRIPTION_KEY, JSON.stringify(subscription.toJSON()));
    return { ok: true };
  } catch {
    return { ok: false, error: "The push subscription couldn't be created." };
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Keep the UI responsive even if the browser holds a stale subscription.
  }
  try {
    window.localStorage.removeItem(PUSH_SUBSCRIPTION_KEY);
  } catch {
    // Ignore private-mode storage failures.
  }
}

/** Sends through the local server so the VAPID private key stays server-side. */
export async function sendLocalPush(payload: LocalPushPayload): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(PUSH_SUBSCRIPTION_KEY);
  } catch {
    return false;
  }
  if (!stored) return false;
  try {
    const subscription = JSON.parse(stored) as unknown;
    const response = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, payload }),
    });
    if (response.ok) return true;
    if (response.status === 410) {
      window.localStorage.removeItem(PUSH_SUBSCRIPTION_KEY);
    }
  } catch {
    // In-app notifications already cover the failure.
  }
  return false;
}
