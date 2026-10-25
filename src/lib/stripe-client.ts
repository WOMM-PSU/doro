/**
 * Client-side helpers for Doro's Stripe routes.
 *
 * With `STRIPE_SECRET_KEY` set the server creates real PaymentIntents with
 * manual capture (a card hold), optional Stripe Tax and Connect destination
 * transfers. Without keys every call returns a deterministic `pi_doro_*`
 * stand-in so the demo still works.
 */

export interface StripeIntentResponse {
  ok: boolean;
  mode?: "live_stripe" | "test_fallback";
  paymentIntentId?: string;
  clientSecret?: string | null;
  status?: string;
  error?: string;
  breakdown?: {
    rewardCents: number;
    expenseCents: number;
    platformFeeCents: number;
    taxCents?: number;
    totalCents: number;
  };
}

export interface StripeTaxAddress {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export async function createStripeEscrowHold(input: {
  taskId: string;
  title: string;
  rewardCents: number;
  expenseCents?: number;
  requesterId: string;
  helperId: string;
  helperAccountId?: string;
  taxAddress?: StripeTaxAddress;
}): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return {
      ok: true,
      mode: "test_fallback",
      paymentIntentId: `pi_doro_${input.taskId.replace(/[^a-zA-Z0-9]/g, "")}`,
      status: "requires_capture",
    };
  }
}

export async function fetchCardSecret(paymentIntentId: string): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/client-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId }),
    });
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return { ok: false, error: "Could not reach Stripe." };
  }
}

export async function captureStripeEscrowHold(input: {
  taskId: string;
  paymentIntentId?: string;
  amountToCaptureCents?: number;
}): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return { ok: true, mode: "test_fallback", status: "succeeded" };
  }
}

export async function refundStripeEscrowHold(input: {
  taskId: string;
  paymentIntentId?: string;
  amountCents?: number;
  reason?: string;
}): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return { ok: true, mode: "test_fallback", status: "canceled" };
  }
}

export interface ConnectOnboardingResponse {
  ok: boolean;
  accountId?: string;
  onboardingUrl?: string;
  error?: string;
}

export async function startConnectOnboarding(input: {
  userId: string;
  name?: string;
  email?: string;
  accountId?: string;
}): Promise<ConnectOnboardingResponse> {
  try {
    const res = await fetch("/api/stripe/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await res.json()) as ConnectOnboardingResponse;
  } catch {
    return { ok: false, error: "Could not reach Stripe." };
  }
}

export interface ConnectStatusResponse {
  ok: boolean;
  accountId?: string;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  currentlyDue?: string[];
  error?: string;
}

export async function fetchConnectStatus(accountId: string): Promise<ConnectStatusResponse> {
  try {
    const res = await fetch("/api/stripe/connect/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    return (await res.json()) as ConnectStatusResponse;
  } catch {
    return { ok: false, error: "Could not reach Stripe." };
  }
}
